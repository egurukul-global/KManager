// ==================== KONNECT MESSAGING HUB ====================
import { supabaseClient } from '../db.js';
import { state } from '../state.js';
import { renderOkShell } from './ok-shell.js';
import { showToast } from '../components/toasts.js';

let activeThread = null; // { type: 'user'|'team'|'group', id: string, name: string }
let conversationsList = [];
let allMessages = [];
let messagesList = [];
let activeRoster = [];
let querySearch = '';
let starPins = []; // List of pinned target IDs

// Quoted reply state
let replyingToId = null;
let replyingToText = null;
let replyingToSender = null;

// Countdown Deletion state
let deletingMessageId = null;
let deletingCountdown = 10;
let deletingInterval = null;
let deletingScope = 'everyone'; // 'me' | 'everyone'

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getKonnectPage() {
  return `
    <div style="display:flex; height:calc(100vh - 120px); background:#f9fafb; border-radius:12px; border:1px solid var(--border); overflow:hidden;">
      <!-- Left sidebar: Chats List -->
      <div style="width:320px; border-right:1px solid var(--border); display:flex; flex-direction:column; background:white;">
        <div style="padding:12px; border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
            <input type="text" id="konnectSearch" placeholder="Search name or messages..." oninput="window.handleKonnectSearch(this.value)" style="flex:1; height:32px; padding:4px 8px; border-radius:6px; border:1px solid var(--border); font-size:0.8em;">
            <button onclick="window.openNewChatModal()" class="primary" style="padding:4px 8px; font-size:0.8em; margin:0; height:32px;" title="New Chat">➕</button>
            <button onclick="window.openNewGroupModal()" class="secondary" style="padding:4px 8px; font-size:0.8em; margin:0; height:32px;" title="Create Group">👥</button>
            <button onclick="window.openSettingsModal()" class="secondary" style="padding:4px 8px; font-size:0.8em; margin:0; height:32px;" title="Settings">⚙️</button>
          </div>
        </div>

        <div id="konnectChatsList" style="flex:1; overflow-y:auto; display:flex; flex-direction:column;">
          <p class="empty-state" style="margin:20px;">Loading conversations...</p>
        </div>
      </div>

      <!-- Right sidebar: Main Chat Area -->
      <div id="konnectChatArea" style="flex:1; display:flex; flex-direction:column; background:#f3f4f6; position:relative;">
        <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:40px; text-align:center; color:var(--text-secondary);">
          <span style="font-size:4em; margin-bottom:16px;">💬</span>
          <h2 style="font-size:1.3em; font-weight:600; margin-bottom:8px; color:var(--text-main);">Welcome to Konnect</h2>
          <p style="font-size:0.9em; max-width:320px; margin:0;">Select a contact, team, or group from the list on the left to start messaging securely.</p>
        </div>
      </div>
    </div>

    <!-- Modal: New Direct Chat -->
    <div id="newChatModal" class="modal">
      <div class="modal-content" style="max-width:400px;">
        <button type="button" class="close-modal" onclick="window.closeKonnectModals()">&times;</button>
        <h2 style="margin-top:0; margin-bottom:16px; font-size:1.2em;">New Chat</h2>
        <div class="form-group">
          <label>Select Recipient</label>
          <select id="newChatRecipient" style="width:100%; height:38px; border-radius:6px; border:1px solid var(--border); padding:6px;"></select>
        </div>
        <div class="btn-group" style="margin-top:16px; display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" class="secondary" onclick="window.closeKonnectModals()">Cancel</button>
          <button type="button" class="primary" onclick="window.startDirectChat()">Start Chat</button>
        </div>
      </div>
    </div>

    <!-- Modal: New Group Chat -->
    <div id="newGroupModal" class="modal">
      <div class="modal-content" style="max-width:400px;">
        <button type="button" class="close-modal" onclick="window.closeKonnectModals()">&times;</button>
        <h2 style="margin-top:0; margin-bottom:16px; font-size:1.2em;">Create Group</h2>
        <div class="form-group" style="margin-bottom:12px;">
          <label>Group Name *</label>
          <input type="text" id="newGroupName" required style="width:100%; height:38px; border-radius:6px; border:1px solid var(--border); padding:6px;">
        </div>
        <div class="form-group">
          <label>Select Members</label>
          <div id="newGroupMembersList" style="max-height:160px; overflow-y:auto; border:1px solid var(--border); border-radius:6px; padding:8px; background:#f9fafb;"></div>
        </div>
        <div class="btn-group" style="margin-top:16px; display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" class="secondary" onclick="window.closeKonnectModals()">Cancel</button>
          <button type="button" class="primary" onclick="window.createGroupChatSubmit()">Create Group</button>
        </div>
      </div>
    </div>

    <!-- Modal: Settings -->
    <div id="konnectSettingsModal" class="modal">
      <div class="modal-content" style="max-width:400px;">
        <button type="button" class="close-modal" onclick="window.closeKonnectModals()">&times;</button>
        <h2 style="margin-top:0; margin-bottom:16px; font-size:1.2em;">Konnect Settings</h2>
        <div id="konnectSettingsContent" style="font-size:0.9em; line-height:1.6; display:flex; flex-direction:column; gap:10px;"></div>
        <div class="btn-group" style="margin-top:16px; display:flex; justify-content:flex-end;">
          <button type="button" class="secondary" onclick="window.closeKonnectModals()">Close</button>
        </div>
      </div>
    </div>
  `;
}

