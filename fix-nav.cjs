const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

// We need to inject the View logic into applyNavPermissions
const oldLogic = `export function applyNavPermissions() {
  const otm = isOtmOnly();
  const oht = isOhtReadOnly();
  const viewOnly = isViewOnly();`;

const newLogic = `
const VIEW_MENUS = {
  team: {
    sections: ['dashboard', 'setup', 'budgets', 'income', 'expense', 'financials', 'reports'],
    pages: ['dashboard', 'profile', 'approval-portal', 'buckets', 'rates', 'view-budgets', 'create-budget', 'add-funds', 'transfer', 'income-manager', 'my-income', 'add-expense', 'expense-manager', 'generate-receipt', 'financial-status', 'reconcile', 'reconciliation-overview', 'reconciliation-approval', 'expense-reports', 'my-finances']
  },
  manager: {
    sections: ['setup', 'financials', 'reports'],
    pages: ['buckets', 'manager-finance', 'aggregate-reports']
  },
  admin: {
    sections: ['admin', 'setup'],
    pages: ['team-mgmt', 'role-assignments', 'user-mgmt', 'budget-calendar', 'category-master', 'categories']
  }
};

export function applyNavPermissions() {
  const otm = isOtmOnly();
  const oht = isOhtReadOnly();
  const viewOnly = isViewOnly();
  
  const viewMode = state.activeViewContext || 'team';
  const allowedViewPages = new Set(VIEW_MENUS[viewMode]?.pages || []);
  const allowedViewSections = new Set(VIEW_MENUS[viewMode]?.sections || []);
  
  // 1. Hide/Show top-level sections
  document.querySelectorAll('.nav-item').forEach(el => {
    const section = el.dataset.section;
    if (section && !allowedViewSections.has(section)) {
      el.style.display = 'none';
    } else {
      el.style.display = '';
    }
  });
  
  // 2. Hide/Show Team Switcher
  const ts = document.getElementById('teamSwitcherContainer');
  if (ts) {
    ts.style.display = viewMode === 'team' ? 'flex' : 'none';
  }`;

code = code.replace(oldLogic, newLogic);

// Now apply the page-level restrictions
const oldPageLoop = `  document.querySelectorAll('.nav-subitem[data-page]').forEach(el => {
    const page = el.dataset.page;
    let hide = false;`;

const newPageLoop = `  document.querySelectorAll('.nav-subitem[data-page]').forEach(el => {
    const page = el.dataset.page;
    let hide = false;
    
    if (!allowedViewPages.has(page)) hide = true;`;

code = code.replace(oldPageLoop, newPageLoop);

fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
console.log('Fixed navPermissions.js');
