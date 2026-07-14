// ==================== APPROVAL ENGINE (Phase 4B) ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { allocateRequestNumber } from './requestNumbers.js';
import {
  REQUEST_TYPES,
  isFinalStatus,
  isActiveStatus,
  clarifyRoleFromStatus,
  getUserApprovalRoleCodes,
  userCanActOnRequest,
  canCancelRequest
} from './approvalAccess.js';
import { approveOhfTransfer } from './transferActions.js';
import { mapApprovalToBudgetStatus } from './budgetStatus.js';

/** Resolve flow steps for request type / team / user (highest priority match). */
export async function resolveFlowSteps(requestType, teamId = null, userId = null) {
  const { data: flows, error } = await supabaseClient
    .from('approval_flow_definitions')
    .select(`
      id, request_type, team_id, user_id, priority,
      approval_flow_steps ( step_order, role_code, is_final )
    `)
    .eq('request_type', requestType)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (error) throw error;

  const list = flows || [];
  const match =
    list.find(f => f.team_id === teamId && f.user_id === userId) ||
    list.find(f => f.team_id === teamId && !f.user_id) ||
    list.find(f => !f.team_id && f.user_id === userId) ||
    list.find(f => !f.team_id && !f.user_id);

  if (!match) return [];

  return (match.approval_flow_steps || [])
    .sort((a, b) => a.step_order - b.step_order);
}

async function insertMessage(requestId, body) {
  const text = String(body || '').trim();
  if (!text) return;

  const { error } = await supabaseClient.from('approval_messages').insert({
    request_id: requestId,
    author_id: state.user.id,
    body: text
  });
  if (error) throw error;
}

/** One Kailasa home notification for the role that must act next. */
async function notifyRoleForRequest(request, roleCode, title, body) {
  if (!roleCode) return;
  try {
    const { error } = await supabaseClient.rpc('notify_approval_actors', {
      p_team_id: request.team_id || null,
      p_role_code: String(roleCode).toUpperCase(),
      p_title: title,
      p_body: body || '',
      p_exclude_user_id: state.user?.id || null,
      p_action_page: 'approval-portal',
      p_action_id: request.id || null
    });
    if (error) console.warn('notify_approval_actors:', error.message);
  } catch (err) {
    console.warn('notify_approval_actors:', err?.message || err);
  }
}

async function notifyUserForRequest(userId, request, title, body) {
  if (!userId) return;
  try {
    const { error } = await supabaseClient.rpc('notify_ok_user', {
      p_user_id: userId,
      p_title: title,
      p_body: body || '',
      p_team_id: request?.team_id || null,
      p_action_page: 'approval-portal',
      p_action_id: request?.id || null
    });
    if (error) console.warn('notify_ok_user:', error.message);
  } catch (err) {
    console.warn('notify_ok_user:', err?.message || err);
  }
}