export function initKonnectPage() {
  window.handleKonnectSearch = handleKonnectSearch;
  window.openNewChatModal = openNewChatModal;
  window.openNewGroupModal = openNewGroupModal;
  window.openSettingsModal = openSettingsModal;
  window.closeKonnectModals = closeKonnectModals;
  window.startDirectChat = startDirectChat;
  window.createGroupChatSubmit = createGroupChatSubmit;
  window.selectConversation = selectConversation;
  window.sendKonnectMessage = sendKonnectMessage;
  window.togglePinChat = togglePinChat;
  window.markChatAsUnread = markChatAsUnread;
  
  // Message Actions
  window.toggleMessageActions = toggleMessageActions;
  window.replyToMessage = replyToMessage;
  window.cancelReply = cancelReply;
  window.startDeleteMessageFlow = startDeleteMessageFlow;
  window.undoDeleteMessage = undoDeleteMessage;
  window.triggerChatAttachment = triggerChatAttachment;
  window.handleChatFileSelection = handleChatFileSelection;

  activeThread = null;
  loadKonnectRoster().then(() => {
    loadConversations();
  });

  // Global click listener to close floating dropdowns
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.msg-actions-dropdown') && !e.target.closest('.msg-action-trigger')) {
      document.querySelectorAll('.msg-actions-dropdown').forEach(el => el.style.display = 'none');
    }
  });
}

async function loadKonnectRoster() {
  try {
    const { data: users, error } = await supabaseClient
      .from('users')
      .select('id, name, email, gender, role')
      .eq('on_hold', false)
      .order('name');
    if (error) throw error;
    activeRoster = users || [];
  } catch (err) {
    console.error(err);
  }
}

