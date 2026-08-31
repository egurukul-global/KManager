const fs = require('fs');
let code = fs.readFileSync('api/supabase-proxy.js', 'utf8');
code = code.replace(
    "delete headers['authorization'];",
    "delete headers['authorization'];\n    delete headers['accept-encoding'];"
);
fs.writeFileSync('api/supabase-proxy.js', code, 'utf8');
console.log('Stripped accept-encoding');
