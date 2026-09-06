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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Reject oversized input before it reaches Supabase - hashing/comparing a
    // multi-MB password wastes compute on every attempt (long-password DoS).
    // RFC 5321 caps mailbox length at 254; 256 is a generous password ceiling.
    if (email.length > 254 || password.length > 256) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const { url, key } = getSupabaseConfig();
    const supabase = createClient(url, key);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('Login error:', error.message);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { session, user } = data;

    setSessionCookies(res, {
      accessToken: session.access_token,
      refreshToken: session.refresh_token
    });

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

