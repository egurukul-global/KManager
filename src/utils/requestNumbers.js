// ==================== REQUEST NUMBERS (Phase 4A) ====================
import { supabaseClient } from '../db.js';

const ALIAS_RE = /^[A-Za-z0-9]{3,5}$/;

export function validateRequestAlias(alias) {
  const trimmed = String(alias || '').trim().toUpperCase();
  if (!ALIAS_RE.test(trimmed)) {
    return { ok: false, error: 'Alias must be 3-5 letters or numbers (no spaces).' };
  }
  return { ok: true, value: trimmed };
}

export function formatRequestNumber(alias, counter) {
  return `${String(alias).toUpperCase()}-${counter}`;
}

export async function saveUserRequestAlias(userId, alias) {
  const check = validateRequestAlias(alias);
  if (!check.ok) throw new Error(check.error);

  const { error } = await supabaseClient
    .from('users')
    .update({ request_alias: check.value })
    .eq('id', userId);

  if (error) {
    if (error.code === '23505') throw new Error('That alias is already taken. Choose another.');
    throw error;
  }
  return check.value;
}

export async function allocateRequestNumber(userId) {
  const { data, error } = await supabaseClient.rpc('allocate_request_number', {
    p_user_id: userId
  });
  if (error) throw error;
  return data;
}

export async function searchRequestByNumber(requestNumber) {
  const q = String(requestNumber || '').trim().toUpperCase();
  if (!q) return null;

  const { data, error } = await supabaseClient
    .from('approval_requests')
    .select('id, request_number, request_type, team_id, status, title, amount_usd, created_at, group_number')
    .eq('is_deleted', false)
    .or(`request_number.eq.${q},group_number.eq.${q}`)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}