async function updateRequest(requestId, patch) {
  const { data, error } = await supabaseClient
    .from('approval_requests')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function applyBudgetStatus(budgetPlanId, approvalStatus, requestId = null) {
  if (!budgetPlanId) return;
  const patch = { approval_status: approvalStatus };
  if (requestId) patch.approval_request_id = requestId;
  const lifecycle = mapApprovalToBudgetStatus(approvalStatus);
  if (lifecycle) patch.status = lifecycle;

  await supabaseClient.from('budget_plans').update(patch).eq('id', budgetPlanId);

  const local = (state.budgetPlans || []).find(b => b.id === budgetPlanId);
  if (local) {
    local.approval_status = approvalStatus;
    if (lifecycle) local.status = lifecycle;
    if (requestId) local.approval_request_id = requestId;
  }
}

async function onTransferRequestCompleted(request) {
  if (!request.transfer_id) return;
  if (request.request_type !== REQUEST_TYPES.MONEY_TRANSFER) return;

  try {
    await approveOhfTransfer(request.transfer_id);
  } catch (err) {
    console.warn('Transfer OHF sync:', err.message);
  }
}

async function onReconciliationRequestCompleted(request) {
  if (request.request_type !== REQUEST_TYPES.RECONCILIATION_ADJUSTMENT) return;

  const { error } = await supabaseClient.rpc('apply_reconciliation_adjustment_request', {
    p_request_id: request.id
  });
  if (error) throw error;
}

async function onReconciliationRequestRejected(request) {
  if (request.request_type !== REQUEST_TYPES.RECONCILIATION_ADJUSTMENT) return;

  const { error } = await supabaseClient.rpc('reject_reconciliation_adjustment_request', {
    p_request_id: request.id
  });
  if (error) console.warn('reject_reconciliation_adjustment_request:', error);
}

function firstStep(steps) {
  return steps?.[0] || null;
}

function nextStep(steps, currentOrder) {
  const idx = (steps || []).findIndex(s => s.step_order === currentOrder);
  if (idx < 0 || idx >= steps.length - 1) return null;
  return steps[idx + 1];
}

function stepByOrder(steps, order) {
  return (steps || []).find(s => s.step_order === order) || null;
}

/** Create and submit a budget approval request. */
export async function submitBudgetForApproval(budget) {
  if (!budget?.id || !state.user?.id) throw new Error('Invalid budget');
  const teamId = budget.team_id || state.currentTeam?.team_id;

  const steps = await resolveFlowSteps(REQUEST_TYPES.BUDGET, teamId);
  if (!steps.length) throw new Error('No approval flow configured for budgets');

  const existing = budget.approval_request_id;
  let prior = null;
  if (existing) {
    const { data } = await supabaseClient
      .from('approval_requests')
      .select('id, status')
      .eq('id', existing)
      .maybeSingle();
    prior = data;
    if (prior && isActiveStatus(prior.status) && prior.status !== 'DRAFT') {
      throw new Error('This budget already has an active approval request');
    }
  }

  const requestNumber = await allocateRequestNumber(state.user.id);
  const totalUsd = (budget.categories || []).reduce(
    (sum, c) => sum + (parseFloat(c.usdAmount || c.usd_amount) || 0),
    0
  );

  const step = firstStep(steps);

  if (prior?.status === 'DRAFT') {
    const updated = await updateRequest(prior.id, {
      status: 'SUBMITTED',
      title: budget.name || 'Budget',
      amount_usd: totalUsd,
      current_step_order: step.step_order,
      current_role_code: step.role_code,
      step_approved: false,
      rejected_at: null,
      completed_at: null
    });
    await applyBudgetStatus(budget.id, 'SUBMITTED', prior.id);
    await notifyRoleForRequest(
      updated,
      step.role_code,
      `Budget approval needed: ${budget.name || 'Budget'}`,
      `${updated.request_number || prior.request_number} is waiting for ${step.role_code} review.`
    );
    return updated;
  }

  const payload = {
    request_number: requestNumber,
    request_type: REQUEST_TYPES.BUDGET,
    team_id: teamId,
    status: 'SUBMITTED',
    title: budget.name || 'Budget',
    amount_usd: totalUsd,
    created_by: state.user.id,
    budget_plan_id: budget.id,
    current_step_order: step.step_order,
    current_role_code: step.role_code,
    step_approved: false,
    is_deleted: false
  };

  const { data, error } = await supabaseClient
    .from('approval_requests')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;

  await applyBudgetStatus(budget.id, 'SUBMITTED', data.id);
  await notifyRoleForRequest(
    data,
    step.role_code,
    `Budget approval needed: ${budget.name || 'Budget'}`,
    `${data.request_number} is waiting for ${step.role_code} review.`
  );
  return data;
}

/** Create approval request to align bucket balances with reconciled actual counts. */
export async function submitReconciliationAdjustment(lineIds, teamId) {
  const ids = [...new Set((lineIds || []).filter(Boolean))];
  if (!ids.length) throw new Error('Select at least one mismatched bucket');
  if (!teamId) throw new Error('Team is required');

  const { data: lines, error: linesErr } = await supabaseClient
    .from('reconciliation_lines')
    .select(`
      id, bucket_id, bucket_name, currency,
      closing_balance, actual_balance, difference, usd_equivalent, comments,
      adjustment_status, submission_id,
      reconciliation_submissions!inner ( id, team_id, reconciliation_date, is_deleted )
    `)
    .in('id', ids);

  if (linesErr) throw linesErr;

  const valid = (lines || []).filter(line => {
    const sub = line.reconciliation_submissions;
    if (!sub || sub.is_deleted || sub.team_id !== teamId) return false;
    const diff = Math.abs(parseFloat(line.difference) || 0);
    if (diff < 0.01) return false;
    const status = String(line.adjustment_status || '').toLowerCase();
    if (status === 'pending' || status === 'approved') return false;
    return true;
  });

  if (!valid.length) {
    throw new Error('No eligible mismatched buckets — they may already be pending or approved');
  }

  const steps = await resolveFlowSteps(REQUEST_TYPES.RECONCILIATION_ADJUSTMENT, teamId);
  if (!steps.length) throw new Error('No approval flow configured for reconciliation adjustments');

  const requestNumber = await allocateRequestNumber(state.user.id);
  const amountUsd = valid.reduce((sum, line) => {
    const usd = parseFloat(line.usd_equivalent);
    const diff = Math.abs(parseFloat(line.difference) || 0);
    return sum + (Number.isFinite(usd) ? Math.abs(usd) : diff);
  }, 0);

  const dates = [...new Set(valid.map(l => l.reconciliation_submissions.reconciliation_date))].sort();
  const dateLabel = dates.length === 1 ? dates[0] : `${dates[0]} – ${dates[dates.length - 1]}`;
  const step = firstStep(steps);

  const payload = {
    request_number: requestNumber,
    request_type: REQUEST_TYPES.RECONCILIATION_ADJUSTMENT,
    team_id: teamId,
    status: 'SUBMITTED',
    title: `Recon adjustment — ${valid.length} bucket${valid.length === 1 ? '' : 's'} (${dateLabel})`,
    amount_usd: amountUsd,
    created_by: state.user.id,
    reconciliation_submission_id: valid.length === 1 ? valid[0].submission_id : null,
    current_step_order: step.step_order,
    current_role_code: step.role_code,
    step_approved: false,
    is_deleted: false
  };

  const { data: request, error: reqErr } = await supabaseClient
    .from('approval_requests')
    .insert(payload)
    .select('*')
    .single();

  if (reqErr) throw reqErr;

  const linkRows = valid.map(line => ({
    request_id: request.id,
    reconciliation_line_id: line.id,
    reconciliation_submission_id: line.submission_id,
    bucket_id: line.bucket_id,
    bucket_name: line.bucket_name,
    currency: line.currency,
    closing_balance: line.closing_balance,
    actual_balance: line.actual_balance,
    difference: line.difference,
    usd_equivalent: line.usd_equivalent,
    comments: line.comments
  }));

  const { error: linkErr } = await supabaseClient
    .from('approval_request_reconciliation_lines')
    .insert(linkRows);

  if (linkErr) throw linkErr;

  const { error: pendingErr } = await supabaseClient.rpc('mark_reconciliation_adjustment_pending', {
    p_line_ids: valid.map(l => l.id)
  });
  if (pendingErr) throw pendingErr;

  return request;
}

export async function loadReconciliationRequestLines(requestId) {
  const { data, error } = await supabaseClient
    .from('approval_request_reconciliation_lines')
    .select('*')
    .eq('request_id', requestId)
    .order('bucket_name');

  if (error) throw error;
  return data || [];
}

/** Create approval request for cross-team money transfer. */
export async function createTransferApprovalRequest(transfer) {
  if (!transfer?.id) return null;

  const steps = await resolveFlowSteps(REQUEST_TYPES.MONEY_TRANSFER, transfer.team_id);
  if (!steps.length) return null;

  const requestNumber = await allocateRequestNumber(transfer.created_by || state.user.id);
  const step = firstStep(steps);
  const amount = parseFloat(transfer.amount) || 0;

  const payload = {
    request_number: requestNumber,
    request_type: REQUEST_TYPES.MONEY_TRANSFER,
    team_id: transfer.team_id,
    status: 'SUBMITTED',
    title: `Transfer ${amount.toFixed(2)} ${transfer.currency || 'USD'}`,
    amount_usd: amount,
    created_by: transfer.created_by || state.user.id,
    transfer_id: transfer.id,
    current_step_order: step.step_order,
    current_role_code: step.role_code,
    step_approved: false,
    is_deleted: false
  };

  const { data, error } = await supabaseClient
    .from('approval_requests')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    console.warn('createTransferApprovalRequest:', error);
    return null;
  }
  return data;
}

