import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nvhaetvreopkktlxxdwg.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52aGFldHZyZW9wa2t0bHh4ZHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Mzg3MDcsImV4cCI6MjA5NDAxNDcwN30.yjsQeAhjZfXYV_Od6lkdZCCBSgt00Z9Pb-9Ki-a79kA';

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];
if (process.env.APP_ORIGIN) {
  ALLOWED_ORIGINS.push(process.env.APP_ORIGIN);
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Prefer, x-client-info, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let accessToken = req.cookies?.['sb-access-token'];

    if (!accessToken) {
      return res.status(401).json({
        message: 'Unauthorized: No session found',
        code: 'UNAUTHORIZED'
      });
    }

    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = urlObj.searchParams.get('path');
    if (!path) {
      return res.status(400).json({ 
        error: 'Missing path parameter' 
      });
    }

    // SSRF Prevention: Validate path format and target origin
    if (path.includes('://') || path.startsWith('//') || path.includes('@')) {
      return res.status(400).json({ error: 'Invalid path format' });
    }

    const trustedSupabaseUrl = new URL(SUPABASE_URL);
    const targetUrlObj = new URL(path, trustedSupabaseUrl);

    if (targetUrlObj.protocol !== trustedSupabaseUrl.protocol || targetUrlObj.hostname !== trustedSupabaseUrl.hostname) {
      return res.status(403).json({ error: 'SSRF target forbidden' });
    }

    const targetUrl = targetUrlObj.toString();

    const headers = { ...req.headers };
    delete headers.host;
    delete headers['content-length'];
    delete headers['cookie'];
    delete headers['authorization'];
    delete headers['accept-encoding'];
    
    headers['authorization'] = `Bearer ${accessToken}`;
    
    if (SUPABASE_ANON_KEY && !headers['apikey']) {
      headers['apikey'] = SUPABASE_ANON_KEY;
    }

    let body = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body) {
        body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }
    }

    // ========== MAKE REQUEST TO SUPABASE ==========
    let response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: body,
      redirect: 'manual'
    });

    let responseData = await response.text();

    // Check if the response indicates an expired JWT / auth error
    const isExpiredToken = response.status === 401 && (
      responseData.toLowerCase().includes('jwt') || 
      responseData.toLowerCase().includes('expired') || 
      responseData.toLowerCase().includes('unauthorized')
    );

    if (isExpiredToken) {
      console.log('🔄 Access token expired. Attempting token rotation...');
      const refreshToken = req.cookies?.['sb-refresh-token'];

      if (refreshToken) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
          refresh_token: refreshToken
        });

        if (!refreshError && refreshData.session) {
          console.log('✅ Token rotated successfully!');
          const newAccessToken = refreshData.session.access_token;
          const newRefreshToken = refreshData.session.refresh_token;

          const cookieOptions = [
            `Path=/`,
            `HttpOnly`,
            `Secure`,
            `SameSite=Lax`,
            `Max-Age=${60 * 60 * 24 * 7}`
          ].join('; ');

          res.setHeader('Set-Cookie', [
            `sb-access-token=${newAccessToken}; ${cookieOptions}`,
            `sb-refresh-token=${newRefreshToken}; ${cookieOptions}`
          ]);

          // Retry the request with the new access token
          headers['authorization'] = `Bearer ${newAccessToken}`;

          response = await fetch(targetUrl, {
            method: req.method,
            headers: headers,
            body: body,
            redirect: 'manual'
          });

          responseData = await response.text();
        } else {
          console.error('❌ Token rotation failed:', refreshError);
        }
      }
    }

    res.status(response.status);
    if (response.status >= 400) {
      console.error('Supabase returned ' + response.status + ' for ' + path + '\nUrl: ' + targetUrl);
      const txt = responseData;
      console.error('Body: ', txt);
    }

    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() === 'content-length' || key.toLowerCase() === 'transfer-encoding') continue;
      if (key.toLowerCase() === 'content-encoding') continue;
      res.setHeader(key, value);
    }

    return res.send(responseData);

  } catch (error) {
    console.error('Proxy error:', error.message, error.cause);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
