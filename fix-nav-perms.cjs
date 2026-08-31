const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

const targetManager = `  manager: {
    sections: ['setup', 'financials', 'reports'],
    pages: ['buckets', 'manager-finance', 'aggregate-reports']
  },`;
const newManager = `  manager: {
    sections: ['dashboard', 'income', 'financials', 'reports'],
    pages: ['profile', 'approval-portal', 'transfer', 'manager-finance', 'aggregate-reports']
  },`;

const targetAdmin = `  admin: {
    sections: ['admin', 'setup'],
    pages: ['team-mgmt', 'role-assignments', 'user-mgmt', 'budget-calendar', 'category-master', 'categories']
  }`;
const newAdmin = `  admin: {
    sections: ['admin', 'setup'],
    pages: ['team-mgmt', 'role-assignments', 'user-mgmt', 'budget-calendar', 'category-master', 'categories', 'buckets']
  }`;

code = code.replace(targetManager, newManager);
code = code.replace(targetAdmin, newAdmin);

fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
