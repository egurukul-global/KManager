// ==================== BUDGET CALENDAR (ADMIN) ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { showToast } from '../components/toasts.js';
import { computeSubmissionDeadline, formatDisplayDate } from '../utils/budgetCalendar.js';
import { btnIconEdit, btnIconDelete } from '../utils/uiHelpers.js';

function isOrgAdmin() {
  return ['admin', 'caoh', 'oh', 'ceo'].includes(state.user?.role);
}

export function getBudgetCalendarPage() {
  if (!isOrgAdmin()) {
    return `
      <h1 class="page-title">Budget Calendar</h1>
      <div class="card"><h2>⛔ Access Denied</h2><p>Only org admins can manage the budget calendar.</p></div>
    `;
  }

  const currentYear = new Date().getFullYear();

  return `
    <h1 class="page-title">Budget Calendar</h1>
    <p style="color: var(--text-secondary); margin-bottom: 16px;">
      Add each budget period date from the Hindu calendar. Multiple periods can fall in the same month — each <strong>date is unique</strong>.
      Teams submit monthly budgets by <strong>10 days before</strong> the period date.
    </p>

    <div class="card">
      <h2>📅 Add / Edit Period</h2>
      <form id="calendarForm" onsubmit="window.saveCalendarEntry(event)">
        <input type="hidden" id="calendarEntryId">
        <div class="form-stack">
          <div class="form-grid-row form-grid-row--calendar">
            <div class="form-group"><label>Period Date *</label><input type="date" id="calendarPeriodDate" required onchange="window.updateCalendarDeadlinePreview()"></div>
            <div class="form-group"><label>Deadline (T−10)</label><input type="text" id="calendarDeadlinePreview" readonly placeholder="Auto"></div>
            <div class="form-group"><label>Label</label><input type="text" id="calendarLabel" placeholder="Ashadh period"></div>
          </div>
          <div class="form-group"><label>Notes</label><textarea id="calendarNotes" rows="2" placeholder="Internal note"></textarea></div>
        </div>
        <div class="btn-group">
          <button type="submit">Save Entry</button>
          <button type="button" class="secondary" onclick="window.resetCalendarForm()">Clear</button>
        </div>
      </form>
    </div>

    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <h2 style="margin:0;">Calendar Entries</h2>
        <div class="form-group" style="margin:0; min-width:140px;">
          <label>Show</label>
          <select id="calendarFilter" onchange="window.loadCalendarEntries()">
            <option value="upcoming" selected>Upcoming</option>
            <option value="${currentYear}">${currentYear}</option>
            <option value="${currentYear + 1}">${currentYear + 1}</option>
            <option value="all">All dates</option>
          </select>
        </div>
      </div>
      <div class="table-container">
        <table class="table-stack-mobile">
          <thead>
            <tr>
              <th>Period Date</th>
              <th>Submit By</th>
              <th>Label</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="calendarEntriesList">
            <tr><td colspan="5" class="empty-state">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export async function initBudgetCalendarPage() {
  if (!isOrgAdmin()) return;

  window.saveCalendarEntry = saveCalendarEntry;
  window.resetCalendarForm = resetCalendarForm;
  window.updateCalendarDeadlinePreview = updateCalendarDeadlinePreview;
  window.loadCalendarEntries = loadCalendarEntries;
  window.editCalendarEntry = editCalendarEntry;
  window.deleteCalendarEntry = deleteCalendarEntry;

  await loadCalendarEntries();
}

function updateCalendarDeadlinePreview() {
  const periodDate = document.getElementById('calendarPeriodDate')?.value;
  const preview = document.getElementById('calendarDeadlinePreview');
  if (preview) {
    preview.value = periodDate ? formatDisplayDate(computeSubmissionDeadline(periodDate)) : '';
  }
}

function resetCalendarForm() {
  document.getElementById('calendarEntryId').value = '';
  document.getElementById('calendarForm').reset();
  updateCalendarDeadlinePreview();
}

let calendarEntriesList = [];

function filterEntriesByYear(entries, year) {
  const prefix = `${year}-`;
  return entries.filter(e => e.budget_period_date.startsWith(prefix));
}

async function loadCalendarEntries() {
  const tbody = document.getElementById('calendarEntriesList');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Loading…</td></tr>';

  const filter = document.getElementById('calendarFilter')?.value || 'upcoming';
  const today = new Date().toISOString().split('T')[0];

  try {
    const { data, error } = await supabaseClient
      .from('budget_calendar_entries')
      .select('*')
      .eq('is_deleted', false)
      .order('budget_period_date');

    if (error) throw error;

    let filtered = data || [];

    if (filter === 'upcoming') {
      filtered = filtered.filter(e => e.submission_deadline >= today);
    } else if (filter !== 'all') {
      filtered = filterEntriesByYear(filtered, parseInt(filter, 10));
    }

    calendarEntriesList = filtered;

    if (!calendarEntriesList.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No calendar entries yet. Add period dates above.</td></tr>';
      return;
    }

    tbody.innerHTML = calendarEntriesList.map(entry => `
      <tr>
        <td data-label="Period"><strong>${formatDisplayDate(entry.budget_period_date)}</strong></td>
        <td data-label="Submit By">${formatDisplayDate(entry.submission_deadline)}</td>
        <td data-label="Label">${entry.label || '—'}</td>
        <td data-label="Notes">${entry.notes || '—'}</td>
        <td data-label="Actions" class="action-buttons">
          ${btnIconEdit(`window.editCalendarEntry('${entry.id}')`)}
          ${btnIconDelete(`window.deleteCalendarEntry('${entry.id}')`)}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Load calendar error:', err);
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state" style="color:#dc3545;">${err.message}. Run the SQL migration first.</td></tr>`;
  }
}