async function advanceAfterSend(request, steps) {
  const current = stepByOrder(steps, request.current_step_order);
  if (!current) throw new Error('Invalid flow step');

  const role = String(current.role_code).toUpperCase();
  const following = nextStep(steps, request.current_step_order);

  if (current.is_final || !following) {
    const finalStatus = `${role}-APPROVED`;
    const updated = await updateRequest(request.id, {
      status: finalStatus,
      current_step_order: current.step_order,
      current_role_code: null,
      step_approved: false,
      completed_at: new Date().toISOString()
    });

    if (request.request_type === REQUEST_TYPES.BUDGET && request.budget_plan_id) {
      await applyBudgetStatus(request.budget_plan_id, finalStatus, request.id);
    }
    if (request.request_type === REQUEST_TYPES.MONEY_TRANSFER) {
      await onTransferRequestCompleted(updated);
    }
    if (request.request_type === REQUEST_TYPES.RECONCILIATION_ADJUSTMENT) {
      await onReconciliationRequestCompleted(updated);
    }
    await notifyUserForRequest(
      request.created_by,
      updated,
      `Approved: ${request.title || request.request_number}`,
      `${request.request_number} was fully approved.`
    );
    return updated;
  }

  const reviewedStatus = `${role}-REVIEWED`;
  const updated = await updateRequest(request.id, {
    status: reviewedStatus,
    current_step_order: following.step_order,
    current_role_code: following.role_code,
    step_approved: false
  });

  if (request.request_type === REQUEST_TYPES.BUDGET && request.budget_plan_id) {
    await applyBudgetStatus(request.budget_plan_id, reviewedStatus, request.id);
  }

  await notifyRoleForRequest(
    updated,
    following.role_code,
    `Approval needed: ${request.title || request.request_number}`,
    `${request.request_number} is waiting for ${following.role_code} review.`
  );

  return updated;
}

