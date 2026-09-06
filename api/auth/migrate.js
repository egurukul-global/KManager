import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../_lib/supabaseConfig.js';
import { applyCors } from '../_lib/cors.js';
import { setSessionCookies, setAccessOnlyCookie } from '../_lib/cookies.js';

export default async function handler(req, res) {
  applyCors(req, res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { legacyToken } = req.body;

    if (!legacyToken) {
      return res.status(400).json({ error: 'Legacy token required' });
    }

    // Reject oversized input before parsing/using it - a real Supabase session
    // blob is at most a few KB; anything past 8KB is abuse, not a legitimate token.
    const legacyTokenSize = typeof legacyToken === 'string'
      ? legacyToken.length
      : JSON.stringify(legacyToken).length;
    if (legacyTokenSize > 8192) {
      return res.status(400).json({ error: 'Invalid or expired token. Please login again.', expired: true });
    }

    const { url, key } = getSupabaseConfig();
    let tokenData;
    try {
      tokenData = typeof legacyToken === 'string' 
        ? JSON.parse(legacyToken) 
        : legacyToken;
    } catch {
      tokenData = { access_token: legacyToken };
    }

    const supabase = createClient(url, key);

    // If a refresh token was supplied, don't trust it blindly - exchange it with
    // Supabase and use the session Supabase hands back. This closes the gap where
    // an unverified client-supplied refresh_token would otherwise be written
    // straight into the response cookie (BUG-008).
    if (tokenData.refresh_token) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
        refresh_token: tokenData.refresh_token
      });

      if (refreshError || !refreshData.session) {
        console.error('Legacy token migration failed:', refreshError);
        return res.status(401).json({
          error: 'Invalid or expired token. Please login again.',
          expired: true
        });
      }

      setSessionCookies(res, {
        accessToken: refreshData.session.access_token,
        refreshToken: refreshData.session.refresh_token
      });

      const migratedUser = refreshData.user;
      return res.status(200).json({
        success: true,
        user: {
          id: migratedUser.id,
          email: migratedUser.email,
          role: migratedUser.role || 'user',
          name: migratedUser.user_metadata?.name || migratedUser.email,
          created_at: migratedUser.created_at
        },
        migrated: true
      });
    }

    // No refresh token in the legacy blob - verify the access token directly and
    // issue an access-only cookie (no refresh cookie, since we have nothing verified).
    const { data: { user }, error: verifyError } = await supabase.auth.getUser(
      tokenData.access_token
    );

    if (verifyError || !user) {
      console.error('Token verification failed:', verifyError);
      return res.status(401).json({
        error: 'Invalid or expired token. Please login again.',
        expired: true
      });
    }

    setAccessOnlyCookie(res, { accessToken: tokenData.access_token });

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role || 'user',
        name: user.user_metadata?.name || user.email,
        created_at: user.created_at
      },
      migrated: true
    });

  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
