const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(
  ".select('id, email, name, role, team_id, gender, request_alias, request_counter, on_hold, notification_mode')",
  ".select('id, email, name, role, team_id, gender, request_alias, request_counter, on_hold, notification_mode, default_login_view, allowed_views')"
);

code = code.replace(
  ".select('id, email, name, role, team_id, gender, request_alias, request_counter, on_hold')",
  ".select('id, email, name, role, team_id, gender, request_alias, request_counter, on_hold, default_login_view, allowed_views')"
);

fs.writeFileSync('src/main.js', code, 'utf8');
console.log('Fixed main.js select query');