export async function approveRequest(requestId, message = '') {
  const request = await loadRequest(requestId);
  if (!(await userCanActOnRequest(request))) {
    throw new Error('You are not authorized to approve this request');
  }

  await insertMessage(requestId, message);

  return updateRequest(requestId, { step_approved: true });
}

export async function approveAndSendRequest(requestId, message = '') {
  const request = await loadRequest(requestId);
  if (!(await userCanActOnRequest(request))) {
    throw new Error('You are not authorized to act on this request');
  }

  const steps = await resolveFlowSteps(request.request_type, request.team_id);
  await insertMessage(requestId, message || 'Approved and sent forward');

  await updateRequest(requestId, { step_approved: true });
  const refreshed = await loadRequest(requestId);
  return advanceAfterSend(refreshed, steps);
}

export async function sendApprovedRequest(requestId, message = '') {
  const request = await loadRequest(requestId);
  if (!(await userCanActOnRequest(request))) {
    throw new Error('You are not authorized to send this request');
  }
  if (!request.step_approved) {
    throw new Error('Approve the request before sending');
  }

  const steps = await resolveFlowSteps(request.request_type, request.team_id);
  if (message) await insertMessage(requestId, message);
  return advanceAfterSend(request, steps);
}

/** Withdraw an in-flight request back to DRAFT (requester only). */
export async function cancelRequest(requestId, message = '') {
  const request = await loadRequest(requestId);
  if (!canCancelRequest(request)) {
    throw new Error('You cannot cancel this request');
  }

  await insertMessage(requestId, message || 'Cancelled by requester');

  const updated = await updateRequest(requestId, {
    status: 'DRAFT',
    current_step_order: null,
    current_role_code: null,
    step_approved: false,
    rejected_at: null,
    completed_at: null
  });

  if (request.budget_plan_id) {
    await applyBudgetStatus(request.budget_plan_id, 'DRAFT', request.id);
  }
  if (request.request_type === REQUEST_TYPES.RECONCILIATION_ADJUSTMENT) {
    const { error } = await supabaseClient.rpc('cancel_reconciliation_adjustment_request', {
      p_request_id: request.id
    });
    if (error) throw error;
  }

  return updated;
}

