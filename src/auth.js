import { openDB } from 'idb';

const DB_NAME = 'kmanager-offline';
const SESSION_STORE = 'session';

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE);
      }
    }
  });
}

async function storeOfflineSession(userData) {
  const db = await getDB();
  const session = {
    id: userData.id || userData.userId,
    userId: userData.id || userData.userId,
    email: userData.email,
    role: userData.role || 'user',
    name: userData.name || userData.email,
    localExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    lastOnlineAt: new Date().toISOString(),
    sessionVersion: Date.now().toString()
  };
  await db.put(SESSION_STORE, session, 'current-session');
  return session;
}

async function getOfflineSession() {
  try {
    const db = await getDB();
    return await db.get(SESSION_STORE, 'current-session');
  } catch (error) {
    console.error('Failed to get offline session:', error);
    return null;
  }
}

async function clearOfflineSession() {
  const db = await getDB();
  await db.delete(SESSION_STORE, 'current-session');
}

export async function secureLogin(email, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  }

  const data = await response.json();
  await storeOfflineSession(data.user);
  return data;
}

export async function secureVerify() {
  const offlineSession = await getOfflineSession();
  
  if (offlineSession) {
    const expiryDate = new Date(offlineSession.localExpiresAt);
    if (expiryDate > new Date()) {
      if (navigator.onLine) {
        try {
          const response = await fetch('/api/auth/verify', {
            method: 'GET',
            credentials: 'include'
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.authenticated) {
              await storeOfflineSession(data.user);
              return { authenticated: true, user: data.user, offline: false };
            }
          }
        } catch (error) {
          console.log('Online verification failed, using offline session');
          return { authenticated: true, user: offlineSession, offline: true };
        }
      }
      return { authenticated: true, user: offlineSession, offline: true };
    }
  }

  if (navigator.onLine) {
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'GET',
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.authenticated) {
          await storeOfflineSession(data.user);
          return { authenticated: true, user: data.user, offline: false };
        }
      }
    } catch (error) {
      console.error('Auth verification failed:', error);
    }
  }

  return { authenticated: false, user: null, offline: true };
}

export async function secureLogout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    await clearOfflineSession();
  }
}

export async function migrateLegacyToken() {
  const legacyKeys = Object.keys(localStorage).filter(key => 
    key.startsWith('sb-') && key.includes('-auth-token')
  );

  if (legacyKeys.length === 0) {
    return { migrated: false, reason: 'No legacy token found' };
  }

  let migrated = false;
  let lastError = null;

  for (const key of legacyKeys) {
    try {
      const tokenData = localStorage.getItem(key);
      if (!tokenData) continue;

      const response = await fetch('/api/auth/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legacyToken: tokenData }),
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.expired) {
          localStorage.removeItem(key);
          continue;
        }
        throw new Error(error.error || 'Migration failed');
      }

      const data = await response.json();
      localStorage.removeItem(key);
      await storeOfflineSession(data.user);
      migrated = true;
      
      const channel = new BroadcastChannel('auth-migration');
      channel.postMessage({ type: 'MIGRATION_SUCCESS', userId: data.user.id });
      channel.close();

    } catch (error) {
      console.error(`Migration failed for ${key}:`, error);
      lastError = error;
    }
  }

  if (migrated) {
    return { migrated: true };
  }

  throw new Error(lastError?.message || 'Migration failed');
}
