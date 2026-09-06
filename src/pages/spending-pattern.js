// ==================== MANAGER - SPENDING PATTERN REPORT ====================
// Compares a team's spending across the last 3/6/9/12 months against a
// selected budget's category/subcategory structure.
// Rows: categories + subcategories from category_master (full system list).
// Columns: Budgeted | Current Month | Month-1 | Month-2 | ...
// - Category row = rollup of subcategory rows + expenses without subcategory
// - Subcategory row = budgeted + expenses matching that subcategory
// - If expense has no subcategory info, it rolls up to the category row
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
window.supabaseClient = supabaseClient;
import { showToast } from '../components/toasts.js';
import { formatUsdDisplay } from '../utils/currency.js';
import { isFinanceGlobalAdmin } from '../utils/appRoles.js';
import { normalizeBudgetCategory, loadCategoryMaster } from '../utils/categoryMaster.js';
import { flattenBudgetToCategoryLines } from '../utils/budgetCategoryLines.js';

let spExpenses = [];
let spMonths = [];
let spPeriod = 6;
let spTeamId = '';
let spBudgetId = '';
let spCategoryMaster = [];
let spBudgetLines = [];

export function getSpendingPatternPage() {
  const allowedRoles = ['admin', 'cao', 'caoh', 'ceo', 'oh', 'fin', 'fip', 'fih'];
  const userRole = String(state.user?.role || '').toLowerCase();
  if (!allowedRoles.includes(userRole) && !isFinanceGlobalAdmin()) {
    return `
      <h1 class="page-title">Spending Pattern</h1>
      <div class="card">
        <h2>🔒 Access Denied</h2>
        <p>You do not have the required executive or finance permissions to view this report.</p>
      </div>
    `;
  }
  setTimeout(initSpendingPattern, 100);
  return `
    <h1 class="page-title">Spending Pattern</h1>
    <div class="card">
      <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 10px;">
        <div class="form-group" style="flex: 1; min-width: 200px; margin: 0;">
          <select id="spTeamFilter" onchange="window.onSpTeamChange()" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text);">
            <option value="">Select Team</option>
          </select>
        </div>
        <div class="form-group" style="flex: 1; min-width: 200px; margin: 0;">
          <select id="spBudgetFilter" onchange="window.onSpBudgetChange()" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text);">
            <option value="">Select Budget</option>
          </select>
        </div>
        <div class="form-group" style="flex: 0 0 auto; margin: 0; display: flex; gap: 4px;">
          <button type="button" class="sp-period-btn secondary small" data-months="3" onclick="window.setSpPeriod(3)" style="padding:8px 12px; font-size:0.85em;">3M</button>
          <button type="button" class="sp-period-btn secondary small" data-months="6" onclick="window.setSpPeriod(6)" style="padding:8px 12px; font-size:0.85em;">6M</button>
          <button type="button" class="sp-period-btn secondary small" data-months="9" onclick="window.setSpPeriod(9)" style="padding:8px 12px; font-size:0.85em;">9M</button>
          <button type="button" class="sp-period-btn secondary small" data-months="12" onclick="window.setSpPeriod(12)" style="padding:8px 12px; font-size:0.85em;">12M</button>
        </div>
        <div class="form-group" style="flex: 0 0 auto; margin: 0; display: flex; gap: 4px;">
          <button type="button" class="secondary small" onclick="window.exportSpendingPatternToCSV()" style="padding:8px 12px; font-size:0.85em;">CSV</button>
          <button type="button" class="secondary small" onclick="window.exportSpendingPatternToPDF()" style="padding:8px 12px; font-size:0.85em;">PDF</button>
        </div>
      </div>
      <div style="overflow-x: auto;" id="spTableContainer">
        <table class="data-table" style="min-width: 900px;">
          <thead id="spTableHead"></thead>
          <tbody id="spTableBody">
            <tr><td style="text-align:center;">Loading...</td></tr>
          </tbody>
        </table>
      </div>
      <p class="form-hint" style="margin-top: 8px;">All amounts in USD. Scroll horizontally to see all months.</p>
      <p class="form-hint" style="color: var(--warning, #f59e0b); margin-top: 4px;">⚠️ Expenses are not yet linked to categories. Expense columns will show 0 until expenses are upgraded to use category/subcategory.</p>
    </div>
  `;
}

