const fs = require('fs');
let code = fs.readFileSync('src/pages/user-mgmt.js', 'utf8');

const regexHTML = /<div class="card">\s*<div class="form-grid-row form-grid-row--user-filters">/;
const replHTML = `<div id="financeAppRoleManagerContainer"></div>
    <div class="card" style="margin-top: 30px;">
      <h2 style="margin-top:0; margin-bottom:15px;">Ops Team Membership (Legacy)</h2>
      <div class="form-grid-row form-grid-row--user-filters">`;

code = code.replace(regexHTML, replHTML);
fs.writeFileSync('src/pages/user-mgmt.js', code);