async function loadConversations() {
  try {
    const { data: pins } = await supabaseClient
      .from('chat_preferences')
      .select('*')
      .eq('user_id', state.user.id);
    starPins = pins || [];

    const { data: messages, error } = await supabaseClient
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    allMessages = messages || [];

    const { data: groups } = await supabaseClient
      .from('chat_groups')
      .select('id, name, created_by');

    const { data: groupMems } = await supabaseClient
      .from('chat_group_members')
      .select('*')
      .eq('user_id', state.user.id);

    const userGroupIds = (groupMems || []).map(gm => gm.group_id);
    const myGroups = (groups || []).filter(g => g.created_by === state.user.id || userGroupIds.includes(g.id));

    const threads = {};

    (allMessages || []).forEach(msg => {
      // Filter out messages deleted for me
      const deletedForMe = msg.metadata?.deleted_by_users || [];
      if (deletedForMe.includes(state.user.id)) return;

      let threadKey = null;
      let threadType = null;
      let threadName = '';

      if (msg.recipient_type === 'user') {
        const otherId = msg.sender_id === state.user.id ? msg.recipient_id : msg.sender_id;
        threadKey = otherId;
        threadType = 'user';
        const otherUser = activeRoster.find(u => u.id === otherId);
        threadName = otherUser ? otherUser.name : 'Unknown User';
      } else if (msg.recipient_type === 'team') {
        threadKey = msg.recipient_id;
        threadType = 'team';
        const team = state.teams.find(t => t.team_id === msg.recipient_id);
        if (!team) return;
        threadName = team.team_name || team.name;
      } else if (msg.recipient_type === 'group') {
        threadKey = msg.recipient_id;
        threadType = 'group';
        const grp = myGroups.find(g => g.id === msg.recipient_id);
        if (!grp) return;
        threadName = grp.name;
      }

      if (threadKey && !threads[threadKey]) {
        threads[threadKey] = {
          id: threadKey,
          type: threadType,
          name: threadName,
          lastMessage: msg.body,
          time: msg.created_at,
          unreadCount: (msg.sender_id !== state.user.id && !msg.read_at) ? 1 : 0,
          isPinned: starPins.some(p => p.chat_target_id === threadKey && p.is_pinned)
        };
      } else if (threadKey) {
        if (msg.sender_id !== state.user.id && !msg.read_at) {
          threads[threadKey].unreadCount++;
        }
      }
    });

    myGroups.forEach(g => {
      if (!threads[g.id]) {
        threads[g.id] = {
          id: g.id,
          type: 'group',
          name: g.name,
          lastMessage: 'No messages yet',
          time: new Date(0).toISOString(),
          unreadCount: 0,
          isPinned: starPins.some(p => p.chat_target_id === g.id && p.is_pinned)
        };
      }
    });

    state.teams.forEach(t => {
      if (t.has_tasks_access !== false && !threads[t.team_id]) {
        threads[t.team_id] = {
          id: t.team_id,
          type: 'team',
          name: t.team_name || t.name,
          lastMessage: 'No messages yet',
          time: new Date(0).toISOString(),
          unreadCount: 0,
          isPinned: starPins.some(p => p.chat_target_id === t.team_id && p.is_pinned)
        };
      }
    });

    conversationsList = Object.values(threads).sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.time) - new Date(a.time);
    });

    renderConversations();
  } catch (err) {
    console.error(err);
  }
}

function renderConversations() {
  const container = document.getElementById('konnectChatsList');
  if (!container) return;

  const filtered = conversationsList.filter(c => {
    if (!querySearch) return true;
    const matchName = c.name.toLowerCase().includes(querySearch.toLowerCase());
    
    // Search within message texts and captions inside this thread
    const matchMsg = (allMessages || []).some(m => {
      const deletedForMe = m.metadata?.deleted_by_users || [];
      if (deletedForMe.includes(state.user.id)) return false;

      const isThisThread = c.type === 'user'
        ? (m.recipient_type === 'user' && ((m.sender_id === state.user.id && m.recipient_id === c.id) || (m.sender_id === c.id && m.recipient_id === state.user.id)))
        : (m.recipient_type === c.type && m.recipient_id === c.id);
      
      return isThisThread && (
        (m.body && m.body.toLowerCase().includes(querySearch.toLowerCase())) ||
        (m.attachment_name && m.attachment_name.toLowerCase().includes(querySearch.toLowerCase()))
      );
    });

    return matchName || matchMsg;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p class="empty-state" style="margin:20px; font-size:0.9em;">No chats found</p>`;
    return;
  }

  container.innerHTML = filtered.map(c => {
    const isSelected = activeThread && activeThread.id === c.id;
    const dateStr = formatChatTime(c.time);
    const unreadHtml = c.unreadCount > 0 
      ? `<span style="background:var(--success); color:white; border-radius:10px; padding:1px 5px; font-size:0.7em; font-weight:700;">${c.unreadCount}</span>` 
      : '';
    const pinHtml = c.isPinned ? `<span style="font-size:0.8em; color:var(--text-secondary);">📌</span>` : '';

    return `
      <div onclick="window.selectConversation('${c.type}', '${c.id}', '${escapeHtml(c.name)}')" style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border-bottom:1px solid #f3f4f6; cursor:pointer; background:${isSelected ? '#eff6ff' : 'transparent'}; hover:background:#f9fafb; transition:background 0.15s;">
        <div style="flex:1; min-width:0; display:flex; align-items:center; gap:8px;">
          <span style="font-weight:600; font-size:0.85em; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:110px;">${escapeHtml(c.name)}</span>
          <span style="font-size:0.75em; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:120px;">— ${escapeHtml(c.lastMessage)}</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
          ${pinHtml}
          ${unreadHtml}
          <span style="font-size:0.75em; color:var(--text-secondary);">${dateStr}</span>
        </div>
      </div>
    `;
  }).join('');
}

function formatChatTime(isoStr) {
  if (!isoStr || isoStr.startsWith('1970')) return '';
  const date = new Date(isoStr);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function handleKonnectSearch(val) {
  querySearch = val;
  renderConversations();
}

async function openNewChatModal() {
  const select = document.getElementById('newChatRecipient');
  if (select) {
    select.innerHTML = '<option value="">Select contact...</option>';
    const { data: perms } = await supabaseClient.from('chat_permissions').select('*');
    const myPerm = (perms || []).find(p => p.user_id === state.user.id);
    const allowOpposite = myPerm ? myPerm.allow_opposite_gender : false;

    const allowedUsers = activeRoster.filter(u => {
      if (u.id === state.user.id) return false;
      if (state.user.gender && u.gender && state.user.gender !== u.gender) {
        if (!allowOpposite) return false;
        const otherPerm = (perms || []).find(p => p.user_id === u.id);
        if (!otherPerm || !otherPerm.allow_opposite_gender) return false;
      }
      return true;
    });

    allowedUsers.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.name} (${u.role || 'Volunteer'})`;
      select.appendChild(opt);
    });
  }

  const modal = document.getElementById('newChatModal');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
}