function monthLabel(d) {
  return d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

function buildMonthRange(n) {
  const months = [];
  const now = new Date();
  // Newest month first, then decreasing (n-1 .. 0 back from current month).
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: monthLabel(d)
    });
  }
  return months;
}

async function loadAllCategories() {
  // Load ALL categories (active + inactive) for the report
  const { data: categories } = await supabaseClient
    .from('category_master')
    .select('id, name, sort_order, is_mandatory, is_active')
    .eq('is_deleted', false)
    .order('sort_order');
  const { data: subs } = await supabaseClient
    .from('subcategory_master')
    .select('id, category_master_id, name, sort_order, is_mandatory, is_active')
    .eq('is_deleted', false)
    .order('sort_order');
  if (!categories?.length) return [];
  return categories.map(cat => ({
    id: cat.id,
    name: cat.name,
    sort_order: cat.sort_order,
    is_mandatory: cat.is_mandatory,
    subcategories: (subs || [])
      .filter(s => s.category_master_id === cat.id)
      .map(s => ({ name: s.name, is_mandatory: s.is_mandatory }))
  }));
}

async function initSpendingPattern() {
  try {
    spCategoryMaster = await loadAllCategories();
    const teamSel = document.getElementById('spTeamFilter');
    if (teamSel && teamSel.options.length <= 1) {
      const isGlobal = isFinanceGlobalAdmin() ||
        ['admin', 'caoh', 'ceo', 'fin', 'fip', 'fih'].includes(String(state.user?.role || '').toLowerCase());
      if (isGlobal) {
        const { data: allTeams } = await supabaseClient.from('teams').select('id, name').order('name');
        (allTeams || []).forEach(t => {
          teamSel.innerHTML += `<option value="${t.id}">${escapeHtmlAttr(t.name)}</option>`;
        });
      } else {
        (state.teams || []).forEach(t => {
          teamSel.innerHTML += `<option value="${t.team_id}">${escapeHtmlAttr(t.team_name)}</option>`;
        });
      }
    }
    const budSel = document.getElementById('spBudgetFilter');
    if (budSel && budSel.options.length <= 1) {
      let bq = supabaseClient.from('budget_plans')
        .select('id, name, team_id, categories')
        .eq('is_deleted', false)
        .order('name');
      if (spTeamId) bq = bq.eq('team_id', spTeamId);
      const { data: budgets } = await bq;
      (budgets || []).forEach(b => {
        budSel.innerHTML += `<option value="${b.id}">${escapeHtmlAttr(b.name || b.id)}</option>`;
      });
    }
    window.setSpPeriod(spPeriod);
  } catch (err) {
    console.error('Spending Pattern init error:', err);
    showToast('Failed to load Spending Pattern: ' + err.message, 'error');
  }
}

function escapeHtmlAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

window.onSpTeamChange = function () {
  spTeamId = document.getElementById('spTeamFilter')?.value || '';
  spBudgetId = '';
  const budSel = document.getElementById('spBudgetFilter');
  if (budSel) {
    budSel.innerHTML = '<option value="">Select Budget</option>';
    let bq = supabaseClient.from('budget_plans')
      .select('id, name, team_id, categories')
      .eq('is_deleted', false)
      .order('name');
    if (spTeamId) bq = bq.eq('team_id', spTeamId);
    bq.then(({ data }) => {
      (data || []).forEach(b => {
        budSel.innerHTML += `<option value="${b.id}">${escapeHtmlAttr(b.name || b.id)}</option>`;
      });
    });
  }
  loadSpendingData();
};

window.onSpBudgetChange = function () {
  spBudgetId = document.getElementById('spBudgetFilter')?.value || '';
  loadSpendingData();
};

window.setSpPeriod = function (months) {
  spPeriod = months;
  document.querySelectorAll('.sp-period-btn').forEach(btn => {
    const active = Number(btn.dataset.months) === months;
    btn.style.background = active ? 'var(--primary)' : '';
    btn.style.color = active ? 'white' : '';
  });
  loadSpendingData();
};