function editCalendarEntry(id) {
  const entry = calendarEntriesList.find(e => e.id === id);
  if (!entry) return;
  document.getElementById('calendarEntryId').value = entry.id;
  document.getElementById('calendarPeriodDate').value = entry.budget_period_date;
  document.getElementById('calendarLabel').value = entry.label || '';
  document.getElementById('calendarNotes').value = entry.notes || '';
  updateCalendarDeadlinePreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveCalendarEntry(e) {
  e.preventDefault();
  const id = document.getElementById('calendarEntryId').value;
  const budget_period_date = document.getElementById('calendarPeriodDate').value;
  const submission_deadline = computeSubmissionDeadline(budget_period_date);
  const label = document.getElementById('calendarLabel').value.trim() || null;
  const notes = document.getElementById('calendarNotes').value.trim() || null;

  const payload = {
    budget_period_date,
    submission_deadline,
    label,
    notes,
    updated_at: new Date().toISOString()
  };

  try {
    if (id) {
      const { error } = await supabaseClient.from('budget_calendar_entries').update(payload).eq('id', id);
      if (error) throw error;
      showToast('Calendar entry updated', 'success');
    } else {
      payload.created_by = state.user?.id;
      const { error } = await supabaseClient.from('budget_calendar_entries').insert(payload);
      if (error) throw error;
      showToast('Calendar entry added', 'success');
    }
    resetCalendarForm();
    await loadCalendarEntries();
  } catch (err) {
    console.error('Save calendar error:', err);
    const msg = err.message?.includes('budget_calendar_period_date_unique')
      ? 'This date already exists in the calendar'
      : (err.message || 'Failed to save');
    showToast(msg, 'error');
  }
}

async function deleteCalendarEntry(id) {
  if (!confirm('Delete this calendar entry?')) return;
  try {
    const { error } = await supabaseClient
      .from('budget_calendar_entries')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    showToast('Entry deleted', 'success');
    await loadCalendarEntries();
  } catch (err) {
    showToast(err.message || 'Delete failed', 'error');
  }
}
