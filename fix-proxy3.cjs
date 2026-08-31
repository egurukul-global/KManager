const fs = require('fs');
let code = fs.readFileSync('api/supabase-proxy.js', 'utf8');
code = code.replace(
    "const txt = await response.clone().text().catch(()=>'');",
    "const txt = responseData;"
);
fs.writeFileSync('api/supabase-proxy.js', code, 'utf8');
console.log('Fixed proxy response clone bug');