export async function rejectRequest(requestId, message = '') {
  const request = await loadRequest(requestId);
  if (!(await userCanActOnRequest(request))) {
    throw new Error('You are not authorized to reject this request');
  }

  await insertMessage(requestId, message || 'Rejected');

  const updated = await updateRequest(requestId, {
    status: 'REJECTED',
    current_role_code: null,
    step_approved: false,
    rejected_at: new Date().toISOString()
  });

  if (request.budget_plan_id) {
    await applyBudgetStatus(request.budget_plan_id, 'REJECTED', request.id);
  }
  if (request.request_type === REQUEST_TYPES.RECONCILIATION_ADJUSTMENT) {
    await onReconciliationRequestRejected(request);
  }

  await notifyUserForRequest(
    request.created_by,
    updated,
    `Rejected: ${request.title || request.request_number}`,
    `${request.request_number} was rejected.`
  );

  return updated;
}

export async function clarifyRequest(requestId, roleCode, message) {
  const request = await loadRequest(requestId);
  if (!(await userCanActOnRequest(request))) {
    throw new Error('You are not authorized to request clarification');
  }

  const role = String(roleCode || request.current_role_code || 'OPL').toUpperCase();
  const body = String(message || '').trim();
  if (!body) throw new Error('Clarification message is required');

  await insertMessage(requestId, `[Clarify ${role}] ${body}`);

  const status = `CLARIFY-${role}`;
  const updated = await updateRequest(requestId, {
    status,
    step_approved: false
  });

  if (request.budget_plan_id) {
    await applyBudgetStatus(request.budget_plan_id, status, request.id);
  }

  await notifyRoleForRequest(
    updated,
    role,
    `Clarification needed: ${request.title || request.request_number}`,
    `${request.request_number}: ${body}`
  );

  return updated;
}

export async function replyClarification(requestId, message) {
  const request = await loadRequest(requestId);
  const role = clarifyRoleFromStatus(request.status);
  const codes = await getUserApprovalRoleCodes(state.user.id, request.team_id);

  if (!role || (!codes.includes(role) && request.created_by !== state.user.id)) {
    throw new Error('You cannot reply to this clarification');
  }

  const body = String(message || '').trim();
  if (!body) throw new Error('Reply message is required');

  await insertMessage(requestId, body);

  const steps = await resolveFlowSteps(request.request_type, request.team_id);
  const step = stepByOrder(steps, request.current_step_order) || firstStep(steps);

  const updated = await updateRequest(requestId, {
    status: 'SUBMITTED',
    current_role_code: step?.role_code || request.current_role_code,
    step_approved: false
  });

  await notifyRoleForRequest(
    updated,
    updated.current_role_code,
    `Clarification replied: ${request.title || request.request_number}`,
    `${request.request_number} is ready for ${updated.current_role_code} review.`
  );

  return updated;
}

/** Send multiple approved requests; optional group number. Returns { sent, failed, groupNumber }. */
export async function sendApprovedBatch(requestIds, { assignGroup = true } = {}) {
  const ids = [...new Set((requestIds || []).filter(Boolean))];
  if (!ids.length) throw new Error('Select at least one request');

  let groupNumber = null;
  if (assignGroup) {
    groupNumber = await allocateRequestNumber(state.user.id);
  }

  const sent = [];
  const failed = [];

  for (const id of ids) {
    try {
      const request = await loadRequest(id);
      if (!request.step_approved) {
        failed.push({ id, error: 'Not approved yet' });
        continue;
      }
      if (isFinalStatus(request.status)) {
        failed.push({ id, error: 'Already completed' });
        continue;
      }

      await sendApprovedRequest(id);
      if (groupNumber) {
        await updateRequest(id, { group_number: groupNumber });
      }
      sent.push(id);
    } catch (err) {
      failed.push({ id, error: err.message });
    }
  }

  return { sent, failed, groupNumber };
}

export async function loadRequest(requestId) {
  const { data, error } = await supabaseClient
    .from('approval_requests')
    .select('*')
    .eq('id', requestId)
    .eq('is_deleted', false)
    .single();

  if (error) throw error;
  return data;
}

export async function loadRequestMessages(requestId) {
  const { data, error } = await supabaseClient
    .from('approval_messages')
    .select('id, body, author_id, created_at')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows = data || [];
  const authorIds = [...new Set(rows.map(r => r.author_id).filter(Boolean))];
  const usersById = {};
  if (authorIds.length) {
    const { data: users, error: usersErr } = await supabaseClient
      .from('users')
      .select('id, name, email')
      .in('id', authorIds);
    if (usersErr) console.warn('approval message authors:', usersErr.message);
    (users || []).forEach(u => { usersById[u.id] = u; });
  }
  return rows.map(r => ({
    ...r,
    users: usersById[r.author_id] || null
  }));
}

