const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

function getAllowedOrigins() {
  const configured = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return [...DEV_ORIGINS, ...configured];
}

// Sets CORS headers only when the request Origin is on the allowlist.
// Never reflects an arbitrary Origin back, and never falls back to '*' -
// both would let any site make credentialed requests against these endpoints.
export function applyCors(req, res, methods) {
  const origin = req.headers.origin;
  const allowed = getAllowedOrigins();

  res.setHeader('Vary', 'Origin');
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
