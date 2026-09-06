import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../_lib/supabaseConfig.js';
import { applyCors } from '../_lib/cors.js';
import { setSessionCookies } from '../_lib/cookies.js';

export default async function handler(req, res) {
  applyCors(req, res, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const accessToken = req.cookies?.['sb-access-token'];

    if (!accessToken) {
      return res.status(200).json({ 
        authenticated: false,
        error: 'No session found'
      });
    }

    const { url, key } = getSupabaseConfig();
    const supabase = createClient(url, key);

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      const refreshToken = req.cookies?.['sb-refresh-token'];
      if (refreshToken) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
          refresh_token: refreshToken
        });

        if (!refreshError && refreshData.session) {
          setSessionCookies(res, {
            accessToken: refreshData.session.access_token,
            refreshToken: refreshData.session.refresh_token
          });

          return res.status(200).json({
            authenticated: true,
            user: {
              id: refreshData.user.id,
              email: refreshData.user.email,
              role: refreshData.user.role || 'user',
              name: refreshData.user.user_metadata?.name || refreshData.user.email
            },
            refreshed: true
          });
        }
      }

      return res.status(200).json({ 
        authenticated: false,
        error: 'Session expired'
      });
    }

    return res.status(200).json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role || 'user',
        name: user.user_metadata?.name || user.email,
        created_at: user.created_at
      }
    });

  } catch (error) {
    console.error('Verify error:', error);
    return res.status(500).json({ 
      authenticated: false,
      error: 'Internal server error'
    });
  }
}
