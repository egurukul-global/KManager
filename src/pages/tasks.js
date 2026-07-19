// ==================== UNIFIED TASK BOARD ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { setButtonLoading } from '../utils/uiHelpers.js';

let activeTasks = [];
let teamMembers = [];
let editingTaskId = null;

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

export function getTasksPage() {
  const team = state.currentTeam;
  if (!team) {
    return `
      <h1 class="page-title">Task Board</h1>
      <div class="card"><p class="empty-state">Select a team from the sidebar dropdown first.</p></div>
    `;
  }

  if (team.has_tasks_access === false) {
    return `
      <h1 class="page-title">Task Board</h1>
      <div class="card"><p class="empty-state">⚠️ Task &amp; Issue tracker is disabled for the team "${escapeHtml(team.team_name || team.name)}". Enable it under Teams settings.</p></div>
    `;
  }

  return `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h1 class="page-title" style="margin:0;">Tasks — ${escapeHtml(team.team_name || team.name)}</h1>
      <button type="button" class="success" onclick="window.openCreateTaskModal()">+ Add Task</button>
    </div>

    <!-- Kanban Board -->
    <div class="kanban-board" style="display:flex; gap:16px; overflow-x:auto; padding-bottom:16px; align-items:flex-start;">
      <div class="kanban-column" data-status="backlog" style="flex:1; min-width:260px; background:#f3f4f6; border-radius:8px; padding:12px;">
        <h3 style="margin-top:0; font-size:1em; color:#4b5563; border-bottom:2px solid #9ca3af; padding-bottom:6px;">📥 Backlog</h3>
        <div class="kanban-cards-list" id="col-backlog" style="display:flex; flex-direction:column; gap:10px; margin-top:10px; min-height:100px;"></div>
      </div>
      <div class="kanban-column" data-status="todo" style="flex:1; min-width:260px; background:#f3f4f6; border-radius:8px; padding:12px;">
        <h3 style="margin-top:0; font-size:1em; color:#1e3a8a; border-bottom:2px solid #3b82f6; padding-bottom:6px;">📋 To Do</h3>
        <div class="kanban-cards-list" id="col-todo" style="display:flex; flex-direction:column; gap:10px; margin-top:10px; min-height:100px;"></div>
      </div>
      <div class="kanban-column" data-status="in_progress" style="flex:1; min-width:260px; background:#f3f4f6; border-radius:8px; padding:12px;">
        <h3 style="margin-top:0; font-size:1em; color:#854d0e; border-bottom:2px solid #eab308; padding-bottom:6px;">⚡ In Progress</h3>
        <div class="kanban-cards-list" id="col-in_progress" style="display:flex; flex-direction:column; gap:10px; margin-top:10px; min-height:100px;"></div>
      </div>
      <div class="kanban-column" data-status="completed" style="flex:1; min-width:260px; background:#f3f4f6; border-radius:8px; padding:12px;">
        <h3 style="margin-top:0; font-size:1em; color:#166534; border-bottom:2px solid #22c55e; padding-bottom:6px;">✅ Completed</h3>
        <div class="kanban-cards-list" id="col-completed" style="display:flex; flex-direction:column; gap:10px; margin-top:10px; min-height:100px;"></div>
      </div>
    </div>

    <!-- Edit Task Modal -->
    <div id="taskModal" class="modal">
      <div class="modal-content" style="max-width:500px;">
        <button type="button" class="close-modal" onclick="window.closeTaskModal()">&times;</button>
        <h2 id="taskModalTitle">Task details</h2>
        <form id="taskForm" onsubmit="window.saveTaskFormSubmit(event)">
          <input type="hidden" id="taskFormId">
          <div class="form-group">
            <label>Title *</label>
            <input type="text" id="taskFormTitle" required>
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea id="taskFormDesc" style="height:80px;"></textarea>
          </div>
          <div class="form-grid-row" style="display:flex; gap:16px;">
            <div class="form-group" style="flex:1;">
              <label>Status</label>
              <select id="taskFormStatus">
                <option value="backlog">Backlog</option>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div class="form-group" style="flex:1;">
              <label>Priority</label>
              <select id="taskFormPriority">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Assignee</label>
            <select id="taskFormAssignee">
              <option value="">Unassigned</option>
            </select>
          </div>
          <div class="btn-group" style="margin-top:16px;">
            <button type="submit" id="taskSaveBtn">Save</button>
            <button type="button" class="secondary" onclick="window.closeTaskModal()">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function initTasksPage() {
  const team = state.currentTeam;
  if (!team || team.has_tasks_access === false) return;

  window.openCreateTaskModal = openCreateTaskModal;
  window.closeTaskModal = closeTaskModal;
  window.saveTaskFormSubmit = saveTaskFormSubmit;
  window.openEditTaskModal = openEditTaskModal;

  loadTasksData();
}

async function loadTasksData() {
  const teamId = state.currentTeam.team_id;
  const colBacklog = document.getElementById('col-backlog');
  const colTodo = document.getElementById('col-todo');
  const colInProg = document.getElementById('col-in_progress');
  const colComp = document.getElementById('col-completed');

  if (colBacklog) colBacklog.innerHTML = '<p class="empty-state">Loading…</p>';
  if (colTodo) colTodo.innerHTML = '';
  if (colInProg) colInProg.innerHTML = '';
  if (colComp) colComp.innerHTML = '';

  try {
    // 1. Fetch team tasks
    const { data: tasks, error } = await supabaseClient
      .from('tasks')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    activeTasks = tasks || [];

    // 2. Fetch team members to assign tasks
    const { data: members, error: memErr } = await supabaseClient
      .from('user_teams')
      .select('user_id, users:user_id(id, name, email)')
      .eq('team_id', teamId);
    
    teamMembers = (members || []).map(m => m.users).filter(Boolean);

    // Render columns
    renderKanbanBoard();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to load tasks', 'error');
  }
}

function renderKanbanBoard() {
  const cols = {
    backlog: document.getElementById('col-backlog'),
    todo: document.getElementById('col-todo'),
    in_progress: document.getElementById('col-in_progress'),
    completed: document.getElementById('col-completed')
  };

  Object.values(cols).forEach(el => {
    if (el) el.innerHTML = '';
  });

  const priorityColors = {
    low: '#9ca3af',
    medium: '#eab308',
    high: '#ef4444'
  };

  activeTasks.forEach(t => {
    const el = cols[t.status];
    if (!el) return;

    const assignee = teamMembers.find(m => m.id === t.assigned_to);
    const assigneeName = assignee ? assignee.name : 'Unassigned';

    const card = document.createElement('div');
    card.className = 'kanban-card card';
    card.style = 'margin:0; padding:12px; cursor:pointer; background:white; border-left:4px solid ' + priorityColors[t.priority] + ';';
    card.onclick = () => openEditTaskModal(t.id);
    card.innerHTML = `
      <div style="font-size:0.75em; color:var(--text-secondary); margin-bottom:4px; font-weight:600;">${escapeHtml(t.task_number)}</div>
      <div style="font-weight:600; font-size:0.9em; margin-bottom:6px;">${escapeHtml(t.title)}</div>
      <div style="font-size:0.75em; color:var(--text-secondary); display:flex; justify-content:space-between;">
        <span>👤 ${escapeHtml(assigneeName)}</span>
        <span style="text-transform:capitalize;">${t.priority}</span>
      </div>
    `;
    el.appendChild(card);
  });

  // Render empty states
  Object.entries(cols).forEach(([status, el]) => {
    if (el && !el.children.length) {
      el.innerHTML = `<p class="empty-state" style="margin:20px 0; font-size:0.8em;">No tasks</p>`;
    }
  });
}

function openCreateTaskModal() {
  editingTaskId = null;
  document.getElementById('taskFormId').value = '';
  document.getElementById('taskFormTitle').value = '';
  document.getElementById('taskFormDesc').value = '';
  document.getElementById('taskFormStatus').value = 'todo';
  document.getElementById('taskFormPriority').value = 'medium';

  populateAssigneeSelect();

  document.getElementById('taskModalTitle').textContent = '➕ Add Task';
  const modal = document.getElementById('taskModal');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
}

function openEditTaskModal(id) {
  const t = activeTasks.find(x => x.id === id);
  if (!t) return;

  editingTaskId = id;
  document.getElementById('taskFormId').value = t.id;
  document.getElementById('taskFormTitle').value = t.title;
  document.getElementById('taskFormDesc').value = t.description || '';
  document.getElementById('taskFormStatus').value = t.status;
  document.getElementById('taskFormPriority').value = t.priority;

  populateAssigneeSelect(t.assigned_to);

  document.getElementById('taskModalTitle').textContent = `✏️ Edit ${t.task_number}`;
  const modal = document.getElementById('taskModal');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
}

function populateAssigneeSelect(selectedId = '') {
  const select = document.getElementById('taskFormAssignee');
  if (!select) return;
  select.innerHTML = '<option value="">Unassigned</option>';
  teamMembers.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    if (m.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  });
}

function closeTaskModal() {
  const modal = document.getElementById('taskModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

async function saveTaskFormSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('taskSaveBtn');
  const title = document.getElementById('taskFormTitle').value.trim();
  const description = document.getElementById('taskFormDesc').value.trim();
  const status = document.getElementById('taskFormStatus').value;
  const priority = document.getElementById('taskFormPriority').value;
  const assignee = document.getElementById('taskFormAssignee').value || null;

  setButtonLoading(btn, true);

  try {
    if (editingTaskId) {
      // Update
      const { error } = await supabaseClient
        .from('tasks')
        .update({
          title,
          description,
          status,
          priority,
          assigned_to: assignee
        })
        .eq('id', editingTaskId);

      if (error) throw error;
      showToast('Task updated', 'success');
    } else {
      // Create
      const teamId = state.currentTeam.team_id;
      const teamPrefix = (state.currentTeam.team_name || state.currentTeam.name || 'TSK').slice(0, 3).toUpperCase();
      
      const { count } = await supabaseClient
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);

      const taskNo = `${teamPrefix}-${100000 + (count || 0) + 1}`;

      const { error } = await supabaseClient
        .from('tasks')
        .insert({
          task_number: taskNo,
          title,
          description,
          status,
          priority,
          assigned_to: assignee,
          created_by: state.user.id,
          team_id: teamId,
          context_app: 'finance'
        });

      if (error) throw error;
      showToast('Task created', 'success');
    }

    closeTaskModal();
    loadTasksData();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to save task', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}
