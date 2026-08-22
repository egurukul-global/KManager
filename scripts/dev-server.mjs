import WebSocket from 'ws';
global.WebSocket = WebSocket;
import http from 'http';
import url from 'url';

// Import the handlers
import loginHandler from '../api/auth/login.js';
import logoutHandler from '../api/auth/logout.js';
import verifyHandler from '../api/auth/verify.js';
import refreshHandler from '../api/auth/refresh.js';
import migrateHandler from '../api/auth/migrate.js';
import proxyHandler from '../api/supabase-proxy.js';

const PORT = 3000;

const parseCookies = (cookieHeader) => {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts.shift().trim();
    const val = parts.join('=');
    if (name) {
      list[name] = decodeURIComponent(val.trim());
    }
  });
  return list;
};

const parseBody = (req) => {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve(body);
      }
    });
  });
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Add cookies and query parsing helpers to matching Vercel signatures
  req.cookies = parseCookies(req.headers.cookie);
  req.query = parsedUrl.query;
  
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    req.body = await parseBody(req);
  }

  // Response wrappers matching Vercel Helper API signatures
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  
  res.json = (obj) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
    return res;
  };

  res.send = (data) => {
    res.end(data);
    return res;
  };

  console.log(`[API] ${req.method} ${pathname}`);

  try {
    if (pathname === '/api/auth/login') {
      await loginHandler(req, res);
    } else if (pathname === '/api/auth/logout') {
      await logoutHandler(req, res);
    } else if (pathname === '/api/auth/verify') {
      await verifyHandler(req, res);
    } else if (pathname === '/api/auth/refresh') {
      await refreshHandler(req, res);
    } else if (pathname === '/api/auth/migrate') {
      await migrateHandler(req, res);
    } else if (pathname === '/api/supabase-proxy') {
      await proxyHandler(req, res);
    } else {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (error) {
    console.error(`[API ERROR]`, error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal server error', message: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Local dev API server running at http://localhost:${PORT}`);
});

