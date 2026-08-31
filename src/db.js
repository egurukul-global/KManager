// ==================== SUPABASE CONFIG ====================
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nvhaetvreopkktlxxdwg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52aGFldHZyZW9wa2t0bHh4ZHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Mzg3MDcsImV4cCI6MjA5NDAxNDcwN30.yjsQeAhjZfXYV_Od6lkdZCCBSgt00Z9Pb-9Ki-a79kA';

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { 
    persistSession: false, 
    autoRefreshToken: false 
  },
  global: {
    fetch: async (url, options = {}) => {
      const targetUrl = new URL(url);
      const path = targetUrl.pathname + targetUrl.search;
      const proxyUrl = `/api/supabase-proxy?path=${encodeURIComponent(path)}`;
      
      const plainHeaders = {};
      if (options.headers) {
        if (typeof options.headers.forEach === 'function') {
          options.headers.forEach((value, key) => {
            plainHeaders[key] = value;
          });
        } else {
          Object.assign(plainHeaders, options.headers);
        }
      }
      delete plainHeaders['authorization'];
      
      options.credentials = 'include';
      const response = await fetch(proxyUrl, {
        ...options,
        headers: plainHeaders
      });
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('auth-expired'));
      }
      return response;
    }
  }
});
export { SUPABASE_URL, SUPABASE_ANON_KEY };

// ==================== INDEXEDDB SETUP ====================
let db = null;
const LOCAL_DB_VERSION = 8;

function ensureAllObjectStores(idb) {
  const required = [
    'buckets', 'categories', 'budget_plans', 'exchange_rates',
    'pending_changes', 'sync_meta', 'income', 'expenses', 'transfers',
    'users', 'teams', 'user_teams', 'expense_receipts', 'expense_attachments', 'report_logs'
  ];
  return required.every(name => idb.objectStoreNames.contains(name));
}

export async function initLocalDB() {
  const { openDB } = await import('idb');

  if (db && ensureAllObjectStores(db)) return db;
  if (db) {
    db.close();
    db = null;
  }

  db = await openDB('kailasa-manager', LOCAL_DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('buckets', { keyPath: 'id' });
        db.createObjectStore('categories', { keyPath: 'id' });
        db.createObjectStore('budget_plans', { keyPath: 'id' });
        db.createObjectStore('exchange_rates', { keyPath: 'id' });
        db.createObjectStore('pending_changes', { keyPath: 'id', autoIncrement: true });
        db.createObjectStore('sync_meta', { keyPath: 'key' });
      }
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('income')) db.createObjectStore('income', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('expenses')) db.createObjectStore('expenses', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('transfers')) db.createObjectStore('transfers', { keyPath: 'id' });
      }
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains('users')) db.createObjectStore('users', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('teams')) db.createObjectStore('teams', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('user_teams')) db.createObjectStore('user_teams', { keyPath: 'id' });
      }
      // v4 added expense_receipts; v5 re-runs if store was missing at v4
      if (!db.objectStoreNames.contains('expense_receipts')) {
        db.createObjectStore('expense_receipts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('expense_attachments')) {
        db.createObjectStore('expense_attachments', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('report_logs')) {
        db.createObjectStore('report_logs', { keyPath: 'id' });
      }
    }
  });

  return db;
}

// ==================== LOCAL CRUD OPERATIONS ====================

export async function localGetAll(storeName) {
  const database = await initLocalDB();
  return database.getAll(storeName);
}

export async function localGet(storeName, id) {
  const database = await initLocalDB();
  return database.get(storeName, id);
}

export async function localPut(storeName, data) {
  const database = await initLocalDB();
  await database.put(storeName, data);
}

export async function localDelete(storeName, id) {
  const database = await initLocalDB();
  await database.delete(storeName, id);
}

// ==================== PENDING CHANGES QUEUE ====================

export async function queueChange(table, operation, data) {
  const database = await initLocalDB();
  await database.add('pending_changes', {
    table,
    operation,
    data,
    timestamp: new Date().toISOString(),
    synced: false
  });
}

export async function getPendingChanges() {
  const database = await initLocalDB();
  return database.getAll('pending_changes');
}

export async function clearPendingChange(id) {
  const database = await initLocalDB();
  await database.delete('pending_changes', id);
}

// ==================== SYNC OPERATIONS ====================

export async function syncTable(tableName, teamId, options = {}) {
  const { where = {}, orderBy = 'created_at', ascending = false } = options;

  try {
    let query = supabaseClient
      .from(tableName)
      .select('*')
      .eq('team_id', teamId);

    Object.entries(where).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    query = query.order(orderBy, { ascending });

    if (!options.includeDeleted) {
      query = query.eq('is_deleted', false);
    }

    const { data, error } = await query;

    if (error) throw error;

    const database = await initLocalDB();
    const tx = database.transaction(tableName, 'readwrite');
    const store = tx.objectStore(tableName);

    const existing = await store.getAll();
    for (const item of existing) {
      if (item.team_id === teamId) {
        await store.delete(item.id);
      }
    }

    for (const item of data || []) {
      await store.put(item);
    }

    await tx.done;

    return data || [];
  } catch (err) {
    console.error(`Sync ${tableName} error:`, err);
    const local = await localGetAll(tableName);
    return local.filter(item => item.team_id === teamId);
  }
}