function openNewGroupModal() {
  const container = document.getElementById('newGroupMembersList');
  if (container) {
    container.innerHTML = activeRoster
      .filter(u => u.id !== state.user.id)
      .map(u => `
        <label style="display:flex; align-items:center; gap:6px; font-size:0.85em; margin-bottom:4px; cursor:pointer;">
          <input type="checkbox" name="newGroupMember" value="${u.id}">
          ${escapeHtml(u.name)}
        </label>
      `).join('');
  }

  const modal = document.getElementById('newGroupModal');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
}

async function openSettingsModal() {
  const container = document.getElementById('konnectSettingsContent');
  if (container) {
    container.innerHTML = '<p class="empty-state">Loading settings...</p>';
    try {
      const { data: perm } = await supabaseClient
        .from('chat_permissions')
        .select('*')
        .eq('user_id', state.user.id)
        .maybeSingle();

      const allowOpposite = perm ? perm.allow_opposite_gender : false;
      const crossTeam = perm ? perm.cross_team_access : 'none';

      container.innerHTML = `
        <div style="background:#f3f4f6; padding:10px; border-radius:6px;">
          <strong>Gender clearance:</strong> ${allowOpposite ? '✅ Allowed' : '❌ Opposing gender messages blocked'}
        </div>
        <div style="background:#f3f4f6; padding:10px; border-radius:6px;">
          <strong>Cross-team access:</strong> <span style="text-transform:capitalize;">${crossTeam}</span>
        </div>
        <p style="font-size:0.8em; color:var(--text-secondary); margin:0;">Gender rules and cross-team clearance tiers can be adjusted by Global Administrators.</p>
      `;
    } catch (err) {
      container.innerHTML = `<p style="color:var(--danger);">Error loading settings details.</p>`;
    }
  }

  const modal = document.getElementById('konnectSettingsModal');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
}

function closeKonnectModals() {
  ['newChatModal', 'newGroupModal', 'konnectSettingsModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('active');
      el.style.display = 'none';
    }
  });
}

async function startDirectChat() {
  const uid = document.getElementById('newChatRecipient').value;
  if (!uid) return;
  const user = activeRoster.find(u => u.id === uid);
  if (!user) return;

  closeKonnectModals();
  selectConversation('user', uid, user.name);
}

