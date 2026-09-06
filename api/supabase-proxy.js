import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './_lib/supabaseConfig.js';
import { applyCors } from './_lib/cors.js';
import { setSessionCookies } from './_lib/cookies.js';

const { url: SUPABASE_URL, key: SUPABASE_ANON_KEY } = getSupabaseConfig();

export default async function handler(req, res) {
  applyCors(req, res, 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
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

          setSessionCookies(res, { accessToken: newAccessToken, refreshToken: newRefreshToken });

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