async function loadSpendingData() {
  try {
    spMonths = buildMonthRange(spPeriod);
    spBudgetLines = [];
    if (spBudgetId) {
      const { data: budget } = await supabaseClient.from('budget_plans')
        .select('categories')
        .eq('id', spBudgetId)
        .single();
      if (budget?.categories) {
        spBudgetLines = flattenBudgetToCategoryLines(budget.categories);
      }
    }
    // spMonths is newest-first, so the OLDEST month is the last element.
    const oldestMonth = spMonths[spMonths.length - 1].key;
    const firstMonth = `${oldestMonth}-01`;
    const now = new Date();
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const lastDate = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, '0')}-${String(lastMonthEnd.getDate()).padStart(2, '0')}`;
    let q = supabaseClient
      .from('expenses')
      .select('id, date, usd_amount, category_id, subcategory_id, vendor_info, category_master(name), subcategory_master(name)')
      .eq('is_deleted', false)
      .gte('date', firstMonth)
      .lte('date', lastDate)
      .order('date', { ascending: true });
    if (spTeamId) q = q.eq('team_id', spTeamId);
    else if (!isFinanceGlobalAdmin()) {
      const teamIds = (state.teams || []).map(t => t.team_id);
      if (teamIds.length > 0) q = q.in('team_id', teamIds);
    }
    const { data, error } = await q;
    if (error) throw error;
    spExpenses = data || [];
    console.log('[SP] Loaded expenses:', spExpenses.length);
    console.log('[SP] Sample expense full:', JSON.stringify(spExpenses[0], null, 2));
    console.log('[SP] Budget lines:', JSON.stringify(spBudgetLines, null, 2));
    console.log('[SP] Category master names:', spCategoryMaster.map(c => c.name));
    renderSpendingTable();
  } catch (err) {
    console.error('Spending Pattern load error:', err);
    showToast('Failed to load expenses: ' + err.message, 'error');
  }
}

function resolveExpenseCategory(e) {
  if (e.vendor_info && e.vendor_info.startsWith('budget_cat:')) {
    const raw = e.vendor_info.replace('budget_cat:', '');
    const line = normalizeBudgetCategory({ name: raw });
    return { category: line.category || raw, subcategory: line.subcategory || null };
  }
  return {
    category: e.category_master?.name || null,
    subcategory: e.subcategory_master?.name || null
  };
}

function monthKeyOf(dateStr) {
  return String(dateStr || '').substring(0, 7);
}

function getBudgetedAmount(category, subcategory) {
  const line = spBudgetLines.find(l =>
    (l.category || '').toLowerCase() === (category || '').toLowerCase() &&
    ((l.subcategory || '')).toLowerCase() === ((subcategory || '')).toLowerCase()
  );
  return line ? (line.usdAmount || line.usd_amount || 0) : 0;
}

function renderSpendingTable() {
  const thead = document.getElementById('spTableHead');
  const tbody = document.getElementById('spTableBody');
  if (!thead || !tbody) return;
  const hasBudget = spBudgetId && spBudgetLines.length > 0;
  const budgetCol = hasBudget ? '<th>Budgeted</th>' : '';
  thead.innerHTML = `<tr><th>Category</th><th>Sub Category</th>${budgetCol}` +
    spMonths.map(m => `<th>${m.label}</th>`).join('') + '</tr>';
  if (!spBudgetId) {
    tbody.innerHTML = `<tr><td colspan="${2 + spMonths.length + (hasBudget ? 1 : 0)}" style="text-align:center;">Select a budget to generate the report.</td></tr>`;
    return;
  }
  const rows = [];
  for (const cat of spCategoryMaster) {
    const catName = cat.name;
    const subcategories = cat.subcategories || [];
    if (subcategories.length === 0) {
      const budgeted = getBudgetedAmount(catName, '');
      const monthly = spMonths.map(m =>
        spExpenses.filter(e => {
          if (monthKeyOf(e.date) !== m.key) return false;
          const r = resolveExpenseCategory(e);
          return r.category?.toLowerCase() === catName.toLowerCase() && !r.subcategory;
        }).reduce((s, e) => s + (e.usd_amount || 0), 0)
      );
      rows.push({ category: catName, subcategory: null, budgeted, monthly, isSub: false });
    } else {
      let catBudgeted = 0;
      let catMonthly = spMonths.map(() => 0);
      for (const sub of subcategories) {
        const subName = sub.name;
        const budgeted = getBudgetedAmount(catName, subName);
        const monthly = spMonths.map(m =>
          spExpenses.filter(e => {
            if (monthKeyOf(e.date) !== m.key) return false;
            const r = resolveExpenseCategory(e);
            return r.category?.toLowerCase() === catName.toLowerCase() &&
              r.subcategory?.toLowerCase() === subName.toLowerCase();
          }).reduce((s, e) => s + (e.usd_amount || 0), 0)
        );
        catBudgeted += budgeted;
        catMonthly = catMonthly.map((v, i) => v + monthly[i]);
        rows.push({ category: catName, subcategory: subName, budgeted, monthly, isSub: true });
      }
      const uncatMonthly = spMonths.map(m =>
        spExpenses.filter(e => {
          if (monthKeyOf(e.date) !== m.key) return false;
          const r = resolveExpenseCategory(e);
          return r.category?.toLowerCase() === catName.toLowerCase() && !r.subcategory;
        }).reduce((s, e) => s + (e.usd_amount || 0), 0)
      );
      catMonthly = catMonthly.map((v, i) => v + uncatMonthly[i]);
      // Category-level (no subcategory) budgeted amount also rolls up
      catBudgeted += getBudgetedAmount(catName, '');
      rows.splice(rows.length - subcategories.length, 0, {
        category: catName, subcategory: null, budgeted: catBudgeted, monthly: catMonthly, isSub: false
      });
    }
  }
  console.log('[SP] Generated rows:', JSON.stringify(rows.slice(0, 10), null, 2));
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${2 + spMonths.length + (hasBudget ? 1 : 0)}" style="text-align:center;">No categories found.</td></tr>`;
    return;
  }
  let html = '';
  for (const row of rows) {
    const style = row.isSub ? '' : 'font-weight: bold; background: var(--bg-secondary);';
    const bCol = hasBudget ? `<td>${formatUsdDisplay(row.budgeted)}</td>` : '';
    const subDisplay = row.isSub ? escapeHtmlAttr(row.subcategory) : '';
    html += `<tr style="${style}">
      <td>${escapeHtmlAttr(row.category)}</td>
      <td>${subDisplay}</td>
      ${bCol}
      ${row.monthly.map(v => `<td>${formatUsdDisplay(v)}</td>`).join('')}
    </tr>`;
  }
  // Total only category (parent) rows to avoid double-counting subcategory rows.
  const catOnly = rows.filter(r => !r.isSub);
  const totalBudgeted = catOnly.reduce((s, r) => s + r.budgeted, 0);
  const totalMonthly = spMonths.map((_, i) => catOnly.reduce((s, r) => s + r.monthly[i], 0));
  const tCol = hasBudget ? `<td>${formatUsdDisplay(totalBudgeted)}</td>` : '';
  html += `<tr style="font-weight: bold; border-top: 2px solid var(--border);">
    <td colspan="${2 + (hasBudget ? 1 : 0)}">TOTAL</td>
    ${totalMonthly.map(v => `<td>${formatUsdDisplay(v)}</td>`).join('')}
  </tr>`;
  tbody.innerHTML = html;
}

