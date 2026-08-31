const fs = require('fs');
let code = fs.readFileSync('src/pages/user-mgmt.js', 'utf8');

// Insert the import
code = code.replace(
  "import { showToast, showConfirm } from '../components/toasts.js';",
  "import { showToast, showConfirm } from '../components/toasts.js';\nimport { renderAppRoleManager } from '../components/AppRoleManager.js';\nimport { isFinanceGlobalAdmin } from '../utils/appRoles.js';"
);

const renderLogic = `    <div id="financeAppRoleManagerContainer" style="margin-top: 30px;"></div>
    
    <div class="card" style="margin-top: 30px;">
      <h2 style="margin-top:0;">Ops Team Membership (Legacy)</h2>`;

code = code.replace(
  /<div class="card">\s*<h2 style="margin-top:0;">Team Membership<\/h2>/,
  renderLogic
);

// We need to inject the initializer inside initUserMgmtPage
const initLogic = `  if (isFinanceGlobalAdmin()) {
    renderAppRoleManager('financeAppRoleManagerContainer', 'finance');
  }`;

const regexInit = /export async function initUserMgmtPage\(\) \{/;
code = code.replace(regexInit, "export async function initUserMgmtPage() {\n" + initLogic);

fs.writeFileSync('src/pages/user-mgmt.js', code);
