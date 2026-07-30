import { createClient } from '@supabase/supabase-js';

const getSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL || 'https://nvhaetvreopkktlxxdwg.supabase.co';
  const key = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52aGFldHZyZW9wa2t0bHh4ZHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Mzg3MDcsImV4cCI6MjA5NDAxNDcwN30.yjsQeAhjZfXYV_Od6lkdZCCBSgt00Z9Pb-9Ki-a79kA';
  return { url, key };
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

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
          const cookieOptions = [
            `Path=/`,
            `HttpOnly`,
            `Secure`,
            `SameSite=Lax`,
            `Max-Age=${60 * 60 * 24 * 7}`
          ].join('; ');

          res.setHeader('Set-Cookie', [
            `sb-access-token=${refreshData.session.access_token}; ${cookieOptions}`,
            `sb-refresh-token=${refreshData.session.refresh_token}; ${cookieOptions}`
          ]);

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