function getSpExportRows() {
  if (!spBudgetId) return null;
  const hasBudget = spBudgetLines.length > 0;
  const headers = ['Category', 'Sub Category'];
  if (hasBudget) headers.push('Budgeted');
  headers.push(...spMonths.map(m => m.label));
  const rows = [];
  for (const cat of spCategoryMaster) {
    const catName = cat.name;
    const subcategories = cat.subcategories || [];
    if (subcategories.length === 0) {
      const budgeted = getBudgetedAmount(catName, '');
      const monthly = spMonths.map(m =>
        spExpenses.filter(e => {
          if (monthKeyOf(e.date) !== m.key) return false;
          const r = resolveExpenseCategory(e);
          return r.category?.toLowerCase() === catName.toLowerCase() && !r.subcategory;
        }).reduce((s, e) => s + (e.usd_amount || 0), 0)
      );
      const row = [catName, ''];
      if (hasBudget) row.push(budgeted.toFixed(2));
      row.push(...monthly.map(v => v.toFixed(2)));
      rows.push(row);
    } else {
      let catBudgeted = 0;
      let catMonthly = spMonths.map(() => 0);
      for (const sub of subcategories) {
        const subName = sub.name;
        const budgeted = getBudgetedAmount(catName, subName);
        const monthly = spMonths.map(m =>
          spExpenses.filter(e => {
            if (monthKeyOf(e.date) !== m.key) return false;
            const r = resolveExpenseCategory(e);
            return r.category?.toLowerCase() === catName.toLowerCase() &&
              r.subcategory?.toLowerCase() === subName.toLowerCase();
          }).reduce((s, e) => s + (e.usd_amount || 0), 0)
        );
        catBudgeted += budgeted;
        catMonthly = catMonthly.map((v, i) => v + monthly[i]);
        const subRow = [catName, subName];
        if (hasBudget) subRow.push(budgeted.toFixed(2));
        subRow.push(...monthly.map(v => v.toFixed(2)));
        rows.push(subRow);
      }
      // Category-level (no subcategory) budgeted amount also rolls up
      catBudgeted += getBudgetedAmount(catName, '');
      const uncatMonthly = spMonths.map(m =>
        spExpenses.filter(e => {
          if (monthKeyOf(e.date) !== m.key) return false;
          const r = resolveExpenseCategory(e);
          return r.category?.toLowerCase() === catName.toLowerCase() && !r.subcategory;
        }).reduce((s, e) => s + (e.usd_amount || 0), 0)
      );
      catMonthly = catMonthly.map((v, i) => v + uncatMonthly[i]);
      const catRow = [catName, ''];
      if (hasBudget) catRow.push(catBudgeted.toFixed(2));
      catRow.push(...catMonthly.map(v => v.toFixed(2)));
      rows.splice(rows.length - subcategories.length, 0, catRow);
    }
  }
  // Total only parent (category) rows — subcategory rows are rolled into them.
  const maxCols = headers.length;
  let totalBudgeted = 0;
  const totalMonthly = spMonths.map(() => 0);
  rows.forEach(r => {
    if (r[0] === 'TOTAL') return;
    const isParent = !r[1]; // parent rows have empty subcategory column
    if (!isParent) return;
    if (hasBudget) totalBudgeted += parseFloat(r[2] || 0);
    // Sum only the month columns (after Category/Sub Category/Budgeted)
    const monthStart = hasBudget ? 3 : 2;
    for (let mi = 0; mi < spMonths.length; mi++) {
      totalMonthly[mi] += parseFloat(r[monthStart + mi] || 0);
    }
  });
  const totalRow = ['TOTAL', ''];
  if (hasBudget) totalRow.push(totalBudgeted.toFixed(2));
  totalRow.push(...totalMonthly.map(v => v.toFixed(2)));
  rows.push(totalRow);
  return { headers, rows };
}

