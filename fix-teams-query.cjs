const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-expenses.js', 'utf8');
code = code.replace(".from('teams').select('id, name').eq('is_deleted', false).order('name')", ".from('teams').select('id, name').order('name')");
fs.writeFileSync('src/pages/manager-expenses.js', code);
