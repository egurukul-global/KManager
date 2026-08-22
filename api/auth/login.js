import { createClient } from '@supabase/supabase-js';

const getSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL || 'https://nvhaetvreopkktlxxdwg.supabase.co';
  const key = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52aGFldHZyZW9wa2t0bHh4ZHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Mzg3MDcsImV4cCI6MjA5NDAxNDcwN30.yjsQeAhjZfXYV_Od6lkdZCCBSgt00Z9Pb-9Ki-a79kA';
  return { url, key };
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const { url, key } = getSupabaseConfig();
    console.log('URL IS:', url, 'KEY IS:', key); const supabase = createClient(url, key);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('Login error:', error.message);
      return res.status(401).json({ error: error.message });
    }

    const { session, user } = data;

    const cookieOptions = [
      `Path=/`,
      `HttpOnly`,
      `Secure`,
      `SameSite=Lax`,
      `Max-Age=${60 * 60 * 24 * 7}`
    ].join('; ');

    res.setHeader('Set-Cookie', [
      `sb-access-token=${session.access_token}; ${cookieOptions}`,
      `sb-refresh-token=${session.refresh_token}; ${cookieOptions}`
    ]);

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role || 'user',
        name: user.user_metadata?.name || user.email,
        created_at: user.created_at
      },
      expires_at: session.expires_at
    });

  } catch (error) {
    console.error('Login handler error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

