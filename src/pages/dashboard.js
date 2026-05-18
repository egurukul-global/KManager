// ==================== DASHBOARD PAGE ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';

export function getDashboardPage() {
  return `
    <h1 class="page-title">Dashboard</h1>
    <div class="stats-grid">
      <div class="stat-card">
        <h3 id="dashTeamName">${state.currentTeam?.team_name || 'No Team'}</h3>
        <p>Current Team</p>
      </div>
      <div class="stat-card" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%);">
        <h3 id="dashBucketCount">-</h3>
        <p>Money Buckets</p>
      </div>
      <div class="stat-card" style="background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%);">
        <h3 id="dashBudgetCount">-</h3>
        <p>Active Budgets</p>
      </div>
      <div class="stat-card" style="background: linear-gradient(135deg, #17a2b8 0%, #138496 100%);">
        <h3 id="dashCategoryCount">-</h3>
        <p>Categories</p>
      </div>
    </div>
    <div class="card">
      <h2>👋 Welcome, ${state.user?.name || 'User'}!</h2>
      <p style="color: #666; line-height: 1.6;">
        You are viewing data for <strong>${state.currentTeam?.team_name || 'your team'}</strong>. 
        Use the team switcher in the sidebar to change context.<br><br>
        Your access level: <strong>${(state.userTeamAccess?.access_level || 'member').toUpperCase()}</strong>
      </p>
    </div>
    <div class="card">
      <h2>📊 Quick Stats</h2>
      <div class="stats-grid" style="margin-top: 15px;">
        <div class="stat-card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
          <h3 id="dashExpenseCount">-</h3>
          <p>This Month's Expenses</p>
        </div>
        <div class="stat-card" style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);">
          <h3 id="dashIncomeCount">-</h3>
          <p>This Month's Income</p>
        </div>
      </div>
    </div>
  `;
}

export async function initDashboardPage() {
  try {
    const teamId = state.currentTeam?.team_id;
    if (!teamId) return;

    // Count buckets
    const { count: bucketCount } = await supabaseClient
      .from('buckets')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('is_deleted', false);
    const bucketEl = document.getElementById('dashBucketCount');
    if (bucketEl) bucketEl.textContent = bucketCount || 0;

    // Count active budgets
    const { count: budgetCount } = await supabaseClient
      .from('budget_plans')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .in('status', ['draft', 'current'])
      .eq('is_deleted', false);
    const budgetEl = document.getElementById('dashBudgetCount');
    if (budgetEl) budgetEl.textContent = budgetCount || 0;

    // Count categories
    const { count: catCount } = await supabaseClient
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('is_deleted', false);
    const catEl = document.getElementById('dashCategoryCount');
    if (catEl) catEl.textContent = catCount || 0;

    // Count this month's expenses
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const { count: expenseCount } = await supabaseClient
      .from('expenses')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .gte('date', startOfMonth);
    const expEl = document.getElementById('dashExpenseCount');
    if (expEl) expEl.textContent = expenseCount || 0;

    // Count this month's income
    const { count: incomeCount } = await supabaseClient
      .from('income')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .gte('date', startOfMonth);
    const incEl = document.getElementById('dashIncomeCount');
    if (incEl) incEl.textContent = incomeCount || 0;

  } catch (e) {
    console.error('Dashboard load error:', e);
  }
}
