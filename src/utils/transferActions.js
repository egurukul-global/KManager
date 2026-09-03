import { state } from '../state.js';
import { supabaseClient, sbSelect, sbInsert } from '../db.js';
import {
  TRANSFER_STATUS,
  PENDING_STEP,
  isPendingTransfer,
  userCanReceivePendingTransfer,
  userCanApproveOhf,
  isCrossTeamTransfer,
  applyAcceptedTransferBalances,
  computeDestAmount,
  isOhfApprover
} from './transferHelpers.js';
import { roundUsd } from './currency.js';

async function auditLog(action, entityId, oldValues, newValues) {
  try {
    if (!state.user?.id) return;
    await supabaseClient.rpc('log_audit', {
      p_user_id: state.user.id,
      p_action: action,
      p_entity_type: 'transfers',
      p_entity_id: entityId,
      p_old_values: oldValues || null,
      p_new_values: newValues || null
    });
  } catch (err) {
    console.warn('Audit log non-critical error:', err.message);
  }
}

async function loadTransferContext(transferId) {
  const { data, error } = await supabaseClient
    .from('transfers')
    .select('*')
    .eq('id', transferId)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.is_deleted) throw new Error('Transfer not found');

  const srcTeamId = data.team_id;
  const destTeamId = data.dest_team_id || data.team_id;

  const [srcBucketsRes, destBucketsRes, srcRatesRes, destRatesRes] = await Promise.all([
    sbSelect('buckets', { teamId: srcTeamId, orderBy: 'name', ascending: true }),
    sbSelect('buckets', { teamId: destTeamId, orderBy: 'name', ascending: true }),
    sbSelect('exchange_rates', { teamId: srcTeamId, orderBy: 'date', ascending: false }),
    destTeamId !== srcTeamId
      ? sbSelect('exchange_rates', { teamId: destTeamId, orderBy: 'date', ascending: false })
      : Promise.resolve({ data: [] })
  ]);

  const srcBuckets = (srcBucketsRes.data || []).filter(b => !b.is_deleted);
  const destBuckets = (destBucketsRes.data || []).filter(b => !b.is_deleted);
  const srcRates = (srcRatesRes.data || []).filter(r => !r.is_deleted);
  const destRates = (destRatesRes.data || []).filter(r => !r.is_deleted);
  const rates = [...srcRates, ...destRates];

  const srcBucket = srcBuckets.find(b => b.id === data.from_bucket_id);
  const destBucket = destBuckets.find(b => b.id === data.to_bucket_id);

  if (!srcBucket || !destBucket) throw new Error('Transfer buckets not found');

  return { transfer: data, srcBucket, destBucket, buckets: [...srcBuckets, ...destBuckets], rates, srcRates, destRates };
}

async function createCrossTeamMirrorRecords(transfer, srcBucket, destBucket, destAmount) {
  const srcAmount = parseFloat(transfer.amount) || 0;
  const srcCurr = transfer.currency || srcBucket.currency || 'USD';
  const rate = parseFloat(transfer.rate) || 1;
  let usdAmount = srcAmount;

  if (srcCurr !== 'USD') {
    usdAmount = rate > 0 ? srcAmount / rate : destAmount;
  }

  usdAmount = roundUsd(usdAmount);
  const now = new Date().toISOString();
  const memo = transfer.description || 'Cross-team transfer';

  if (transfer.linked_budget_id) {
    const expensePayload = {
      id: crypto.randomUUID(),
      team_id: transfer.team_id,
      date: transfer.date,
      item: `Xfer: ${memo}`.slice(0, 80),
      description: `Cross-team transfer to personal wallet`,
      budget_id: transfer.linked_budget_id,
      bucket_id: srcBucket.id,
      local_amount: srcAmount,
      currency: srcCurr,
      rate,
      usd_amount: usdAmount,
      total_usd: usdAmount,
      status: 'recorded',
      payment_status: 'paid',
      created_by: transfer.created_by,
      balance_impact: false,
      linked_transfer_id: transfer.id,
      is_deleted: false,
      created_at: now,
      updated_at: now
    };

    const expResult = await sbInsert('expenses', expensePayload);
    if (expResult?.error) throw expResult.error;
  }

  const incomePayload = {
    id: crypto.randomUUID(),
    team_id: transfer.dest_team_id,
    date: transfer.date,
    payment_from: 'Work team transfer',
    bucket_id: destBucket.id,
    payment_bucket: destBucket.name,
    amount_usd: roundUsd(destAmount),
    currency: destBucket.currency || 'USD',
    exchange_rate: 1,
    local_amount: destAmount,
    description: memo,
    budget_allocations: [],
    balance_impact: false,
    linked_transfer_id: transfer.id,
    created_by: transfer.receiver_user_id || transfer.created_by,
    is_deleted: false,
    created_at: now,
    updated_at: now
  };

  const incResult = await sbInsert('income', incomePayload);
  if (incResult?.error) throw incResult.error;
}