window.exportSpendingPatternToCSV = function () {
  const data = getSpExportRows();
  if (!data || data.rows.length <= 1) {
    showToast('No data to export. Select a budget first.', 'warning');
    return;
  }
  import('../utils/exportCsv.js').then(m => {
    m.downloadCSV('Spending_Pattern_' + spPeriod + 'M_' + new Date().toISOString().slice(0, 10) + '.csv',
      m.convertArrayOfObjectsToCSV(data.rows, data.headers));
    showToast('Spending Pattern CSV downloaded.', 'success');
  });
};

window.exportSpendingPatternToPDF = function () {
  const data = getSpExportRows();
  if (!data || data.rows.length <= 1) {
    showToast('No data to export. Select a budget first.', 'warning');
    return;
  }
  try {
    const pdfLib = window.pdfMake;
    if (!pdfLib) throw new Error('pdfmake is not loaded');
    pdfLib.createPdf({
      content: [
        { text: 'Spending Pattern Report (' + spPeriod + ' Months)', style: 'header' },
        { text: 'Generated on: ' + new Date().toLocaleString() + '  |  All amounts in USD', margin: [0, 0, 0, 10] },
        {
          table: {
            headerRows: 1,
            dontBreakRows: true,
            widths: ['auto', 'auto', ...spMonths.map(() => 'auto')],
            body: [data.headers, ...data.rows]
          }
        }
      ],
      styles: { header: { fontSize: 16, bold: true, margin: [0, 0, 0, 10] } },
      defaultStyle: { fontSize: 8 }
    }).download('Spending_Pattern_' + spPeriod + 'M_' + new Date().toISOString().slice(0, 10) + '.pdf');
  } catch (e) {
    console.error(e);
    showToast('Failed to generate PDF: ' + e.message, 'error');
  }
};
