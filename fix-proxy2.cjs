const fs = require('fs');
let code = fs.readFileSync('api/supabase-proxy.js', 'utf8');
code = code.replace(
    "console.error('Proxy error:', error.message);",
    "console.error('Proxy error:', error.message, error.cause);"
);
fs.writeFileSync('api/supabase-proxy.js', code, 'utf8');
console.log('Added error.cause logging');