export async function approveOhfTransfer(transferId) {
  const { transfer } = await loadTransferContext(transferId);

  if (!userCanApproveOhf(transfer, state)) {
    throw new Error('You are not authorized to approve this transfer');
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseClient
    .from('transfers')
    .update({
      pending_step: PENDING_STEP.RECEIVER,
      ohf_approved_at: now,
      ohf_approved_by: state.user.id
    })
    .eq('id', transferId)
    .select()
    .single();

  if (error) throw error;
  await auditLog('OHF_APPROVE', transferId, transfer, updated);
  return updated;
}

export async function acceptTransfer(transferId) {
  const { transfer, srcBucket, destBucket, rates } = await loadTransferContext(transferId);

  if (!isPendingTransfer(transfer)) {
    throw new Error('Transfer is not pending');
  }

  if (transfer.pending_step === PENDING_STEP.OHF) {
    return approveOhfTransfer(transferId);
  }

  if (!userCanReceivePendingTransfer(transfer, state)) {
    throw new Error('You are not authorized to accept this transfer');
  }

  const destAmount = parseFloat(transfer.dest_amount) || computeDestAmount(transfer, destBucket, rates);
  const srcAmount = parseFloat(transfer.amount) || 0;
  if ((parseFloat(srcBucket.balance) || 0) < srcAmount) {
    throw new Error('Insufficient balance in source bucket');
  }

  await applyAcceptedTransferBalances(
    { ...transfer, dest_amount: destAmount },
    srcBucket,
    destBucket,
    rates
  );

  if (isCrossTeamTransfer(transfer)) {
    await createCrossTeamMirrorRecords(transfer, srcBucket, destBucket, destAmount);
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseClient
    .from('transfers')
    .update({
      status: TRANSFER_STATUS.ACCEPTED,
      accepted_at: now,
      pending_step: null,
      dest_amount: destAmount,
      dest_currency: destBucket.currency || 'USD'
    })
    .eq('id', transferId)
    .select()
    .single();

  if (error) throw error;
  await auditLog('ACCEPT', transferId, transfer, updated);
  return updated;
}

export async function rejectTransfer(transferId) {
  const { transfer } = await loadTransferContext(transferId);

  if (!isPendingTransfer(transfer)) {
    throw new Error('Transfer is not pending');
  }

  const isSender = transfer.created_by === state.user?.id;
  const isReceiver = userCanReceivePendingTransfer(transfer, state);
  const isOhf = userCanApproveOhf(transfer, state);

  if (!isSender && !isReceiver && !isOhf) {
    throw new Error('You are not authorized to reject this transfer');
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseClient
    .from('transfers')
    .update({
      status: TRANSFER_STATUS.REJECTED,
      rejected_at: now,
      pending_step: null
    })
    .eq('id', transferId)
    .select()
    .single();

  if (error) throw error;
  await auditLog('REJECT', transferId, transfer, updated);
  return updated;
}

export async function cancelPendingTransfer(transferId) {
  const { data: transfer, error } = await supabaseClient
    .from('transfers')
    .select('*')
    .eq('id', transferId)
    .maybeSingle();

  if (error) throw error;
  if (!transfer || transfer.is_deleted) throw new Error('Transfer not found');
  if (!isPendingTransfer(transfer)) throw new Error('Only pending transfers can be cancelled');
  if (transfer.created_by !== state.user?.id) {
    throw new Error('Only the sender can cancel this transfer');
  }

  const { error: delError } = await supabaseClient
    .from('transfers')
    .delete()
    .eq('id', transferId);

  if (delError) throw delError;
  await auditLog('DELETE', transferId, transfer, null);
}

export async function fetchPendingTransfersForUser(teamId, userId) {
  const { data, error } = await supabaseClient
    .from('transfers')
    .select('*')
    .eq('team_id', teamId)
    .eq('status', TRANSFER_STATUS.PENDING)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const sameTeam = (data || []).filter(t =>
    t.pending_step !== PENDING_STEP.OHF && userCanReceivePendingTransfer(t, state)
  );

  const queries = [
    supabaseClient
      .from('transfers')
      .select('*')
      .eq('receiver_user_id', userId)
      .eq('status', TRANSFER_STATUS.PENDING)
      .eq('pending_step', PENDING_STEP.RECEIVER)
      .eq('is_deleted', false)
  ];

  if (isOhfApprover(state)) {
    queries.push(
      supabaseClient
        .from('transfers')
        .select('*')
        .eq('status', TRANSFER_STATUS.PENDING)
        .eq('pending_step', PENDING_STEP.OHF)
        .eq('is_deleted', false)
    );
  }

  const extraResults = await Promise.all(queries);
  const seen = new Set(sameTeam.map(t => t.id));
  const merged = [...sameTeam];

  extraResults.forEach(res => {
    if (res.error) return;
    (res.data || []).forEach(t => {
      if (!seen.has(t.id) && userCanReceivePendingTransfer(t, state)) {
        seen.add(t.id);
        merged.push(t);
      }
    });
  });

  return merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

export async function fetchSentTransfers(teamId, userId, { statusFilter = '' } = {}) {
  // Scope by who sent the transfer. The team_id filter is intentionally NOT applied:
  // budget payments made by finance roles carry the receiving team's id, so filtering
  // by the sender's current team hid them from the Sent Transfers list.
  let query = supabaseClient
    .from('transfers')
    .select('*')
    .eq('created_by', userId)
    .eq('is_deleted', false)
    .order('date', { ascending: false });

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchReceivedTransfersForUser(userId) {
  const { data, error } = await supabaseClient
    .from('transfers')
    .select('*')
    .eq('receiver_user_id', userId)
    .eq('status', TRANSFER_STATUS.ACCEPTED)
    .eq('is_deleted', false)
    .order('date', { ascending: false });

  if (error) throw error;
  return data || [];
}
