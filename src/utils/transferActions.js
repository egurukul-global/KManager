import { state } from '../state.js';
import { supabaseClient, sbSelect } from '../db.js';
import { showToast } from '../components/toasts.js';
import {
  TRANSFER_STATUS,
  isPendingTransfer,
  userCanReceivePendingTransfer,
  applyAcceptedTransferBalances,
  computeDestAmount
} from './transferHelpers.js';

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

  const teamId = data.team_id;
  const [bucketsRes, ratesRes] = await Promise.all([
    sbSelect('buckets', { teamId, orderBy: 'name', ascending: true }),
    sbSelect('exchange_rates', { teamId, orderBy: 'date', ascending: false })
  ]);

  const buckets = (bucketsRes.data || []).filter(b => !b.is_deleted);
  const rates = (ratesRes.data || []).filter(r => !r.is_deleted);
  const srcBucket = buckets.find(b => b.id === data.from_bucket_id);
  const destBucket = buckets.find(b => b.id === data.to_bucket_id);

  if (!srcBucket || !destBucket) throw new Error('Transfer buckets not found');

  return { transfer: data, srcBucket, destBucket, buckets, rates };
}

export async function acceptTransfer(transferId) {
  const { transfer, srcBucket, destBucket, rates } = await loadTransferContext(transferId);

  if (!isPendingTransfer(transfer)) {
    throw new Error('Transfer is not pending');
  }
  if (!userCanReceivePendingTransfer(transfer, state)) {
    throw new Error('You are not authorized to accept this transfer');
  }

  const destAmount = computeDestAmount(transfer, destBucket, rates);
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

  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseClient
    .from('transfers')
    .update({
      status: TRANSFER_STATUS.ACCEPTED,
      accepted_at: now,
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
  if (!isSender && !isReceiver) {
    throw new Error('You are not authorized to reject this transfer');
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseClient
    .from('transfers')
    .update({
      status: TRANSFER_STATUS.REJECTED,
      rejected_at: now
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

  return (data || []).filter(t => userCanReceivePendingTransfer(t, state));
}

export async function fetchSentTransfers(teamId, userId, { statusFilter = '' } = {}) {
  let query = supabaseClient
    .from('transfers')
    .select('*')
    .eq('team_id', teamId)
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
