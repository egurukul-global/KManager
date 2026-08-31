const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-expenses.js', 'utf8');
code = code.replace("import { supabaseClient } from '../supabaseClient.js';", "import { supabaseClient } from '../db.js';");
fs.writeFileSync('src/pages/manager-expenses.js', code);