async function createGroupChatSubmit() {
  const name = document.getElementById('newGroupName').value.trim();
  if (!name) {
    showToast('Group name is required', 'warning');
    return;
  }

  const checkedIds = [...document.querySelectorAll('#newGroupMembersList input:checked')].map(el => el.value);

  try {
    const { data: newGrp, error } = await supabaseClient
      .from('chat_groups')
      .insert({ name, created_by: state.user.id })
      .select('id')
      .single();

    if (error) throw error;

    const membersInsert = [{ group_id: newGrp.id, user_id: state.user.id }];
    checkedIds.forEach(uid => {
      membersInsert.push({ group_id: newGrp.id, user_id: uid });
    });

    const { error: memErr } = await supabaseClient
      .from('chat_group_members')
      .insert(membersInsert);

    if (memErr) throw memErr;

    showToast('Group created', 'success');
    closeKonnectModals();
    await loadConversations();
    selectConversation('group', newGrp.id, name);
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to create group', 'error');
  }
}

async function selectConversation(type, id, name) {
  activeThread = { type, id, name };
  
  // Clear reply state
  replyingToId = null;
  replyingToText = null;
  replyingToSender = null;

  renderConversations();

  const area = document.getElementById('konnectChatArea');
  if (!area) return;

  const isPinned = starPins.some(p => p.chat_target_id === id && p.is_pinned);

  area.innerHTML = `
    <!-- Top Bar -->
    <div style="padding:12px 20px; background:white; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; z-index:10;">
      <div>
        <h2 style="margin:0; font-size:1.05em; font-weight:600; color:var(--text-main);">${escapeHtml(name)}</h2>
        <span style="font-size:0.75em; color:var(--text-secondary); text-transform:uppercase;">${type} conversation</span>
      </div>
      <div style="display:flex; gap:8px;">
        <button onclick="window.togglePinChat()" class="secondary" style="padding:4px 10px; font-size:0.8em; margin:0;">${isPinned ? '📌 Unpin' : '📌 Pin'}</button>
        <button onclick="window.markChatAsUnread()" class="secondary" style="padding:4px 10px; font-size:0.8em; margin:0;">📩 Mark Unread</button>
      </div>
    </div>

    <!-- Messages Timeline -->
    <div id="konnectTimeline" style="flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:12px;">
      <p class="empty-state">Loading timeline...</p>
    </div>

    <!-- Reply Context Bar -->
    <div id="konnectReplyBar" style="display:none; padding:8px 16px; background:#e0f2fe; border-top:1px solid var(--border); border-left:4px solid var(--primary); display:flex; justify-content:space-between; align-items:center;">
      <div style="font-size:0.8em;">
        <strong>Replying to <span id="konnectReplySender"></span></strong>
        <p id="konnectReplyText" style="margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:400px; color:#0369a1;"></p>
      </div>
      <button onclick="window.cancelReply()" style="background:none; border:none; color:#ef4444; font-weight:700; cursor:pointer; font-size:1.1em;">&times;</button>
    </div>

    <!-- Bottom Input -->
    <div style="padding:16px; background:white; border-top:1px solid var(--border); display:flex; gap:10px; align-items:center;">
      <button onclick="window.triggerChatAttachment()" class="secondary" style="height:40px; width:40px; margin:0; padding:0; display:flex; align-items:center; justify-content:center; font-size:1.2em;" title="Attach File">📎</button>
      <input type="file" id="konnectAttachmentInput" style="display:none;" onchange="window.handleChatFileSelection(event)">
      
      <input type="text" id="konnectMsgInput" placeholder="Type a message..." style="flex:1; height:40px; border-radius:8px; border:1px solid var(--border); padding:6px 12px; font-size:0.9em;" onkeydown="if(event.key==='Enter') window.sendKonnectMessage()">
      <button onclick="window.sendKonnectMessage()" class="primary" style="height:40px; margin:0; padding:0 20px; font-size:0.9em; font-weight:600;">Send</button>
    </div>
  `;

  await loadMessages();
  
  // Mark read using is() for null
  const { error } = await supabaseClient.from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_type', type)
    .eq('recipient_id', id)
    .is('read_at', null);

  if (!error) {
    loadConversations();
  }
}

