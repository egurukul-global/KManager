// ==================== UNIFIED TASK BOARD ====================
import { state } from '../state.js';
import { supabaseClient } from '../db.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { setButtonLoading } from '../utils/uiHelpers.js';
import { uploadReceipt, resolveReceiptViewUrl } from '../utils/upload.js';

let activeTasks = [];
let teamMembers = [];
let editingTaskId = null;
let tempAttachments = [];

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

export function getTasksPage() {
  let team = state.currentTeam;
  if (!team) {
    team = { team_id: 'all', name: 'ALL Teams', team_name: 'ALL Teams' };
    state.currentTeam = team;
  }
  const isAll = team.team_id === 'all';

  const selectorHtml = `
    <select id="tasksTeamSelect" onchange="window.switchTasksTeam(this.value)" style="padding:6px 10px; font-size:0.85em; border-radius:6px; border:1px solid var(--border); background:white; font-weight:600; cursor:pointer;">
      <option value="all" ${isAll ? 'selected' : ''}>ALL Teams</option>
      ${(state.teams || []).map(t => `<option value="${t.team_id}" ${!isAll && t.team_id === team.team_id ? 'selected' : ''}>${escapeHtml(t.team_name || t.name)}</option>`).join('')}
    </select>
  `;

  if (!isAll && team.has_tasks_access === false) {
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <h1 class="page-title" style="margin:0;">Tasks</h1>
          ${selectorHtml}
        </div>
      </div>
      <div class="card"><p class="empty-state">⚠️ Task &amp; Issue tracker is disabled for this team. Enable it under Teams settings.</p></div>
    `;
  }

  return `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <h1 class="page-title" style="margin:0;">Tasks</h1>
        ${selectorHtml}
      </div>
      <button type="button" class="success" onclick="window.openCreateTaskModal()">+ Add Task</button>
    </div>

    <!-- Kanban Board -->
    <div class="kanban-board">
      <div class="kanban-column" data-status="backlog">
        <h3 style="margin-top:0; font-size:1em; color:#4b5563; border-bottom:2px solid #9ca3af; padding-bottom:6px;">📥 Backlog</h3>
        <div class="kanban-cards-list" id="col-backlog" style="display:flex; flex-direction:column; gap:10px; margin-top:10px; min-height:100px;"></div>
      </div>
      <div class="kanban-column" data-status="todo">
        <h3 style="margin-top:0; font-size:1em; color:#1e3a8a; border-bottom:2px solid #3b82f6; padding-bottom:6px;">📋 To Do</h3>
        <div class="kanban-cards-list" id="col-todo" style="display:flex; flex-direction:column; gap:10px; margin-top:10px; min-height:100px;"></div>
      </div>
      <div class="kanban-column" data-status="in_progress">
        <h3 style="margin-top:0; font-size:1em; color:#854d0e; border-bottom:2px solid #eab308; padding-bottom:6px;">⚡ In Progress</h3>
        <div class="kanban-cards-list" id="col-in_progress" style="display:flex; flex-direction:column; gap:10px; margin-top:10px; min-height:100px;"></div>
      </div>
      <div class="kanban-column" data-status="completed">
        <h3 style="margin-top:0; font-size:1em; color:#166534; border-bottom:2px solid #22c55e; padding-bottom:6px;">✅ Completed</h3>
        <div class="kanban-cards-list" id="col-completed" style="display:flex; flex-direction:column; gap:10px; margin-top:10px; min-height:100px;"></div>
      </div>
    </div>

    <!-- Edit Task Modal -->
    <div id="taskModal" class="modal">
      <div class="modal-content" style="max-width:500px;">
        <button type="button" class="close-modal" onclick="window.closeTaskModal()">&times;</button>
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:10px; margin-bottom:15px; margin-right:24px;">
          <h2 id="taskModalTitle" style="margin:0; font-size:1.3em;">Task details</h2>
          <select id="taskFormTeamId" onchange="window.handleModalTeamChange(this.value)" style="padding:4px 8px; font-size:0.85em; border-radius:6px; border:1px solid var(--border); background:#f9fafb; font-weight:600; width:180px; max-width:180px;">
            ${(state.teams || []).map(t => `<option value="${t.team_id}">${escapeHtml(t.team_name || t.name)}</option>`).join('')}
          </select>
        </div>
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
          <div class="form-grid-row" style="display:flex; gap:12px;">
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
            <div class="form-group" style="flex:1;">
              <label>Finish By</label>
              <input type="date" id="taskFormFinishBy" style="height:38px; border-radius:6px; border:1px solid var(--border); padding:0 8px; width:100%;">
            </div>
          </div>

          <!-- Panel Tabs -->
          <div style="display:flex; gap:8px; margin-top:16px; border-bottom:1px solid var(--border); padding-bottom:12px;">
            <button type="button" class="secondary" id="tabBtnAssignees" onclick="window.toggleTaskPanel('assignees')" style="flex:1; padding:6px; font-size:0.85em; display:flex; align-items:center; justify-content:center; gap:4px; margin:0;">
              👤 Assignees <span id="badgeAssignees" style="background:#e5e7eb; border-radius:10px; padding:1px 6px; font-size:0.75em; font-weight:700;">0</span>
            </button>
            <button type="button" class="secondary" id="tabBtnAttachments" onclick="window.toggleTaskPanel('attachments')" style="flex:1; padding:6px; font-size:0.85em; display:flex; align-items:center; justify-content:center; gap:4px; margin:0;">
              📎 Files <span id="badgeAttachments" style="background:#e5e7eb; border-radius:10px; padding:1px 6px; font-size:0.75em; font-weight:700;">0</span>
            </button>
            <button type="button" class="secondary" id="tabBtnDiscussions" onclick="window.toggleTaskPanel('discussions')" style="flex:1; padding:6px; font-size:0.85em; display:flex; align-items:center; justify-content:center; gap:4px; margin:0; display:none;">
              💬 Chat <span id="badgeDiscussions" style="background:#e5e7eb; border-radius:10px; padding:1px 6px; font-size:0.75em; font-weight:700;">0</span>
            </button>
          </div>

          <!-- Panel: Assignees -->
          <div id="panelAssignees" style="display:none; margin-top:12px;">
            <div class="form-group">
              <label>Primary Assignee</label>
              <select id="taskFormAssignee">
                <option value="">Unassigned</option>
              </select>
            </div>
            <div class="form-group" style="margin-top: 10px;">
              <label>Additional Assignees</label>
              <div id="additionalAssigneesList" style="display:flex; flex-direction:column; gap:6px; max-height:100px; overflow-y:auto; border:1px solid var(--border); padding:8px; border-radius:6px; background:#fafafa;"></div>
            </div>
          </div>

          <!-- Panel: Attachments -->
          <div id="panelAttachments" style="display:none; margin-top:12px;">
            <label style="font-weight:600; font-size:0.9em; margin-bottom:8px; display:block;">Attachments</label>
            <div id="taskAttachmentsList" style="display:flex; flex-direction:column; gap:6px; margin-bottom:10px;"></div>
            <div id="taskUploadDropzone" style="border:2px dashed var(--border); border-radius:6px; padding:15px; text-align:center; cursor:pointer; background:#fafafa; font-size:0.85em; color:var(--text-secondary);">
              <span id="taskUploadDropzoneText">📁 Click to choose file, drag-and-drop, or paste screenshot</span>
              <input type="file" id="taskAttachmentFileInput" style="display:none;" multiple>
            </div>
          </div>

          <!-- Panel: Discussions -->
          <div id="panelDiscussions" style="display:none; margin-top:12px;">
            <label style="font-weight:600; font-size:0.9em; margin-bottom:8px; display:block;">Discussions</label>
            <div id="taskDiscussionTimeline" style="max-height: 200px; overflow-y: auto; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; background:#f9fafb; padding:10px; border-radius:6px; border:1px solid var(--border);"></div>
            <div style="display:flex; gap:8px;">
              <input type="text" id="taskDiscussionInput" placeholder="Write a comment..." style="flex:1; height:36px; padding:6px 12px; border-radius:6px; border:1px solid var(--border);">
              <button type="button" class="primary" style="height:36px; padding:6px 16px; margin:0;" onclick="window.sendTaskComment()">Send</button>
            </div>
          </div>

          <div class="btn-group" style="margin-top:20px; display:flex; justify-content:space-between; width:100%;">
            <div style="display:flex; gap:8px;">
              <button type="submit" id="taskSaveBtn">Save</button>
              <button type="button" class="secondary" onclick="window.closeTaskModal()">Cancel</button>
            </div>
            <button type="button" class="danger" id="taskDeleteBtn" style="display:none;" onclick="window.deleteTaskClick()">Delete</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function initTasksPage() {
  window.switchTasksTeam = switchTasksTeam;

  const team = state.currentTeam;
  if (!team || team.has_tasks_access === false) {
    activeTasks = [];
    return;
  }

  window.openCreateTaskModal = openCreateTaskModal;
  window.closeTaskModal = closeTaskModal;
  window.saveTaskFormSubmit = saveTaskFormSubmit;
  window.openEditTaskModal = openEditTaskModal;
  window.deleteTaskClick = deleteTaskClick;
  window.removeTaskAttachment = removeTaskAttachment;
  window.sendTaskComment = sendTaskComment;
  window.toggleTaskPanel = toggleTaskPanel;
  window.handleModalTeamChange = handleModalTeamChange;

  wireTaskUploadHandlers();

  loadTasksData().then(() => {
    const autoOpenId = sessionStorage.getItem('ok_open_task_id');
    if (autoOpenId) {
      sessionStorage.removeItem('ok_open_task_id');
      openEditTaskModal(autoOpenId);
    }
  });
}

function switchTasksTeam(teamId) {
  if (teamId === 'all') {
    state.currentTeam = { team_id: 'all', name: 'ALL Teams', team_name: 'ALL Teams' };
  } else {
    const match = state.teams.find(t => t.team_id === teamId);
    if (match) {
      state.currentTeam = match;
      const sidebarSelect = document.getElementById('teamSelect');
      if (sidebarSelect) sidebarSelect.value = teamId;
    }
  }

  const shellContent = document.getElementById('okShellContent');
  const mainContent = document.getElementById('mainContent');
  const targetEl = shellContent || mainContent;
  if (targetEl) {
    targetEl.innerHTML = getTasksPage();
    initTasksPage();
  }
}

async function loadTasksData() {
  const teamId = state.currentTeam.team_id;
  const isAll = teamId === 'all';
  const teamIds = isAll ? (state.teams || []).map(t => t.team_id) : [teamId];

  const colBacklog = document.getElementById('col-backlog');
  const colTodo = document.getElementById('col-todo');
  const colInProg = document.getElementById('col-in_progress');
  const colComp = document.getElementById('col-completed');

  if (colBacklog) colBacklog.innerHTML = '<p class="empty-state">Loading…</p>';
  if (colTodo) colTodo.innerHTML = '';
  if (colInProg) colInProg.innerHTML = '';
  if (colComp) colComp.innerHTML = '';

  try {
    const query = supabaseClient
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: tasks, error } = isAll 
      ? await query.in('team_id', teamIds) 
      : await query.eq('team_id', teamId);

    if (error) throw error;

    const today = new Date().toISOString().slice(0, 10);
    activeTasks = (tasks || []).map(t => {
      if (t.status === 'todo' && t.metadata?.finish_by_date && t.metadata.finish_by_date < today) {
        t.status = 'backlog';
        supabaseClient.from('tasks').update({ status: 'backlog' }).eq('id', t.id).then();
      }
      return t;
    });

    const { data: members, error: memErr } = await supabaseClient
      .from('user_teams')
      .select('user_id, users:user_id(id, name, email)')
      .in('team_id', teamIds);

    const rawMembers = (members || []).map(m => m.users).filter(Boolean);
    const seenIds = new Set();
    teamMembers = [];
    rawMembers.forEach(m => {
      if (!seenIds.has(m.id)) {
        seenIds.add(m.id);
        teamMembers.push(m);
      }
    });

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

  const statusColors = {
    backlog: '#ef4444',
    todo: '#3b82f6',
    in_progress: '#eab308',
    completed: '#22c55e'
  };

  activeTasks.forEach(t => {
    const el = cols[t.status];
       const assignee = teamMembers.find(m => m.id === t.assigned_to);
    
    const assignees = [];
    if (assignee) assignees.push(assignee);
    const additionalIds = t.metadata?.assigned_to_users || [];
    additionalIds.forEach(id => {
      if (id === t.assigned_to) return;
      const mem = teamMembers.find(m => m.id === id);
      if (mem) assignees.push(mem);
    });

    let assigneesHtml = '<span style="font-size:0.75em; color:var(--text-secondary);">👤 Unassigned</span>';
    if (assignees.length > 0) {
      const badges = assignees.map(a => {
        const initials = a.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
        return `<span style="background:#e5e7eb; border-radius:50%; width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; font-size:0.65em; font-weight:700; color:#4b5563; margin-left:-6px; border:2px solid white; box-shadow:0 1px 2px rgba(0,0,0,0.05);" title="${escapeHtml(a.name)}">${escapeHtml(initials)}</span>`;
      }).join('');
      assigneesHtml = `<div style="display:flex; align-items:center; padding-left:6px;">${badges}</div>`;
    }

    const taskTeam = state.teams.find(tm => tm.team_id === t.team_id);
    const teamBadge = (state.currentTeam.team_id === 'all' && taskTeam)
      ? `<span style="font-size:0.7em; background:#e0f2fe; color:#0369a1; padding:1px 6px; border-radius:4px; font-weight:700; margin-left:4px; display:inline-block;" title="Team">${escapeHtml(taskTeam.team_name || taskTeam.name)}</span>`
      : '';

    const card = document.createElement('div');
    card.className = 'kanban-card card';
    card.style = 'margin:0; padding:8px 12px; cursor:pointer; background:white; border-left:4px solid ' + statusColors[t.status] + '; display:flex; justify-content:space-between; align-items:center; gap:8px;';
    card.onclick = () => openEditTaskModal(t.id);
    
    const hasAttachments = !!(t.metadata?.attachment_url || (t.metadata?.attachments && t.metadata.attachments.length > 0));
    
    card.innerHTML = `
      <span style="font-weight:600; font-size:0.85em; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;">
        <span style="color:var(--text-secondary); font-weight:500; font-size:0.9em; margin-right:4px;">${escapeHtml(t.task_number)}</span>
        ${escapeHtml(t.title)}
        ${teamBadge}
      </span>
      <div style="display:flex; gap:6px; align-items:center; flex-shrink:0;">
        ${hasAttachments ? '<span style="font-size:0.8em; opacity:0.7;">📎</span>' : ''}
        ${assigneesHtml}
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
  document.getElementById('taskFormFinishBy').value = '';

  tempAttachments = [];
  renderTaskAttachmentsList();

  resetTaskPanels();
  document.getElementById('tabBtnDiscussions').style.display = 'none';
  document.getElementById('badgeAssignees').textContent = '0';
  document.getElementById('badgeAttachments').textContent = '0';
  document.getElementById('badgeDiscussions').textContent = '0';

  const defaultTeamId = state.currentTeam.team_id === 'all' ? (state.teams?.[0]?.team_id || '') : state.currentTeam.team_id;
  const teamDropdown = document.getElementById('taskFormTeamId');
  if (teamDropdown) teamDropdown.value = defaultTeamId;
  handleModalTeamChange(defaultTeamId);

  const delBtn = document.getElementById('taskDeleteBtn');
  if (delBtn) delBtn.style.display = 'none';

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
  document.getElementById('taskFormFinishBy').value = t.metadata?.finish_by_date || '';

  tempAttachments = t.metadata?.attachments ? JSON.parse(JSON.stringify(t.metadata.attachments)) : [];
  if (t.metadata?.attachment_url && !tempAttachments.some(a => a.url === t.metadata.attachment_url)) {
    tempAttachments.push({
      name: t.metadata.attachment_name || 'Link',
      url: t.metadata.attachment_url
    });
  }
  renderTaskAttachmentsList();

  resetTaskPanels();
  document.getElementById('tabBtnDiscussions').style.display = 'flex';
  
  const additionalIds = t.metadata?.assigned_to_users || [];
  const assigneesCount = (t.assigned_to ? 1 : 0) + additionalIds.filter(uid => uid !== t.assigned_to).length;
  document.getElementById('badgeAssignees').textContent = assigneesCount;
  document.getElementById('badgeAttachments').textContent = tempAttachments.length;
  
  const teamDropdown = document.getElementById('taskFormTeamId');
  if (teamDropdown) teamDropdown.value = t.team_id;
  handleModalTeamChange(t.team_id, t.assigned_to, additionalIds);

  supabaseClient.from('messages').select('*', { count: 'exact', head: true })
    .eq('metadata->>link_id', t.id).eq('metadata->>link_type', 'task')
    .then(({ count }) => {
      const badge = document.getElementById('badgeDiscussions');
      if (badge) badge.textContent = count || 0;
    });

  const discInput = document.getElementById('taskDiscussionInput');
  if (discInput) discInput.value = '';
  loadTaskDiscussions(t.id);

  const delBtn = document.getElementById('taskDeleteBtn');
  if (delBtn) {
    const isCreator = t.created_by === state.user.id;
    const isGlobal = !!state.isOkAdmin;
    delBtn.style.display = (isCreator || isGlobal) ? '' : 'none';
  }

  document.getElementById('taskModalTitle').textContent = `✏️ Edit ${t.task_number}`;
  const modal = document.getElementById('taskModal');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
}

function populateAssigneeSelect(selectedId = '', selectedAdditionalIds = []) {
  const select = document.getElementById('taskFormAssignee');
  if (select) {
    select.innerHTML = '<option value="">Unassigned</option>';
    const hasSelf = teamMembers.some(m => m.id === state.user.id);
    const listToRender = hasSelf ? teamMembers : [{ id: state.user.id, name: state.user.name }, ...teamMembers];
    
    listToRender.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.id === state.user.id ? `${m.name} (Self)` : m.name;
      if (m.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    });

    select.onchange = () => {
      const primaryId = select.value;
      const checkedIds = [...document.querySelectorAll('#additionalAssigneesList [data-additional-user-id]:checked')].map(el => el.dataset.additionalUserId);
      populateAssigneeSelect(primaryId, checkedIds);
    };
  }

  const list = document.getElementById('additionalAssigneesList');
  if (list) {
    list.innerHTML = '';
    if (!teamMembers.length) {
      list.innerHTML = '<p class="empty-state" style="font-size:0.8em; margin:0;">No team members</p>';
      return;
    }
    teamMembers.forEach(m => {
      if (m.id === selectedId) return;
      const isChecked = selectedAdditionalIds.includes(m.id);
      const label = document.createElement('label');
      label.style = 'display:flex; align-items:center; gap:6px; font-size:0.85em; cursor:pointer; margin-bottom:4px;';
      label.innerHTML = `<input type="checkbox" data-additional-user-id="${m.id}" ${isChecked ? 'checked' : ''}> ${escapeHtml(m.name)}`;
      list.appendChild(label);
    });
  }
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
  const teamId = document.getElementById('taskFormTeamId').value;

  setButtonLoading(btn, true);

  const additionalCheckedIds = [...document.querySelectorAll('#additionalAssigneesList [data-additional-user-id]:checked')].map(el => el.dataset.additionalUserId);

  const finishBy = document.getElementById('taskFormFinishBy').value;

  const metadata = {
    attachments: tempAttachments,
    assigned_to_users: additionalCheckedIds,
    finish_by_date: finishBy || null
  };

  try {
    let savedTaskId = editingTaskId;

    if (editingTaskId) {
      const { error } = await supabaseClient
        .from('tasks')
        .update({
          title,
          description,
          status,
          priority,
          assigned_to: assignee,
          team_id: teamId,
          metadata
        })
        .eq('id', editingTaskId);

      if (error) throw error;
      showToast('Task updated', 'success');
    } else {
      const selectedTeam = state.teams.find(t => t.team_id === teamId);
      const teamPrefix = (selectedTeam?.team_name || selectedTeam?.name || 'TSK').slice(0, 3).toUpperCase();
      
      const { count } = await supabaseClient
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);

      const taskNo = `${teamPrefix}-${100000 + (count || 0) + 1}`;

      const { data: newTasks, error } = await supabaseClient
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
          context_app: 'finance',
          metadata
        })
        .select('id');

      if (error) throw error;
      if (newTasks?.[0]) savedTaskId = newTasks[0].id;
      showToast('Task created', 'success');
    }

    if (savedTaskId) {
      const allAssigneeIds = [];
      if (assignee) allAssigneeIds.push(assignee);
      additionalCheckedIds.forEach(id => {
        if (id && !allAssigneeIds.includes(id)) allAssigneeIds.push(id);
      });

      const notifyPromises = allAssigneeIds
        .filter(id => id !== state.user.id)
        .map(id => {
          return supabaseClient.from('messages').insert({
            sender_id: state.user.id,
            recipient_type: 'user',
            recipient_id: id,
            body: `📋 Task assigned: "${title}"`,
            metadata: {
              link_type: 'task',
              link_id: savedTaskId,
              team_id: state.currentTeam.team_id
            }
          });
        });
      await Promise.all(notifyPromises);
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

async function deleteTaskClick() {
  if (!editingTaskId) return;
  const ok = await showConfirm('Are you sure you want to delete this task?');
  if (!ok) return;

  const btn = document.getElementById('taskDeleteBtn');
  setButtonLoading(btn, true);

  try {
    const { error } = await supabaseClient
      .from('tasks')
      .delete()
      .eq('id', editingTaskId);

    if (error) throw error;
    showToast('Task deleted', 'success');
    closeTaskModal();
    loadTasksData();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to delete task', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function wireTaskUploadHandlers() {
  const dropzone = document.getElementById('taskUploadDropzone');
  const fileInput = document.getElementById('taskAttachmentFileInput');

  if (dropzone && fileInput) {
    dropzone.onclick = () => fileInput.click();
    
    fileInput.onchange = (e) => {
      const files = Array.from(e.target.files);
      uploadTaskFiles(files);
    };

    dropzone.ondragover = (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--primary)';
    };
    dropzone.ondragleave = () => {
      dropzone.style.borderColor = 'var(--border)';
    };
    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--border)';
      const files = Array.from(e.dataTransfer.files);
      uploadTaskFiles(files);
    };

    window.removeEventListener('paste', handleTaskPasteEvent);
    window.addEventListener('paste', handleTaskPasteEvent);
  }
}

function handleTaskPasteEvent(e) {
  const modal = document.getElementById('taskModal');
  if (!modal || !modal.classList.contains('active')) return;

  const items = e.clipboardData?.items || [];
  const files = [];
  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      const blob = item.getAsFile();
      if (blob) {
        const file = new File([blob], `Screenshot-${new Date().toISOString().slice(0, 19).replace('T', '_')}.png`, { type: blob.type });
        files.push(file);
      }
    }
  }
  if (files.length) {
    uploadTaskFiles(files);
  }
}

async function uploadTaskFiles(files) {
  const text = document.getElementById('taskUploadDropzoneText');
  if (text) text.textContent = '⏳ Uploading files...';

  for (const file of files) {
    try {
      const { objectKey } = await uploadReceipt(file);
      tempAttachments.push({
        name: file.name,
        url: objectKey
      });
    } catch (err) {
      console.error(err);
      showToast(`Upload failed for ${file.name}: ${err.message}`, 'error');
    }
  }

  if (text) text.textContent = '📁 Click to choose file, drag-and-drop, or paste screenshot';
  renderTaskAttachmentsList();
}

async function renderTaskAttachmentsList() {
  const list = document.getElementById('taskAttachmentsList');
  if (!list) return;

  if (!tempAttachments.length) {
    list.innerHTML = '<p class="empty-state" style="margin:5px 0; font-size:0.8em;">No files attached</p>';
    return;
  }

  list.innerHTML = '';
  for (let i = 0; i < tempAttachments.length; i++) {
    const att = tempAttachments[i];
    
    let viewUrl = '#';
    try {
      viewUrl = await resolveReceiptViewUrl(att.url);
    } catch (err) {
      console.warn(err);
    }

    const row = document.createElement('div');
    row.style = 'display:flex; justify-content:space-between; align-items:center; background:#f9fafb; padding:6px 10px; border-radius:6px; border:1px solid #e5e7eb; font-size:0.85em; margin-bottom:4px;';
    row.innerHTML = `
      <a href="${escapeHtml(viewUrl)}" target="_blank" style="color:var(--primary); text-decoration:underline; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80%;">${escapeHtml(att.name)}</a>
      <button type="button" class="danger" style="padding:2px 6px; font-size:0.8em; margin:0;" onclick="window.removeTaskAttachment(${i})">🗑️</button>
    `;
    list.appendChild(row);
  }
}

function removeTaskAttachment(index) {
  tempAttachments.splice(index, 1);
  renderTaskAttachmentsList();
}

async function loadTaskDiscussions(taskId) {
  const timeline = document.getElementById('taskDiscussionTimeline');
  if (!timeline) return;

  timeline.innerHTML = '<p class="empty-state" style="font-size:0.8em; margin:10px 0;">Loading comments…</p>';

  try {
    const { data: comments, error } = await supabaseClient
      .from('messages')
      .select('*')
      .eq('metadata->>link_id', taskId)
      .eq('metadata->>link_type', 'task')
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (!comments || !comments.length) {
      timeline.innerHTML = '<p class="empty-state" style="font-size:0.8em; margin:10px 0;">No comments yet. Start the discussion!</p>';
      return;
    }

    const userIds = [...new Set(comments.map(c => c.sender_id).filter(Boolean))];
    const usersMap = {};
    if (userIds.length) {
      const { data: usersData } = await supabaseClient
        .from('users')
        .select('id, name, email')
        .in('id', userIds);
      if (usersData) {
        usersData.forEach(u => {
          usersMap[u.id] = u;
        });
      }
    }

    timeline.innerHTML = comments.map(c => {
      const sender = usersMap[c.sender_id];
      const senderName = sender ? sender.name : 'System';
      const timeStr = new Date(c.created_at).toLocaleString();
      return `
        <div style="background:white; padding:8px; border-radius:6px; border:1px solid #e5e7eb; font-size:0.85em; display:flex; flex-direction:column; gap:4px;">
          <div style="display:flex; justify-content:space-between; color:var(--text-secondary); font-size:0.8em; font-weight:600;">
            <span>👤 ${escapeHtml(senderName)}</span>
            <span>${timeStr}</span>
          </div>
          <div style="color:var(--text-main); font-weight:500;">${escapeHtml(c.body)}</div>
        </div>
      `;
    }).join('');

    timeline.scrollTop = timeline.scrollHeight;
  } catch (err) {
    console.error(err);
    timeline.innerHTML = `<p class="empty-state" style="font-size:0.8em; color:var(--danger); margin:10px 0;">Failed to load discussions: ${escapeHtml(err.message)}</p>`;
  }
}

async function sendTaskComment() {
  if (!editingTaskId) return;

  const input = document.getElementById('taskDiscussionInput');
  const body = input?.value?.trim();
  if (!body) return;

  const btn = document.querySelector('#taskDiscussionSection button');
  setButtonLoading(btn, true);

  try {
    const { error } = await supabaseClient
      .from('messages')
      .insert({
        sender_id: state.user.id,
        recipient_type: 'team',
        recipient_id: state.currentTeam.team_id,
        body,
        metadata: {
          link_type: 'task',
          link_id: editingTaskId,
          team_id: state.currentTeam.team_id
        }
      });

    if (error) throw error;

    if (input) input.value = '';
    await loadTaskDiscussions(editingTaskId);
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to send comment', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function toggleTaskPanel(name) {
  const panels = {
    assignees: document.getElementById('panelAssignees'),
    attachments: document.getElementById('panelAttachments'),
    discussions: document.getElementById('panelDiscussions')
  };

  const buttons = {
    assignees: document.getElementById('tabBtnAssignees'),
    attachments: document.getElementById('tabBtnAttachments'),
    discussions: document.getElementById('tabBtnDiscussions')
  };

  Object.entries(panels).forEach(([k, el]) => {
    if (!el) return;
    if (k === name) {
      const isHidden = el.style.display === 'none';
      el.style.display = isHidden ? 'block' : 'none';
      if (buttons[k]) {
        if (isHidden) {
          buttons[k].classList.remove('secondary');
          buttons[k].classList.add('primary');
        } else {
          buttons[k].classList.remove('primary');
          buttons[k].classList.add('secondary');
        }
      }
    } else {
      el.style.display = 'none';
      if (buttons[k]) {
        buttons[k].classList.remove('primary');
        buttons[k].classList.add('secondary');
      }
    }
  });
}

function resetTaskPanels() {
  const panelNames = ['assignees', 'attachments', 'discussions'];
  panelNames.forEach(name => {
    const el = document.getElementById(`panel${name.charAt(0).toUpperCase() + name.slice(1)}`);
    if (el) el.style.display = 'none';
    const btn = document.getElementById(`tabBtn${name.charAt(0).toUpperCase() + name.slice(1)}`);
    if (btn) {
      btn.classList.remove('primary');
      btn.classList.add('secondary');
    }
  });
}

async function handleModalTeamChange(teamId, selectedId = '', selectedAdditionalIds = []) {
  try {
    const { data: members } = await supabaseClient
      .from('user_teams')
      .select('user_id, users:user_id(id, name, email)')
      .eq('team_id', teamId);
    
    teamMembers = (members || []).map(m => m.users).filter(Boolean);
    populateAssigneeSelect(selectedId, selectedAdditionalIds);
  } catch (err) {
    console.error(err);
  }
}
