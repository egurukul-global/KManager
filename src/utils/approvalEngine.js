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
  canCancelRequest,
  resolveFlowSteps,
  canSkipLevel
} from './approvalAccess.js';
import { approveOhfTransfer } from './transferActions.js';
import { mapApprovalToBudgetStatus } from './budgetStatus.js';

const TYPE_NOTIFY_LABELS = {
  budget: 'Budget',
  money_transfer: 'Transfer',
  reconciliation_adjustment: 'Reconciliation'
};

function approvalNotifyLine(request) {
  const num = String(request?.request_number || '').trim();
  const title = String(request?.title || '').trim();
  const type = TYPE_NOTIFY_LABELS[request?.request_type] || 'Request';
  return [num, title, type].filter(Boolean).join('  ');
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

async function clearOkMessagesForRequest(requestId) {
  if (!requestId) return;
  try {
    const { error } = await supabaseClient.rpc('clear_ok_messages_for_action', {
      p_action_id: String(requestId)
    });
    if (error) console.warn('clear_ok_messages_for_action:', error.message);
  } catch (err) {
    console.warn('clear_ok_messages_for_action:', err?.message || err);
  }
}

/** One Kailasa home notification for the role that must act next. */
async function notifyRoleForRequest(request, roleCode) {
  if (!roleCode || !request) return;
  try {
    const { error } = await supabaseClient.rpc('notify_approval_actors', {
      p_team_id: request.team_id || null,
      p_role_code: String(roleCode).toUpperCase(),
      p_title: approvalNotifyLine(request),
      p_body: '',
      p_exclude_user_id: state.user?.id || null,
      p_action_page: 'approval-portal',
      p_action_id: request.id || null,
      p_category: request.request_type || 'other'
    });
    if (error) console.warn('notify_approval_actors:', error.message);
  } catch (err) {
    console.warn('notify_approval_actors:', err?.message || err);
  }
}

async function notifyUserForRequest(userId, request, titleOverride = null) {
  if (!userId || !request) return;
  try {
    const { error } = await supabaseClient.rpc('notify_ok_user', {
      p_user_id: userId,
      p_title: titleOverride || approvalNotifyLine(request),
      p_body: '',
      p_team_id: request?.team_id || null,
      p_action_page: 'approval-portal',
      p_action_id: request?.id || null,
      p_category: request?.request_type || 'other'
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

async function resolveNextActiveStep(steps, currentOrder, creatorId, teamId) {
  const creatorCodes = await getUserApprovalRoleCodes(creatorId, teamId);
  const normalizedCreatorCodes = (creatorCodes || []).map(c => String(c).toUpperCase());

  let idx = -1;
  if (currentOrder !== null && currentOrder !== undefined) {
    idx = (steps || []).findIndex(s => s.step_order === currentOrder);
  }

  let nextIdx = idx + 1;
  while (nextIdx < steps.length) {
    const step = steps[nextIdx];
    const role = String(step.role_code).toUpperCase();
    if (!normalizedCreatorCodes.includes(role)) {
      return { step, isApproved: false };
    }
    nextIdx++;
  }

  return { step: steps[steps.length - 1] || null, isApproved: true };
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

  const { step, isApproved } = await resolveNextActiveStep(steps, null, state.user.id, teamId);
  const status = isApproved ? `${String(step.role_code).toUpperCase()}-APPROVED` : 'SUBMITTED';
  const roleCode = isApproved ? null : step.role_code;
  const completedAt = isApproved ? new Date().toISOString() : null;

  if (prior?.status === 'DRAFT') {
    const updated = await updateRequest(prior.id, {
      status,
      title: budget.name || 'Budget',
      amount_usd: totalUsd,
      current_step_order: step.step_order,
      current_role_code: roleCode,
      step_approved: false,
      rejected_at: null,
      completed_at: completedAt
    });
    await applyBudgetStatus(budget.id, status, prior.id);
    await clearOkMessagesForRequest(prior.id);
    if (!isApproved) {
      await notifyRoleForRequest(updated, roleCode);
    } else {
      await notifyUserForRequest(
        state.user.id,
        updated,
        `${updated.request_number || requestNumber}  ${budget.name || 'Budget'}  Approved`.replace(/\s+/g, ' ').trim()
      );
    }
    return updated;
  }

  const payload = {
    request_number: requestNumber,
    request_type: REQUEST_TYPES.BUDGET,
    team_id: teamId,
    status,
    title: budget.name || 'Budget',
    amount_usd: totalUsd,
    created_by: state.user.id,
    budget_plan_id: budget.id,
    current_step_order: step.step_order,
    current_role_code: roleCode,
    step_approved: false,
    completed_at: completedAt,
    is_deleted: false
  };

  const { data, error } = await supabaseClient
    .from('approval_requests')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;

  await applyBudgetStatus(budget.id, status, data.id);
  if (!isApproved) {
    await notifyRoleForRequest(data, roleCode);
  } else {
    await notifyUserForRequest(
      state.user.id,
      data,
      `${data.request_number}  ${budget.name || 'Budget'}  Approved`.replace(/\s+/g, ' ').trim()
    );
  }
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
  const { step, isApproved } = await resolveNextActiveStep(steps, null, state.user.id, teamId);
  const status = isApproved ? `${String(step.role_code).toUpperCase()}-APPROVED` : 'SUBMITTED';
  const roleCode = isApproved ? null : step.role_code;
  const completedAt = isApproved ? new Date().toISOString() : null;

  const payload = {
    request_number: requestNumber,
    request_type: REQUEST_TYPES.RECONCILIATION_ADJUSTMENT,
    team_id: teamId,
    status,
    title: `Recon adjustment — ${valid.length} bucket${valid.length === 1 ? '' : 's'} (${dateLabel})`,
    amount_usd: amountUsd,
    created_by: state.user.id,
    reconciliation_submission_id: valid.length === 1 ? valid[0].submission_id : null,
    current_step_order: step.step_order,
    current_role_code: roleCode,
    step_approved: false,
    completed_at: completedAt,
    is_deleted: false
  };

  const { data: request, error: reqErr } = await supabaseClient
    .from('approval_requests')
    .insert(payload)
    .select('*')
    .single();

  if (reqErr) throw reqErr;

  if (isApproved) {
    await onReconciliationRequestCompleted(request);
    await notifyUserForRequest(
      state.user.id,
      request,
      `${request.request_number}  Recon adjustment  Approved`.replace(/\s+/g, ' ').trim()
    );
  } else {
    await notifyRoleForRequest(request, roleCode);
  }

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
  const { step, isApproved } = await resolveNextActiveStep(steps, null, transfer.created_by || state.user.id, transfer.team_id);
  const status = isApproved ? `${String(step.role_code).toUpperCase()}-APPROVED` : 'SUBMITTED';
  const roleCode = isApproved ? null : step.role_code;
  const completedAt = isApproved ? new Date().toISOString() : null;
  const amount = parseFloat(transfer.amount) || 0;

  const payload = {
    request_number: requestNumber,
    request_type: REQUEST_TYPES.MONEY_TRANSFER,
    team_id: transfer.team_id,
    status,
    title: `Transfer ${amount.toFixed(2)} ${transfer.currency || 'USD'}`,
    amount_usd: amount,
    created_by: transfer.created_by || state.user.id,
    transfer_id: transfer.id,
    current_step_order: step.step_order,
    current_role_code: roleCode,
    step_approved: false,
    completed_at: completedAt,
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

  if (isApproved) {
    await onTransferRequestCompleted(data);
    await notifyUserForRequest(
      transfer.created_by || state.user.id,
      data,
      `${data.request_number}  Transfer  Approved`.replace(/\s+/g, ' ').trim()
    );
  } else {
    await notifyRoleForRequest(data, roleCode);
  }
  return data;
}

async function advanceAfterSend(request, steps) {
  const current = stepByOrder(steps, request.current_step_order);
  if (!current) throw new Error('Invalid flow step');

  const { step: following, isApproved } = await resolveNextActiveStep(steps, request.current_step_order, request.created_by, request.team_id);

  // Remove prior-step home alerts for this request
  await clearOkMessagesForRequest(request.id);

  if (current.is_final || isApproved || !following) {
    const finalRole = following ? following.role_code : current.role_code;
    const finalStatus = `${String(finalRole).toUpperCase()}-APPROVED`;
    const updated = await updateRequest(request.id, {
      status: finalStatus,
      current_step_order: following ? following.step_order : current.step_order,
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
      `${updated.request_number || request.request_number}  ${request.title || ''}  Approved`.replace(/\s+/g, ' ').trim()
    );
    return updated;
  }

  const currentRole = String(current.role_code).toUpperCase();
  const reviewedStatus = `${currentRole}-REVIEWED`;
  const updated = await updateRequest(request.id, {
    status: reviewedStatus,
    current_step_order: following.step_order,
    current_role_code: following.role_code,
    step_approved: false
  });

  if (request.request_type === REQUEST_TYPES.BUDGET && request.budget_plan_id) {
    await applyBudgetStatus(request.budget_plan_id, reviewedStatus, request.id);
  }

  await notifyRoleForRequest(updated, following.role_code);

  return updated;
}

async function resolveNextUnsatisfiedStepOrder(request, currentStep, steps, approverIds) {
  console.log(`🔍 FRONTEND DIAGNOSTIC resolveNextUnsatisfiedStepOrder:
    request_id: ${request.id}
    team_id: ${request.team_id}
    currentStep_order: ${currentStep.step_order}
    steps: ${steps.map(s => `${s.step_order}:${s.role_code}`).join(', ')}
    approverIds: ${approverIds.join(', ')}
  `);
  
  const caoStep = steps.find(s => String(s.role_code).toUpperCase() === 'CAO');
  let currentSearchStep = currentStep;
  let targetStepOrder = currentStep.step_order;

  while (true) {
    const nextStep = steps.find(s => s.step_order > currentSearchStep.step_order);
    if (!nextStep) {
      console.log('🔍 FRONTEND DIAGNOSTIC: No more steps. Request is fully approved.');
      targetStepOrder = null;
      break;
    }

    const isApprovalStep = caoStep ? nextStep.step_order <= caoStep.step_order : true;
    let isSatisfied = false;
    if (isApprovalStep) {
      for (const uid of approverIds) {
        const { data: hasRole } = await supabaseClient.rpc('user_has_approval_role', {
          p_user_id: uid,
          p_role_code: nextStep.role_code,
          p_team_id: request.team_id
        });
        console.log(`🔍 FRONTEND DIAGNOSTIC: user_has_approval_role check for user ${uid}, role ${nextStep.role_code}:`, hasRole);
        if (hasRole) {
          isSatisfied = true;
          break;
        }
      }
    }

    console.log(`🔍 FRONTEND DIAGNOSTIC: nextStep ${nextStep.step_order}:${nextStep.role_code}, isSatisfied:`, isSatisfied);

    if (isSatisfied) {
      currentSearchStep = nextStep;
      targetStepOrder = nextStep.step_order;
    } else {
      targetStepOrder = nextStep.step_order;
      break;
    }
  }

  console.log('🔍 FRONTEND DIAGNOSTIC: resolved targetStepOrder:', targetStepOrder);
  return targetStepOrder;
}

export async function approveRequest(requestId, message = '') {
  const request = await loadRequest(requestId);
  if (!(await userCanActOnRequest(request))) {
    throw new Error('You are not authorized to approve this request');
  }

  const steps = await resolveFlowSteps(request.request_type, request.team_id);
  const codes = await getUserApprovalRoleCodes(state.user.id, request.team_id);
  const upperCodes = codes.map(c => String(c).toUpperCase());

  let targetStepOrder = request.current_step_order;
  const currentStep = steps.find(s => s.step_order === request.current_step_order);

  if (currentStep) {
    let highestPermittedStep = currentStep;
    if (!upperCodes.includes(String(request.current_role_code).toUpperCase()) && canSkipLevel(upperCodes, request.current_role_code, request, steps)) {
      const caoStep = steps.find(s => String(s.role_code).toUpperCase() === 'CAO');
      const allowedSkipSteps = steps.filter(s => {
        if (upperCodes.includes(String(s.role_code).toUpperCase())) {
          if (upperCodes.includes('CAO') || upperCodes.includes('CEO') || state.user?.role === 'admin') {
            return true;
          }
          if (caoStep && s.step_order < caoStep.step_order) {
            return true;
          }
        }
        return false;
      });
      const higherStep = allowedSkipSteps.find(s => s.step_order > currentStep.step_order);
      if (higherStep) {
        highestPermittedStep = higherStep;
      }
    }

    // Get all approval messages for this request to find who approved
    const { data: approvalMsgs } = await supabaseClient
      .from('messages')
      .select('sender_id, body')
      .eq('metadata->>link_id', request.id);

    const approverIds = [state.user.id];
    if (approvalMsgs) {
      for (const msg of approvalMsgs) {
        const b = String(msg.body);
        if (b.includes('[Approval System] Approved') || b.includes('Approved') || b.includes('Approved and sent forward')) {
          if (!approverIds.includes(msg.sender_id)) {
            approverIds.push(msg.sender_id);
          }
        }
      }
    }

    targetStepOrder = await resolveNextUnsatisfiedStepOrder(request, highestPermittedStep, steps, approverIds);
  }

  await insertMessage(requestId, message);

  const patch = { step_approved: true };
  if (targetStepOrder !== request.current_step_order) {
    patch.current_step_order = targetStepOrder;
    const targetStep = steps.find(s => s.step_order === targetStepOrder);
    if (targetStep) {
      patch.current_role_code = targetStep.role_code;
    }
  }

  return updateRequest(requestId, patch);
}

export async function approveAndSendRequest(requestId, message = '') {
  const request = await loadRequest(requestId);
  if (!(await userCanActOnRequest(request))) {
    throw new Error('You are not authorized to act on this request');
  }

  const steps = await resolveFlowSteps(request.request_type, request.team_id);
  const codes = await getUserApprovalRoleCodes(state.user.id, request.team_id);
  const upperCodes = codes.map(c => String(c).toUpperCase());

  const currentStep = steps.find(s => s.step_order === request.current_step_order);
  if (!currentStep) throw new Error('Invalid current flow step');

  let highestPermittedStep = currentStep;
  if (!upperCodes.includes(String(request.current_role_code).toUpperCase()) && canSkipLevel(upperCodes, request.current_role_code, request, steps)) {
    const caoStep = steps.find(s => String(s.role_code).toUpperCase() === 'CAO');
    const isStandardUser = !upperCodes.includes('CAO') && !upperCodes.includes('CEO') && state.user?.role !== 'admin';
    const allowedSkipSteps = steps.filter(s => {
      if (upperCodes.includes(String(s.role_code).toUpperCase())) {
        if (!isStandardUser) return true;
        if (caoStep && s.step_order < caoStep.step_order) return true;
      }
      return false;
    });
    const higherStep = allowedSkipSteps.find(s => s.step_order > currentStep.step_order);
    if (higherStep) {
      highestPermittedStep = higherStep;
    }
  }

  // Get all approval messages for this request to find who approved
  const { data: approvalMsgs } = await supabaseClient
    .from('messages')
    .select('sender_id, body')
    .eq('metadata->>link_id', request.id);

  const approverIds = [state.user.id];
  if (approvalMsgs) {
    for (const msg of approvalMsgs) {
      const b = String(msg.body);
      if (b.includes('[Approval System] Approved') || b.includes('Approved') || b.includes('Approved and sent forward')) {
        if (!approverIds.includes(msg.sender_id)) {
          approverIds.push(msg.sender_id);
        }
      }
    }
  }

  const targetStepOrder = await resolveNextUnsatisfiedStepOrder(request, highestPermittedStep, steps, approverIds);
  await insertMessage(requestId, message || 'Approved and sent forward');

  let isApproved = (targetStepOrder === null);

  if (!isApproved && request.request_type === REQUEST_TYPES.BUDGET && request.budget_plan_id) {
    try {
      const { data: budget } = await supabaseClient
        .from('budget_plans')
        .select('paid_amount')
        .eq('id', request.budget_plan_id)
        .maybeSingle();
      if (budget && parseFloat(budget.paid_amount) > 0) {
        isApproved = true;
      }
    } catch (e) {
      console.warn('Failed to check budget paid_amount:', e);
    }
  }

  const following = isApproved ? null : steps.find(s => s.step_order === targetStepOrder);

  // Clear prior-step home alerts
  await clearOkMessagesForRequest(request.id);

  if (isApproved) {
    // Complete the request
    const finalRole = following ? following.role_code : currentStep.role_code;
    const finalStatus = `${String(finalRole).toUpperCase()}-APPROVED`;
    
    const updated = await updateRequest(requestId, {
      status: finalStatus,
      current_step_order: following ? following.step_order : currentStep.step_order,
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
      `${updated.request_number || request.request_number}  ${request.title || ''}  Approved`.replace(/\s+/g, ' ').trim()
    );
    return updated;
  } else {
    // Advance to the following step
    const currentRole = String(currentStep.role_code).toUpperCase();
    const reviewedStatus = `${currentRole}-REVIEWED`;
    
    const updated = await updateRequest(requestId, {
      status: reviewedStatus,
      current_step_order: following.step_order,
      current_role_code: following.role_code,
      step_approved: false
    });

    if (request.request_type === REQUEST_TYPES.BUDGET && request.budget_plan_id) {
      await applyBudgetStatus(request.budget_plan_id, reviewedStatus, request.id);
    }
    await notifyRoleForRequest(updated, following.role_code);
    return updated;
  }
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

  await clearOkMessagesForRequest(request.id);
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

  await clearOkMessagesForRequest(request.id);
  await notifyUserForRequest(
    request.created_by,
    updated,
    `${request.request_number || ''}  ${request.title || ''}  Rejected`.replace(/\s+/g, ' ').trim()
  );

  return updated;
}

export async function clarifyRequest(requestId, roleCode, message) {
  const request = await loadRequest(requestId);
  if (!(await userCanActOnRequest(request))) {
    throw new Error('You are not authorized to request clarification');
  }

  const body = String(message || '').trim();
  if (!body) throw new Error('Clarification message is required');

  await insertMessage(requestId, `[Clarify] ${body}`);

  const status = 'CLARIFY-OPL';
  const updated = await updateRequest(requestId, {
    status,
    current_role_code: 'OPL',
    clarified_by_role: request.current_role_code,
    step_approved: false
  });

  if (request.budget_plan_id) {
    await applyBudgetStatus(request.budget_plan_id, status, request.id);
  }

  await clearOkMessagesForRequest(request.id);
  await notifyRoleForRequest(updated, 'OPL');

  return updated;
}

export async function replyClarification(requestId, message) {
  const request = await loadRequest(requestId);
  const role = clarifyRoleFromStatus(request.status);
  const codes = await getUserApprovalRoleCodes(state.user.id, request.team_id);
  const isRequester = request.created_by === state.user.id;
  const canReply =
    role === 'REQUESTER'
      ? isRequester
      : (role && codes.includes(role)) || isRequester;

  if (!role || !canReply) {
    throw new Error('You cannot reply to this clarification');
  }

  const body = String(message || '').trim();
  if (!body) throw new Error('Reply message is required');

  await insertMessage(requestId, body);

  const updated = await updateRequest(requestId, {
    status: 'SUBMITTED',
    current_role_code: request.clarified_by_role || request.current_role_code,
    clarified_by_role: null,
    step_approved: false
  });

  await clearOkMessagesForRequest(request.id);
  await notifyRoleForRequest(updated, updated.current_role_code);

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

export async function fetchApprovalInboxRaw() {
  if (!state.user?.id) return [];
  const teamIds = (state.teams || []).map(t => t.team_id).filter(Boolean);
  
  let query = supabaseClient
    .from('approval_requests')
    .select(`
      id, request_number, request_type, team_id, status, title, amount_usd,
      created_by, created_at, updated_at, group_number,
      current_step_order, current_role_code, step_approved,
      budget_plan_id, transfer_id,
      teams:team_id ( name )
    `)
    .eq('is_deleted', false);

  if (state.user?.role !== 'admin' && !state.isOkAdmin) {
    if (teamIds.length > 0) {
      query = query.or(`created_by.eq.${state.user.id},team_id.in.(${teamIds.join(',')})`);
    } else {
      query = query.eq('created_by', state.user.id);
    }
  }

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .limit(500);

  if (error) throw error;
  return data || [];
}

/** Open requests this user can act on (for home notifications). */
export async function loadActionableApprovalNotifs() {
  const rows = await fetchApprovalInboxRaw();
  const out = [];
  const approvedIds = new Set();
  
  if (rows.length > 0 && state.user?.id) {
    try {
      const requestIds = rows.map(r => r.id);
      const { data: approvalMsgs } = await supabaseClient
        .from('messages')
        .select('metadata, body')
        .eq('sender_id', state.user.id)
        .in('metadata->>link_id', requestIds);

      if (approvalMsgs) {
        approvalMsgs.forEach(m => {
          const body = String(m.body || '');
          const reqId = m.metadata?.link_id;
          if (reqId && (
            body.includes('[Approval System] Approved') ||
            body.includes('[Approval System] Rejected') ||
            body.includes('Approved and sent forward') ||
            body.includes('Approved request')
          )) {
            approvedIds.add(reqId);
          }
        });
      }
    } catch (err) {
      console.warn('Failed to batch check approval history:', err);
    }
  }

  await Promise.all(rows.map(async row => {
    if (await userCanActOnRequest(row, state.user?.id, approvedIds)) {
      if (isActiveStatus(row.status) && row.status !== 'DRAFT') {
        out.push(row);
      }
    }
  }));

  return out.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
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
      // Your own clarification requests always show under My step
      if (String(r.status || '').toUpperCase().startsWith('CLARIFY-') && r.created_by === state.user?.id) {
        return true;
      }
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
