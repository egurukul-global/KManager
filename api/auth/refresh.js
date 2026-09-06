import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../_lib/supabaseConfig.js';
import { applyCors } from '../_lib/cors.js';
import { setSessionCookies } from '../_lib/cookies.js';

export default async function handler(req, res) {
  applyCors(req, res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const refreshToken = req.cookies?.['sb-refresh-token'];

    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token found' });
    }

    const { url, key } = getSupabaseConfig();
    const supabase = createClient(url, key);

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (error || !data.session) {
      console.error('Refresh failed:', error);
      return res.status(401).json({ 
        error: 'Refresh failed. Please login again.'
      });
    }

    setSessionCookies(res, {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token
    });

    return res.status(200).json({
      success: true,
      expires_at: data.session.expires_at
    });

  } catch (error) {
    console.error('Refresh handler error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
