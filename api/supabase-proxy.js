const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nvhaetvreopkktlxxdwg.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Prefer, x-client-info, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const accessToken = req.cookies?.['sb-access-token'];

    if (!accessToken) {
      return res.status(401).json({
        message: 'Unauthorized: No session found',
        code: 'UNAUTHORIZED'
      });
    }

    const { path } = req.query;
    if (!path) {
      return res.status(400).json({ 
        error: 'Missing path parameter' 
      });
    }

    const decodedPath = decodeURIComponent(path);
    const targetUrl = `${SUPABASE_URL}${decodedPath}`;

    const headers = { ...req.headers };
    delete headers.host;
    delete headers['content-length'];
    delete headers['cookie'];
    delete headers['authorization'];
    
    headers['authorization'] = `Bearer ${accessToken}`;
    
    const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52aGFldHZyZW9wa2t0bHh4ZHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Mzg3MDcsImV4cCI6MjA5NDAxNDcwN30.yjsQeAhjZfXYV_Od6lkdZCCBSgt00Z9Pb-9Ki-a79kA';
    if (supabaseKey && !headers['apikey']) {
      headers['apikey'] = supabaseKey;
    }

    let body = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body) {
        body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }
    }

    // ========== MAKE REQUEST TO SUPABASE ==========
    console.log(`[Proxy] Forwarding to: ${targetUrl}`);
    console.log(`[Proxy] Auth Header: Bearer ${accessToken ? accessToken.substring(0, 15) : 'NONE'}...`);
    console.log(`[Proxy] API Key: ${headers['apikey'] ? headers['apikey'].substring(0, 15) : 'NONE'}...`);

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: body,
      redirect: 'manual'
    });

    // ========== READ RESPONSE ==========
    const responseData = await response.text();
    console.log(`[Proxy] Supabase responded with status: ${response.status}`);
    if (response.status >= 400) {
      console.log(`[Proxy] Supabase Error Body: ${responseData.substring(0, 200)}`);
    }

    // ========== FORWARD RESPONSE ==========
    res.status(response.status);

    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() === 'content-encoding') continue;
      res.setHeader(key, value);
    }

    return res.send(responseData);

  } catch (error) {
    console.error('Proxy error:', error.message);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