async function loadMessages() {
  const timeline = document.getElementById('konnectTimeline');
  if (!timeline) return;

  try {
    const { data: messages, error } = await supabaseClient
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const filtered = (messages || []).filter(msg => {
      // Direct vs Group/Team sorting
      let match = false;
      if (activeThread.type === 'user') {
        match = (msg.recipient_type === 'user' && (
          (msg.sender_id === state.user.id && msg.recipient_id === activeThread.id) ||
          (msg.sender_id === activeThread.id && msg.recipient_id === state.user.id)
        ));
      } else {
        match = msg.recipient_type === activeThread.type && msg.recipient_id === activeThread.id;
      }

      if (!match) return false;

      // Filter out messages deleted for me
      const deletedForMe = msg.metadata?.deleted_by_users || [];
      return !deletedForMe.includes(state.user.id);
    });

    if (filtered.length === 0) {
      timeline.innerHTML = `<p class="empty-state" style="margin:20px 0; font-size:0.85em; color:var(--text-secondary);">No messages yet. Send a message to start the chat!</p>`;
      return;
    }

    timeline.innerHTML = filtered.map(msg => {
      const isMe = msg.sender_id === state.user.id;
      const sender = activeRoster.find(u => u.id === msg.sender_id);
      const senderName = sender ? sender.name : 'Unknown';
      const timeStr = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Inline deletion countdown
      if (msg.id === deletingMessageId) {
        return `
          <div style="align-self:${isMe ? 'flex-end' : 'flex-start'}; max-width:70%; margin:4px 0;">
            <div style="background:#fee2e2; border:1px dashed #ef4444; border-radius:12px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; animation:pulse 1.5s infinite;">
              <span style="font-size:0.85em; color:#b91c1c; font-weight:600;">Deleting in ${deletingCountdown}s...</span>
              <button onclick="window.undoDeleteMessage(event)" style="padding:2px 8px; font-size:0.75em; font-weight:700; color:white; background:#ef4444; border:none; border-radius:4px; cursor:pointer;">Undo</button>
            </div>
          </div>
        `;
      }

      // Quoted Reply Context block
      let quoteHtml = '';
      if (msg.metadata?.reply_to) {
        quoteHtml = `
          <div style="background:rgba(0,0,0,0.06); border-left:3px solid var(--primary); padding:4px 8px; border-radius:4px; margin-bottom:6px; font-size:0.8em; color:var(--text-secondary);">
            <strong style="display:block; font-size:0.9em; margin-bottom:2px;">${escapeHtml(msg.metadata.reply_to.sender)}</strong>
            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${escapeHtml(msg.metadata.reply_to.body)}</span>
          </div>
        `;
      }

      // Attachment rendering
      let attachHtml = '';
      if (msg.attachment_url) {
        attachHtml = `
          <div style="background:rgba(0,0,0,0.03); border:1px solid var(--border); border-radius:6px; padding:6px; display:flex; align-items:center; gap:8px; margin-top:6px; font-size:0.85em;">
            <span>📎</span>
            <a href="${msg.attachment_url}" target="_blank" style="color:var(--primary); font-weight:600; text-decoration:underline; word-break:break-all;">
              ${escapeHtml(msg.attachment_name || 'Attached file')}
            </a>
          </div>
        `;
      }

      return `
        <div class="msg-bubble-container" style="display:flex; flex-direction:column; align-self:${isMe ? 'flex-end' : 'flex-start'}; max-width:70%; position:relative; group;">
          ${(!isMe && activeThread.type !== 'user') ? `<span style="font-size:0.75em; color:var(--text-secondary); margin-bottom:2px; font-weight:600; margin-left:4px;">${escapeHtml(senderName)}</span>` : ''}
          
          <div style="background:${isMe ? 'var(--primary)' : 'white'}; color:${isMe ? 'white' : 'var(--text-main)'}; border:1px solid ${isMe ? 'var(--primary)' : 'var(--border)'}; border-radius:12px; padding:8px 12px; box-shadow:0 1px 2px rgba(0,0,0,0.05); position:relative;">
            ${quoteHtml}
            <p style="margin:0; font-size:0.9em; white-space:pre-wrap; word-break:break-word;">${escapeHtml(msg.body)}</p>
            ${attachHtml}
            
            <div style="display:flex; justify-content:flex-end; align-items:center; gap:6px; margin-top:4px; font-size:0.7em; opacity:0.8;">
              <span>${timeStr}</span>
              <span class="msg-action-trigger" onclick="window.toggleMessageActions(event, '${msg.id}')" style="cursor:pointer; margin-left:6px; font-weight:700;" title="Actions">⋮</span>
            </div>

            <!-- Floating Actions Dropdown Card -->
            <div id="msgDropdown-${msg.id}" class="msg-actions-dropdown" style="display:none; position:absolute; right:10px; top:30px; background:white; border:1px solid var(--border); border-radius:6px; box-shadow:0 4px 6px rgba(0,0,0,0.1); z-index:100; font-size:0.85em; flex-direction:column; width:130px; overflow:hidden;">
              <div onclick="window.replyToMessage('${msg.id}', '${escapeHtml(msg.body)}', '${escapeHtml(senderName)}')" style="padding:8px 12px; cursor:pointer; color:var(--text-main); border-bottom:1px solid #f3f4f6; text-align:left;">💬 Reply</div>
              <div onclick="window.triggerChatAttachment('${msg.id}')" style="padding:8px 12px; cursor:pointer; color:var(--text-main); border-bottom:1px solid #f3f4f6; text-align:left;">📎 Attach file</div>
              <div onclick="window.startDeleteMessageFlow('${msg.id}', 'me')" style="padding:8px 12px; cursor:pointer; color:#ef4444; border-bottom:1px solid #f3f4f6; text-align:left;">🗑️ Delete for me</div>
              ${isMe ? `<div onclick="window.startDeleteMessageFlow('${msg.id}', 'everyone')" style="padding:8px 12px; cursor:pointer; color:#ef4444; font-weight:600; text-align:left;">🗑️ Delete for all</div>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    timeline.scrollTop = timeline.scrollHeight;
  } catch (err) {
    console.error(err);
    timeline.innerHTML = `<p class="empty-state" style="color:var(--danger);">Error loading messages</p>`;
  }
}

async function sendKonnectMessage() {
  const input = document.getElementById('konnectMsgInput');
  if (!input) return;

  const body = input.value.trim();
  if (!body) return;

  const metadata = {};
  if (replyingToId) {
    metadata.reply_to = {
      id: replyingToId,
      body: replyingToText,
      sender: replyingToSender
    };
  }

  try {
    const { error } = await supabaseClient
      .from('messages')
      .insert({
        sender_id: state.user.id,
        recipient_type: activeThread.type,
        recipient_id: activeThread.id,
        body,
        metadata
      });

    if (error) throw error;
    input.value = '';
    cancelReply();
    await loadMessages();
    await loadConversations();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to send message', 'error');
  }
}

function toggleMessageActions(e, msgId) {
  e.stopPropagation();
  // Close all other dropdowns
  document.querySelectorAll('.msg-actions-dropdown').forEach(el => el.style.display = 'none');
  
  const el = document.getElementById(`msgDropdown-${msgId}`);
  if (el) {
    el.style.display = el.style.display === 'none' ? 'flex' : 'none';
  }
}

function replyToMessage(msgId, body, sender) {
  replyingToId = msgId;
  replyingToText = body;
  replyingToSender = sender;

  const bar = document.getElementById('konnectReplyBar');
  const txt = document.getElementById('konnectReplyText');
  const snd = document.getElementById('konnectReplySender');

  if (bar && txt && snd) {
    snd.textContent = sender;
    txt.textContent = body;
    bar.style.display = 'flex';
  }

  document.querySelectorAll('.msg-actions-dropdown').forEach(el => el.style.display = 'none');
  const input = document.getElementById('konnectMsgInput');
  if (input) input.focus();
}

function cancelReply() {
  replyingToId = null;
  replyingToText = null;
  replyingToSender = null;

  const bar = document.getElementById('konnectReplyBar');
  if (bar) bar.style.display = 'none';
}

function startDeleteMessageFlow(msgId, scope) {
  document.querySelectorAll('.msg-actions-dropdown').forEach(el => el.style.display = 'none');

  if (deletingInterval) clearInterval(deletingInterval);

  deletingMessageId = msgId;
  deletingCountdown = 10;
  deletingScope = scope;

  // Rerender messages instantly to show the inline countdown bubble
  loadMessages();

  deletingInterval = setInterval(() => {
    deletingCountdown--;
    if (deletingCountdown <= 0) {
      clearInterval(deletingInterval);
      deletingInterval = null;
      finalizeMessageDeletion();
    } else {
      loadMessages();
    }
  }, 1000);
}

function undoDeleteMessage(e) {
  e.stopPropagation();
  if (deletingInterval) clearInterval(deletingInterval);
  deletingInterval = null;
  deletingMessageId = null;
  loadMessages();
  showToast('Deletion cancelled', 'success');
}

async function finalizeMessageDeletion() {
  const msgId = deletingMessageId;
  const scope = deletingScope;
  deletingMessageId = null;

  try {
    if (scope === 'me') {
      // Soft-delete for me only (store in metadata.deleted_by_users)
      const msg = allMessages.find(m => m.id === msgId);
      const deletedForMe = msg?.metadata?.deleted_by_users || [];
      if (!deletedForMe.includes(state.user.id)) {
        deletedForMe.push(state.user.id);
      }
      
      const { error } = await supabaseClient
        .from('messages')
        .update({
          metadata: { ...(msg?.metadata || {}), deleted_by_users: deletedForMe }
        })
        .eq('id', msgId);

      if (error) throw error;
    } else {
      // Hard delete for everyone
      const { error } = await supabaseClient
        .from('messages')
        .delete()
        .eq('id', msgId);

      if (error) throw error;
    }

    showToast('Message deleted', 'success');
    await loadMessages();
    await loadConversations();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to delete message', 'error');
    loadMessages(); // Redraw normal state
  }
}

function triggerChatAttachment() {
  const fileInput = document.getElementById('konnectAttachmentInput');
  if (fileInput) fileInput.click();
}

async function handleChatFileSelection(e) {
  const file = e.target.files[0];
  if (!file) return;

  const caption = prompt(`Enter a caption for "${file.name}" (optional):`) || file.name;

  try {
    showToast('Uploading attachment...', 'info');

    // 1. Get signed R2 upload URL (reusing existing receipts uploader logic)
    const { data, error } = await supabaseClient.functions.invoke('get-receipt-upload-url', {
      body: { filename: file.name, contentType: file.type }
    });

    if (error) throw error;

    // 2. PUT upload to R2
    const uploadRes = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file
    });

    if (!uploadRes.ok) throw new Error('Upload failed');

    // 3. Send message with attachment
    const { error: msgErr } = await supabaseClient
      .from('messages')
      .insert({
        sender_id: state.user.id,
        recipient_type: activeThread.type,
        recipient_id: activeThread.id,
        body: `Shared file: ${caption}`,
        attachment_url: data.publicUrl,
        attachment_name: caption
      });

    if (msgErr) throw msgErr;

    showToast('Attachment uploaded successfully!', 'success');
    await loadMessages();
    await loadConversations();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Upload failed', 'error');
  }
}