export async function syncAll(teamId) {
  const tables = ['buckets', 'categories', 'budget_plans', 'exchange_rates', 'expenses', 'expense_receipts', 'expense_attachments', 'report_logs'];
  const results = {};

  for (const table of tables) {
    results[table] = await syncTable(table, teamId);
  }

  return results;
}

export async function pushPendingChanges() {
  const pending = await getPendingChanges();

  if (pending.length === 0) return { success: true, count: 0 };

  const results = [];

  for (const change of pending) {
    try {
      let result;

      switch (change.operation) {
        case 'insert':
          result = await supabaseClient.from(change.table).insert([change.data]);
          break;
        case 'update':
          result = await supabaseClient.from(change.table).update(change.data).eq('id', change.data.id);
          break;
        case 'delete':
          result = await supabaseClient.from(change.table).delete().eq('id', change.data.id);
          break;
        case 'soft_delete':
          result = await supabaseClient.from(change.table).update({
            is_deleted: true,
            deleted_at: new Date().toISOString()
          }).eq('id', change.data.id);
          break;
      }

      if (result.error) throw result.error;

      await clearPendingChange(change.id);
      results.push({ id: change.id, success: true });
    } catch (err) {
      console.error('Push change error:', err);
      results.push({ id: change.id, success: false, error: err.message });
    }
  }

  const successCount = results.filter(r => r.success).length;
  return { success: successCount === pending.length, count: successCount, total: pending.length };
}

// ==================== SUPABASE WRAPPER (with offline fallback) ====================

export async function sbInsert(table, data) {
  if (!navigator.onLine) {
    await queueChange(table, 'insert', data);
    await localPut(table, data);
    return { data: [data], error: null, offline: true };
  }

  const result = await supabaseClient.from(table).insert([data]).select();
  if (!result.error && result.data?.[0]) {
    await localPut(table, result.data[0]);
  }
  return result;
}

export async function sbUpdate(table, arg2, arg3) {
  let data;
  let match;

  if (typeof arg2 === 'string' && arg3 && typeof arg3 === 'object') {
    match = { id: arg2 };
    data = { ...arg3, id: arg2 };
  } else {
    data = arg2;
    match = arg3;
  }

  if (!navigator.onLine) {
    await queueChange(table, 'update', data);
    await localPut(table, data);
    return { data: [data], error: null, offline: true };
  }

  let query = supabaseClient.from(table).update(data);
  if (typeof match === 'function') {
    query = match(query);
  } else if (match && typeof match === 'object') {
    for (const [key, value] of Object.entries(match)) {
      query = query.eq(key, value);
    }
  }
  const result = await query.select();
  if (!result.error && result.data?.[0]) {
    await localPut(table, result.data[0]);
  }
  return result;
}

export async function sbSoftDelete(table, id) {
  if (!navigator.onLine) {
    await queueChange(table, 'soft_delete', { id });
    const existing = await localGet(table, id);
    if (existing) {
      existing.is_deleted = true;
      existing.deleted_at = new Date().toISOString();
      await localPut(table, existing);
    }
    return { data: [{ id }], error: null, offline: true };
  }

  const result = await supabaseClient.from(table).update({
    is_deleted: true,
    deleted_at: new Date().toISOString()
  }).eq('id', id).select();

  if (!result.error) {
    const existing = await localGet(table, id);
    if (existing) {
      existing.is_deleted = true;
      existing.deleted_at = new Date().toISOString();
      await localPut(table, existing);
    }
  }
  return result;
}

export async function sbRestore(table, id) {
  if (!navigator.onLine) {
    await queueChange(table, 'update', { id, is_deleted: false, deleted_at: null });
    const existing = await localGet(table, id);
    if (existing) {
      existing.is_deleted = false;
      existing.deleted_at = null;
      await localPut(table, existing);
    }
    return { data: [{ id }], error: null, offline:true };
  }

  const result = await supabaseClient.from(table).update({
    is_deleted: false,
    deleted_at: null
  }).eq('id', id).select();

  if (!result.error) {
    const existing = await localGet(table, id);
    if (existing) {
      existing.is_deleted = false;
      existing.deleted_at = null;
      await localPut(table, existing);
    }
  }
  return result;
}

export async function sbSelect(table, options = {}) {
  const { teamId, includeDeleted = false, orderBy = 'created_at', ascending = false } = options;

  if (!navigator.onLine) {
    const local = await localGetAll(table);
    let filtered = local;
    if (teamId && teamId !== 'all' && teamId !== 'ALL') filtered = filtered.filter(item => item.team_id === teamId);
    if (!includeDeleted) filtered = filtered.filter(item => !item.is_deleted);
    return { data: filtered, error: null, offline: true };
  }

  let query = supabaseClient.from(table).select('*');
  if (teamId && teamId !== 'all' && teamId !== 'ALL') query = query.eq('team_id', teamId);
  if (!includeDeleted) query = query.eq('is_deleted', false);
  query = query.order(orderBy, { ascending });

  const result = await query;

  if (!result.error && result.data) {
    const database = await initLocalDB();
    const tx = database.transaction(table, 'readwrite');
    const store = tx.objectStore(table);

    for (const item of result.data) {
      await store.put(item);
    }
    await tx.done;
  }

  return result;
}