/** Load all visible approval requests once (no UI filters). */
export async function fetchApprovalInboxRaw() {
  const { data, error } = await supabaseClient
    .from('approval_requests')
    .select(`
      id, request_number, request_type, team_id, status, title, amount_usd,
      created_by, created_at, updated_at, group_number,
      current_step_order, current_role_code, step_approved,
      budget_plan_id, transfer_id,
      teams:team_id ( name )
    `)
    .eq('is_deleted', false)
    .order('updated_at', { ascending: false })
    .limit(500);

  if (error) throw error;
  return data || [];
}

/**
 * Client-side filter of a cached inbox.
 * stepFilter: 'mine' | 'all' | 'OPH' | 'FIN' | …
 * Approve is still only allowed when canActMap says so (your step).
 */
export function filterApprovalInboxLocal(rows, filters = {}, canActMap = null) {
  const {
    statusFilter = 'active',
    typeFilter = 'all',
    stepFilter = 'mine',
    search = '',
    teamId = null,
    myStepCodes = []
  } = filters;

  let list = Array.isArray(rows) ? [...rows] : [];

  if (teamId) list = list.filter(r => r.team_id === teamId);

  if (typeFilter && typeFilter !== 'all') {
    list = list.filter(r => r.request_type === typeFilter);
  }

  if (statusFilter === 'active') {
    list = list.filter(r => isActiveStatus(r.status) && r.status !== 'DRAFT');
  } else if (statusFilter === 'closed') {
    list = list.filter(r => isFinalStatus(r.status) && String(r.status).endsWith('-APPROVED'));
  } else if (statusFilter === 'rejected') {
    list = list.filter(r => r.status === 'REJECTED');
  }

  const step = String(stepFilter || 'mine').toUpperCase();
  if (step === 'MINE') {
    const codes = (myStepCodes || []).map(c => String(c).toUpperCase());
    list = list.filter(r => {
      if (canActMap && canActMap.get(r.id) === true) return true;
      const role = String(r.current_role_code || '').toUpperCase();
      return role && codes.includes(role);
    });
  } else if (step !== 'ALL') {
    list = list.filter(r => String(r.current_role_code || '').toUpperCase() === step);
  }

  const q = String(search || '').trim().toLowerCase();
  if (q) {
    list = list.filter(r => {
      const num = String(r.request_number || '').toLowerCase();
      const group = String(r.group_number || '').toLowerCase();
      const title = String(r.title || '').toLowerCase();
      const team = String(r.teams?.name || '').toLowerCase();
      return num.includes(q) || group.includes(q) || title.includes(q) || team.includes(q);
    });
  }

  return list;
}

/** @deprecated Prefer fetchApprovalInboxRaw + filterApprovalInboxLocal */
export async function fetchApprovalInbox(opts = {}) {
  const rows = await fetchApprovalInboxRaw();
  const canActMap = new Map();
  for (const row of rows) {
    canActMap.set(row.id, await userCanActOnRequest(row));
  }
  const myStepCodes = opts.myStepCodes || [];
  return filterApprovalInboxLocal(rows, {
    ...opts,
    stepFilter: opts.stepFilter || (opts.showAll ? 'all' : 'mine'),
    myStepCodes
  }, canActMap);
}

export async function rejectRequestBatch(requestIds, message = '') {
  const results = { rejected: [], failed: [] };
  for (const id of requestIds) {
    try {
      await rejectRequest(id, message);
      results.rejected.push(id);
    } catch (err) {
      results.failed.push({ id, error: err.message });
    }
  }
  return results;
}

export async function approveRequestBatch(requestIds, message = '') {
  const results = { approved: [], failed: [] };
  for (const id of requestIds) {
    try {
      await approveRequest(id, message);
      results.approved.push(id);
    } catch (err) {
      results.failed.push({ id, error: err.message });
    }
  }
  return results;
}

export async function approveAndSendBatch(requestIds, message = '') {
  const results = { sent: [], failed: [] };
  for (const id of requestIds) {
    try {
      await approveAndSendRequest(id, message);
      results.sent.push(id);
    } catch (err) {
      results.failed.push({ id, error: err.message });
    }
  }
  return results;
}
