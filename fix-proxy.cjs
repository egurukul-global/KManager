const fs = require('fs');
let code = fs.readFileSync('api/supabase-proxy.js', 'utf8');
code = code.replace(
    'res.status(response.status);',
    "res.status(response.status);\n    if (response.status >= 400) {\n      console.error('Supabase returned ' + response.status + ' for ' + path + '\\nUrl: ' + targetUrl);\n      const txt = await response.clone().text().catch(()=>'');\n      console.error('Body: ', txt);\n    }"
);
fs.writeFileSync('api/supabase-proxy.js', code, 'utf8');
console.log('Added logging for Supabase errors');
