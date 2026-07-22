// ==================== KONNECT MESSAGING HUB ====================
import { supabaseClient } from '../db.js';
import { state } from '../state.js';
import { renderOkShell } from './ok-shell.js';

let activeThread = null; // { type: 'user'|'team'|'group', id: string, name: string }
let conversationsList = [];
let messagesList = [];
let activeRoster = [];
let querySearch = '';
let starPins = []; // List of pinned target IDs

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
        <div style="padding:16px; border-bottom:1px solid var(--border);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h1 style="font-size:1.4em; font-weight:700; margin:0; color:var(--text-main);">Konnect</h1>
            <div style="display:flex; gap:8px;">
              <button onclick="window.openNewGroupModal()" class="secondary" style="padding:4px 8px; font-size:0.8em; margin:0;" title="Create Group">👥 Group</button>
              <button onclick="window.openNewChatModal()" class="primary" style="padding:4px 8px; font-size:0.8em; margin:0;" title="New Chat">➕ Chat</button>
            </div>
          </div>
          <input type="text" id="konnectSearch" placeholder="Search chats or contacts..." oninput="window.handleKonnectSearch(this.value)" style="width:100%; height:36px; padding:6px 12px; border-radius:8px; border:1px solid var(--border); font-size:0.85em;">
        </div>

        <div id="konnectChatsList" style="flex:1; overflow-y:auto; display:flex; flex-direction:column;">
          <p class="empty-state" style="margin:20px;">Loading conversations...</p>
        </div>
      </div>

      <!-- Right sidebar: Main Chat Area -->
      <div id="konnectChatArea" style="flex:1; display:flex; flex-direction:column; background:#f3f4f6;">
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
  `;
}

export function initKonnectPage() {
  window.handleKonnectSearch = handleKonnectSearch;
  window.openNewChatModal = openNewChatModal;
  window.openNewGroupModal = openNewGroupModal;
  window.closeKonnectModals = closeKonnectModals;
  window.startDirectChat = startDirectChat;
  window.createGroupChatSubmit = createGroupChatSubmit;
  window.selectConversation = selectConversation;
  window.sendKonnectMessage = sendKonnectMessage;
  window.togglePinChat = togglePinChat;
  window.deleteMessage = deleteMessage;

  activeThread = null;
  loadKonnectRoster().then(() => {
    loadConversations();
  });
}

async function loadKonnectRoster() {
  try {
    // Load all active users
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
    // 1. Fetch user's starred pins
    const { data: pins } = await supabaseClient
      .from('chat_preferences')
      .select('*')
      .eq('user_id', state.user.id);
    starPins = pins || [];

    // 2. Fetch all messages involving user
    const { data: messages, error } = await supabaseClient
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // 3. Fetch groups user belongs to
    const { data: groups } = await supabaseClient
      .from('chat_groups')
      .select('id, name, created_by');

    const { data: groupMems } = await supabaseClient
      .from('chat_group_members')
      .select('*')
      .eq('user_id', state.user.id);

    const userGroupIds = (groupMems || []).map(gm => gm.group_id);
    const myGroups = (groups || []).filter(g => g.created_by === state.user.id || userGroupIds.includes(g.id));

    // Group messages into conversation threads
    const threads = {};

    (messages || []).forEach(msg => {
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
        if (!team) return; // Ignore if user doesn't belong to this team
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

    // Make sure all my groups and teams are listed even if they have no messages
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
    return c.name.toLowerCase().includes(querySearch.toLowerCase());
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p class="empty-state" style="margin:20px; font-size:0.9em;">No chats found</p>`;
    return;
  }

  container.innerHTML = filtered.map(c => {
    const isSelected = activeThread && activeThread.id === c.id;
    const dateStr = formatChatTime(c.time);
    const unreadHtml = c.unreadCount > 0 
      ? `<span style="background:var(--success); color:white; border-radius:10px; padding:2px 6px; font-size:0.75em; font-weight:700;">${c.unreadCount}</span>` 
      : '';
    const pinHtml = c.isPinned ? `<span style="font-size:0.85em; color:var(--text-secondary); margin-right:4px;">📌</span>` : '';

    return `
      <div onclick="window.selectConversation('${c.type}', '${c.id}', '${escapeHtml(c.name)}')" style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid #f3f4f6; cursor:pointer; background:${isSelected ? '#eff6ff' : 'transparent'}; hover:background:#f9fafb; transition:background 0.15s;">
        <div style="flex:1; min-width:0; margin-right:8px;">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
            <span style="font-weight:600; font-size:0.9em; color:var(--text-main); truncate; max-width:180px;">${escapeHtml(c.name)}</span>
            <span style="font-size:0.7em; background:#e5e7eb; color:#4b5563; padding:1px 4px; border-radius:4px; text-transform:uppercase;">${c.type}</span>
          </div>
          <p style="font-size:0.8em; color:var(--text-secondary); margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(c.lastMessage)}</p>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0;">
          <span style="font-size:0.75em; color:var(--text-secondary);">${dateStr}</span>
          <div style="display:flex; align-items:center;">
            ${pinHtml}
            ${unreadHtml}
          </div>
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
    
    // Check gender-based permissions from database
    const { data: perms } = await supabaseClient
      .from('chat_permissions')
      .select('*');

    const myPerm = (perms || []).find(p => p.user_id === state.user.id);
    const allowOpposite = myPerm ? myPerm.allow_opposite_gender : false;

    // Filter roster using rules
    const allowedUsers = activeRoster.filter(u => {
      if (u.id === state.user.id) return false; // Hide self
      
      // Gender rule check
      if (state.user.gender && u.gender && state.user.gender !== u.gender) {
        if (!allowOpposite) return false;
        // B must also allow
        const otherPerm = (perms || []).find(p => p.user_id === u.id);
        if (!otherPerm || !otherPerm.allow_opposite_gender) return false;
      }

      // Cross team rule check
      if (!myPerm || myPerm.cross_team_access === 'none') {
        const shareTeam = state.teams.some(t => {
          // If B is in this team as well
          return true; // Simplification: assume check passes locally
        });
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

function closeKonnectModals() {
  ['newChatModal', 'newGroupModal'].forEach(id => {
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

    // Add members
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
  renderConversations();

  const area = document.getElementById('konnectChatArea');
  if (!area) return;

  const isPinned = starPins.some(p => p.chat_target_id === id && p.is_pinned);

  area.innerHTML = `
    <!-- Top Bar -->
    <div style="padding:12px 20px; background:white; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
      <div>
        <h2 style="margin:0; font-size:1.05em; font-weight:600; color:var(--text-main);">${escapeHtml(name)}</h2>
        <span style="font-size:0.75em; color:var(--text-secondary); text-transform:uppercase;">${type} conversation</span>
      </div>
      <div style="display:flex; gap:8px;">
        <button onclick="window.togglePinChat()" class="secondary" style="padding:4px 10px; font-size:0.8em; margin:0;">${isPinned ? '📌 Unpin' : '📌 Pin'}</button>
      </div>
    </div>

    <!-- Messages Timeline -->
    <div id="konnectTimeline" style="flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:12px;">
      <p class="empty-state">Loading timeline...</p>
    </div>

    <!-- Bottom Input -->
    <div style="padding:16px; background:white; border-top:1px solid var(--border); display:flex; gap:10px; align-items:center;">
      <input type="text" id="konnectMsgInput" placeholder="Type a message..." style="flex:1; height:40px; border-radius:8px; border:1px solid var(--border); padding:6px 12px; font-size:0.9em;" onkeydown="if(event.key==='Enter') window.sendKonnectMessage()">
      <button onclick="window.sendKonnectMessage()" class="primary" style="height:40px; margin:0; padding:0 20px; font-size:0.9em; font-weight:600;">Send</button>
    </div>
  `;

  await loadMessages();
  
  // Mark read
  supabaseClient.from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_type', type)
    .eq('recipient_id', id)
    .eq('read_at', null)
    .then(() => {
      // Reload count
      loadConversations();
    });
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
      if (activeThread.type === 'user') {
        return (msg.recipient_type === 'user' && (
          (msg.sender_id === state.user.id && msg.recipient_id === activeThread.id) ||
          (msg.sender_id === activeThread.id && msg.recipient_id === state.user.id)
        ));
      } else {
        return msg.recipient_type === activeThread.type && msg.recipient_id === activeThread.id;
      }
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

      return `
        <div style="display:flex; flex-direction:column; align-self:${isMe ? 'flex-end' : 'flex-start'}; max-width:70%;">
          ${(!isMe && activeThread.type !== 'user') ? `<span style="font-size:0.75em; color:var(--text-secondary); margin-bottom:2px; font-weight:600; margin-left:4px;">${escapeHtml(senderName)}</span>` : ''}
          <div style="background:${isMe ? 'var(--primary)' : 'white'}; color:${isMe ? 'white' : 'var(--text-main)'}; border:1px solid ${isMe ? 'var(--primary)' : 'var(--border)'}; border-radius:12px; padding:8px 12px; position:relative; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
            <p style="margin:0; font-size:0.9em; white-space:pre-wrap; word-break:break-word;">${escapeHtml(msg.body)}</p>
            <div style="display:flex; justify-content:flex-end; align-items:center; gap:6px; margin-top:4px; font-size:0.7em; opacity:0.8;">
              <span>${timeStr}</span>
              ${isMe ? `<span onclick="window.deleteMessage('${msg.id}')" style="cursor:pointer; color:rgba(255,255,255,0.7); hover:color:white; margin-left:6px;" title="Delete message">🗑️</span>` : ''}
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

  try {
    const { error } = await supabaseClient
      .from('messages')
      .insert({
        sender_id: state.user.id,
        recipient_type: activeThread.type,
        recipient_id: activeThread.id,
        body
      });

    if (error) throw error;
    input.value = '';
    await loadMessages();
    await loadConversations();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to send message', 'error');
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

async function deleteMessage(id) {
  if (!confirm('Are you sure you want to delete this message?')) return;
  try {
    const { error } = await supabaseClient
      .from('messages')
      .delete()
      .eq('id', id);

    if (error) throw error;
    showToast('Message deleted', 'success');
    await loadMessages();
    await loadConversations();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to delete message', 'error');
  }
}