async function togglePinChat() {
  if (!activeThread) return;
  const isPinned = starPins.some(p => p.chat_target_id === activeThread.id && p.is_pinned);

  try {
    const { error } = await supabaseClient
      .from('chat_preferences')
      .upsert({
        user_id: state.user.id,
        chat_target_type: activeThread.type,
        chat_target_id: activeThread.id,
        is_pinned: !isPinned
      });

    if (error) throw error;
    showToast(isPinned ? 'Chat unpinned' : 'Chat pinned', 'success');
    await loadConversations();
    selectConversation(activeThread.type, activeThread.id, activeThread.name);
  } catch (err) {
    console.error(err);
  }
}

async function markChatAsUnread() {
  if (!activeThread) return;
  
  // Find last received message in active conversation
  const lastReceived = allMessages.find(m => {
    const isThisThread = activeThread.type === 'user'
      ? (m.recipient_type === 'user' && m.sender_id === activeThread.id && m.recipient_id === state.user.id)
      : (m.recipient_type === activeThread.type && m.recipient_id === activeThread.id && m.sender_id !== state.user.id);
    return isThisThread;
  });

  if (!lastReceived) {
    showToast('No messages to mark as unread', 'warning');
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('messages')
      .update({ read_at: null })
      .eq('id', lastReceived.id);

    if (error) throw error;
    showToast('Conversation marked unread', 'success');
    await loadConversations();
  } catch (err) {
    console.error(err);
  }
}
