// ==================== KONNECT MESSAGING HUB ====================
import { supabaseClient } from '../db.js';
import { state } from '../state.js';
import { renderOkShell } from './ok-shell.js';
import { showToast, showConfirm } from '../components/toasts.js';
import { uploadReceipt, resolveReceiptViewUrl } from '../utils/upload.js';

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

// Bulk Deletion state
let konnectDeleteMode = false;
let selectedMsgIds = new Set();

function getLocalDeletedMessageIds() {
  try {
    const key = `deleted_msg_ids_${state.user.id}`;
    return new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  } catch (e) {
    return new Set();
  }
}

function saveLocalDeletedMessageId(msgId) {
  try {
    const key = `deleted_msg_ids_${state.user.id}`;
    const deleted = getLocalDeletedMessageIds();
    deleted.add(msgId);
    localStorage.setItem(key, JSON.stringify(Array.from(deleted)));
  } catch (e) {
    console.error(e);
  }
}

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
    <style>
      .konnect-container {
        display: flex;
        height: calc(100vh - 120px);
        background: var(--bg);
        border-radius: 12px;
        border: 1px solid var(--border);
        overflow: hidden;
        color: var(--text);
      }
      .konnect-sidebar {
        width: 320px;
        border-right: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        background: var(--card-bg);
      }
      .konnect-chat-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        background: var(--bg-secondary);
        position: relative;
      }
      .konnect-input-bar {
        padding: 16px;
        background: var(--card-bg);
        border-top: 1px solid var(--border);
        display: flex;
        gap: 10px;
        align-items: center;
        position: relative;
      }
      .konnect-chat-item {
        display: flex;
        flex-direction: column;
        padding: 10px 12px;
        border-bottom: 1px solid var(--border);
        cursor: pointer;
        transition: background 0.15s;
        background: transparent;
      }
      .konnect-chat-item:hover {
        background: rgba(0, 0, 0, 0.03);
      }
      body.dark .konnect-chat-item:hover {
        background: rgba(255, 255, 255, 0.03);
      }
      .konnect-chat-item.selected {
        background: rgba(59, 130, 246, 0.15) !important;
      }
      @media (max-width: 768px) {
        .konnect-container {
          height: calc(100vh - 170px);
          border-radius: 0;
          border: none;
        }
        .konnect-container:not(.active-chat) .konnect-sidebar {
          width: 100% !important;
          display: flex !important;
        }
        .konnect-container:not(.active-chat) .konnect-chat-area {
          display: none !important;
        }
        .konnect-container.active-chat .konnect-sidebar {
          display: none !important;
        }
        .konnect-container.active-chat .konnect-chat-area {
          width: 100% !important;
          display: flex !important;
        }
        #konnectMobileBackBtn {
          display: inline-flex !important;
        }
        .konnect-input-bar {
          padding: 8px 10px !important;
          gap: 6px !important;
        }
        #konnectAttachmentBtn, #konnectSelfDestructBtn {
          width: 36px !important;
          height: 36px !important;
          font-size: 1.15em !important;
        }
        #konnectMsgInput {
          height: 36px !important;
          font-size: 0.85em !important;
          padding: 4px 8px !important;
        }
        .konnect-send-btn {
          height: 36px !important;
          width: 36px !important;
          padding: 0 !important;
          font-size: 0.85em !important;
        }
      }
    </style>
    <div id="konnectContainer" class="konnect-container">
      <!-- Left sidebar: Chats List -->
      <div class="konnect-sidebar">
        <div style="padding:12px; border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <input type="text" id="konnectSearch" placeholder="Search name or messages..." oninput="window.handleKonnectSearch(this.value)" style="flex:1; height:32px; padding:4px 8px; border-radius:6px; border:1px solid var(--border); font-size:0.8em;">
            <button onclick="window.openSettingsModal()" class="secondary" style="padding:4px; font-size:1.25em; margin:0; height:32px; width:32px; display:flex; align-items:center; justify-content:center; border:none; background:none; color:var(--primary); cursor:pointer;" title="Settings">⚙️</button>
          </div>
        </div>

        <div id="konnectChatsList" style="flex:1; overflow-y:auto; display:flex; flex-direction:column;">
          <p class="empty-state" style="margin:20px;">Loading conversations...</p>
        </div>
      </div>

      <!-- Right sidebar: Main Chat Area -->
      <div id="konnectChatArea" class="konnect-chat-area">
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
        <div class="form-group" style="margin-bottom:12px;">
          <label style="font-weight:600; font-size:0.85em; color:var(--text-main); display:block; margin-bottom:4px;">Search Volunteer</label>
          <input type="text" id="newChatSearchInput" placeholder="Type name to filter..." oninput="window.filterNewChatRecipients(this.value)" style="width:100%; height:38px; border-radius:6px; border:1px solid var(--border); padding:6px 12px; font-size:0.9em; margin-bottom:8px;">
        </div>
        <div class="form-group">
          <label style="font-weight:600; font-size:0.85em; color:var(--text-main); display:block; margin-bottom:4px;">Select Recipient</label>
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

    <!-- Modal: Custom Prompt -->
    <div id="konnectPromptModal" class="modal">
      <div class="modal-content" style="max-width:400px;">
        <h2 id="konnectPromptTitle" style="margin-top:0; font-size:1.15em; color:var(--text-main);">Enter Caption</h2>
        <div class="form-group" style="margin:12px 0;">
          <input type="text" id="konnectPromptInput" style="width:100%; height:38px; border-radius:6px; border:1px solid var(--border); padding:6px 12px; font-size:0.9em;">
        </div>
        <div class="btn-group" style="display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" class="secondary" onclick="window.closePromptModal(false)">Cancel</button>
          <button type="button" class="primary" id="konnectPromptSubmitBtn" onclick="window.closePromptModal(true)">Submit</button>
        </div>
      </div>
    </div>

    <!-- Modal: Custom Confirm -->
    <div id="konnectConfirmModal" class="modal">
      <div class="modal-content" style="max-width:380px; text-align:center;">
        <h3 id="konnectConfirmTitle" style="margin-top:0; font-size:1.1em; color:var(--text-main);">Confirm Action</h3>
        <p id="konnectConfirmMessage" style="font-size:0.9em; color:var(--text-secondary); margin-bottom:20px;"></p>
        <div style="display:flex; justify-content:center; gap:12px;">
          <button type="button" class="secondary" onclick="window.closeConfirmModal(false)">Cancel</button>
          <button type="button" class="danger" id="konnectConfirmSubmitBtn" onclick="window.closeConfirmModal(true)" style="margin:0;">Yes, proceed</button>
        </div>
      </div>
    </div>

    <!-- Modal: Read Receipts Info -->
    <div id="konnectInfoModal" class="modal">
      <div class="modal-content" style="max-width:400px; text-align:left;">
        <h3 style="margin-top:0; font-size:1.1em; color:var(--text-main); display:flex; justify-content:space-between; align-items:center;">
          <span>ℹ️ Message Read Info</span>
          <button onclick="window.closeInfoModal()" style="background:none; border:none; font-size:1.25em; cursor:pointer; font-weight:700; color:var(--text-secondary);">&times;</button>
        </h3>
        <div id="konnectInfoContent" style="max-height:280px; overflow-y:auto; margin:16px 0; font-size:0.9em; display:flex; flex-direction:column; gap:8px;">
          <!-- Loaded dynamically -->
        </div>
        <div style="display:flex; justify-content:flex-end;">
          <button type="button" class="secondary" onclick="window.closeInfoModal()">Close</button>
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
  window.backToChatsList = backToChatsList;
  window.sendKonnectMessage = sendKonnectMessage;
  window.togglePinChat = togglePinChat;
  window.markChatAsUnread = markChatAsUnread;
  
  // Message Actions
  window.toggleMessageActions = toggleMessageActions;
  window.replyToMessage = replyToMessage;
  window.cancelReply = cancelReply;
  window.startDeleteMessageFlow = startDeleteMessageFlow;
  window.undoDeleteMessage = undoDeleteMessage;
  window.enterDeleteMode = enterDeleteMode;
  window.exitDeleteMode = exitDeleteMode;
  window.handleSelectAllMessages = handleSelectAllMessages;
  window.handleMsgSelectChange = handleMsgSelectChange;
  window.executeBulkDelete = executeBulkDelete;
  window.selectedMsgIds = selectedMsgIds;
  window.konnectDeleteMode = konnectDeleteMode;
  window.triggerChatAttachment = triggerChatAttachment;
  window.handleChatFileSelection = handleChatFileSelection;
  window.closePromptModal = closePromptModal;
  window.closeConfirmModal = closeConfirmModal;
  window.filterNewChatRecipients = filterNewChatRecipients;
  window.showReadReceipts = showReadReceipts;
  window.closeInfoModal = closeInfoModal;
  window.toggleSelfDestructPanel = () => {
    const panel = document.getElementById('selfDestructConfigPanel');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
  };
  window.handleSelfDestructToggle = () => {
    const enabled = document.getElementById('selfDestructEnabled')?.checked;
    const container = document.getElementById('selfDestructTimerContainer');
    const badge = document.getElementById('selfDestructActiveBadge');
    if (container) container.style.display = enabled ? 'flex' : 'none';
    if (badge) badge.style.display = enabled ? 'block' : 'none';
  };

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
      } else if (msg.recipient_type === 'role') {
        const userGender = String(state.user?.gender || '').toLowerCase().trim();
        const userRole = String(state.user?.role || '').toLowerCase().trim();
        const isAdmin = ['admin', 'caoh', 'oh', 'ceo'].includes(userRole) || !!state.isOkAdmin;

        if (msg.recipient_id === 'all') {
          threadKey = 'broadcast-all';
          threadType = 'role';
          threadName = 'Global (All Users)';
        } else if (msg.recipient_id === 'male' && (userGender === 'male' || isAdmin)) {
          threadKey = 'broadcast-male';
          threadType = 'role';
          threadName = 'Global (Male Users)';
        } else if (msg.recipient_id === 'female' && (userGender === 'female' || isAdmin)) {
          threadKey = 'broadcast-female';
          threadType = 'role';
          threadName = 'Global (Female Users)';
        } else {
          return;
        }
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

    const userGender = String(state.user?.gender || '').toLowerCase().trim();
    const userRole = String(state.user?.role || '').toLowerCase().trim();
    const isAdmin = ['admin', 'caoh', 'oh', 'ceo'].includes(userRole) || !!state.isOkAdmin;

    const globalChannels = [
      { id: 'broadcast-all', type: 'role', name: 'Global (All Users)', recipient_id: 'all' }
    ];
    if (userGender === 'male' || isAdmin) {
      globalChannels.push({ id: 'broadcast-male', type: 'role', name: 'Global (Male Users)', recipient_id: 'male' });
    }
    if (userGender === 'female' || isAdmin) {
      globalChannels.push({ id: 'broadcast-female', type: 'role', name: 'Global (Female Users)', recipient_id: 'female' });
    }

    globalChannels.forEach(c => {
      if (!threads[c.id]) {
        threads[c.id] = {
          id: c.id,
          type: 'role',
          name: c.name,
          lastMessage: 'No announcements yet',
          time: new Date(0).toISOString(),
          unreadCount: 0,
          isPinned: starPins.some(p => p.chat_target_id === c.id && p.is_pinned),
          recipient_id: c.recipient_id
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
      <div onclick="window.selectConversation('${c.type}', '${c.id}', '${escapeHtml(c.name)}')" class="konnect-chat-item${isSelected ? ' selected' : ''}">
        <!-- Row 1: Name and Metadata -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span style="font-weight:600; font-size:0.85em; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px;">${escapeHtml(c.name)}</span>
          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            ${pinHtml}
            ${unreadHtml}
            <span style="font-size:0.75em; color:var(--text-secondary);">${dateStr}</span>
          </div>
        </div>
        <!-- Row 2: Message Excerpt -->
        <div style="font-size:0.75em; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          ${escapeHtml(c.lastMessage)}
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

let allowedNewChatUsers = [];

async function openNewChatModal() {
  const input = document.getElementById('newChatSearchInput');
  if (input) input.value = '';

  const select = document.getElementById('newChatRecipient');
  if (select) {
    select.innerHTML = '<option value="">Select contact...</option>';
    const { data: perms } = await supabaseClient.from('chat_permissions').select('*');
    const myPerm = (perms || []).find(p => p.user_id === state.user.id);
    const isGlobalUser = ['caoh', 'oh', 'fin', 'admin'].includes(state.user.role?.toLowerCase()) || !!state.isOkAdmin;
    const allowOpposite = myPerm ? myPerm.allow_opposite_gender : false;
    const crossTeam = isGlobalUser ? 'global' : (myPerm ? myPerm.cross_team_access : 'none');

    let sharedTeamUserIds = [];
    if (crossTeam !== 'global') {
      const { data: myTeamRows } = await supabaseClient
        .from('user_teams')
        .select('team_id')
        .eq('user_id', state.user.id);
      const myTeamIds = (myTeamRows || []).map(r => r.team_id);
      if (myTeamIds.length > 0) {
        const { data: sharedRows } = await supabaseClient
          .from('user_teams')
          .select('user_id')
          .in('team_id', myTeamIds);
        sharedTeamUserIds = [...new Set((sharedRows || []).map(r => r.user_id))];
      }
    }

    allowedNewChatUsers = activeRoster.filter(u => {
      if (u.id === state.user.id) return false;
      if (crossTeam !== 'global') {
        if (!sharedTeamUserIds.includes(u.id)) return false;
      }
      if (state.user.gender && u.gender && state.user.gender !== u.gender) {
        const myAllowedList = myPerm?.allowed_users || [];
        if (!myAllowedList.includes(u.id)) {
          if (!allowOpposite) return false;
          const otherPerm = (perms || []).find(p => p.user_id === u.id);
          if (!otherPerm || !otherPerm.allow_opposite_gender) return false;
        }
      }
      return true;
    });

    renderNewChatRecipientsList(allowedNewChatUsers);
  }

  const modal = document.getElementById('newChatModal');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
}

function renderNewChatRecipientsList(list) {
  const select = document.getElementById('newChatRecipient');
  if (!select) return;
  select.innerHTML = '<option value="">Select contact...</option>';
  list.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `${u.name} (${u.role || 'Volunteer'})`;
    select.appendChild(opt);
  });
}

function filterNewChatRecipients(query) {
  const filtered = allowedNewChatUsers.filter(u => 
    u.name.toLowerCase().includes(query.toLowerCase())
  );
  renderNewChatRecipientsList(filtered);
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
        <div style="display:flex; flex-direction:column; gap:10px; border-bottom:1px solid var(--border); padding-bottom:12px; margin-bottom:12px;">
          <button onclick="window.closeKonnectModals(); window.openNewChatModal();" class="primary" style="margin:0; width:100%;">➕ Start New Chat</button>
          <button onclick="window.closeKonnectModals(); window.openNewGroupModal();" class="secondary" style="margin:0; width:100%;">👥 Create Group Chat</button>
        </div>
        <div style="background:var(--bg-secondary); padding:10px; border-radius:6px; border:1px solid var(--border); color:var(--text);">
          <strong>Gender clearance:</strong> ${allowOpposite ? '✅ Allowed' : '❌ Opposite gender messages blocked'}
        </div>
        <div style="background:var(--bg-secondary); padding:10px; border-radius:6px; border:1px solid var(--border); color:var(--text);">
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

  const container = document.getElementById('konnectContainer');
  if (container) {
    container.classList.add('active-chat');
  }

  const area = document.getElementById('konnectChatArea');
  if (!area) return;

  const isPinned = starPins.some(p => p.chat_target_id === id && p.is_pinned);

  const isGlobalUser = ['admin', 'caoh', 'oh', 'ceo'].includes(state.user?.role?.toLowerCase()) || !!state.isOkAdmin;
  const isReadOnlyBroadcast = type === 'role' && !isGlobalUser;

  const inputBarHtml = isReadOnlyBroadcast
    ? `
      <div style="flex:1; text-align:center; padding:10px 16px; background:var(--bg-secondary); border-radius:8px; border:1px solid var(--border); font-size:0.9em; color:var(--text-secondary); font-style:italic;">
        📢 Only administrators can send messages to this broadcast channel.
      </div>
    `
    : `
      <!-- Floating Self Destruct Panel -->
      <div id="selfDestructConfigPanel" style="display:none; position:absolute; bottom:65px; left:16px; background:var(--card-bg); border:1px solid var(--border); border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.2); padding:12px; z-index:100; width:220px; flex-direction:column; gap:8px; color:var(--text);">
        <div style="font-weight:600; font-size:0.85em; display:flex; justify-content:space-between; align-items:center;">
          <span>⏱️ Timed Message</span>
          <button type="button" onclick="window.toggleSelfDestructPanel()" style="background:none; border:none; cursor:pointer; font-weight:700; color:var(--text);">×</button>
        </div>
        <div style="display:flex; align-items:center; gap:8px; font-size:0.8em; margin:4px 0;">
          <input type="checkbox" id="selfDestructEnabled" onchange="window.handleSelfDestructToggle()">
          <label for="selfDestructEnabled" style="cursor:pointer; user-select:none;">Enable timer</label>
        </div>
        <div id="selfDestructTimerContainer" style="display:none; flex-direction:column; gap:4px;">
          <span style="font-size:0.75em; color:var(--text-secondary);">Seconds (15 to 300):</span>
          <input type="number" id="selfDestructSeconds" min="15" max="300" value="60" style="border:1px solid var(--border); padding:4px 8px; border-radius:4px; font-size:0.85em;">
        </div>
      </div>

      <button id="konnectAttachmentBtn" onclick="window.triggerChatAttachment()" style="height:40px; width:40px; margin:0; padding:0; display:flex; align-items:center; justify-content:center; font-size:1.25em; border:none; background:none; color:var(--primary); cursor:pointer;" title="Attach File">📎</button>
      <input type="file" id="konnectAttachmentInput" style="display:none;" onchange="window.handleChatFileSelection(event)">
      
      <button onclick="window.toggleSelfDestructPanel()" id="konnectSelfDestructBtn" style="height:40px; width:40px; margin:0; padding:0; display:flex; align-items:center; justify-content:center; font-size:1.25em; border:none; background:none; color:var(--primary); cursor:pointer; position:relative;" title="Timed Message">
        ⏱️
        <span id="selfDestructActiveBadge" style="display:none; position:absolute; top:4px; right:4px; background:var(--success); width:8px; height:8px; border-radius:50%;"></span>
      </button>

      <input type="text" id="konnectMsgInput" placeholder="Type a message..." style="flex:1; height:40px; border-radius:8px; border:1px solid var(--border); padding:6px 12px; font-size:0.9em; background:var(--bg-secondary); color:var(--text);" onkeydown="if(event.key==='Enter') window.sendKonnectMessage()">
      <button onclick="window.sendKonnectMessage()" class="primary konnect-send-btn" style="height:40px; width:40px; margin:0; padding:0; display:flex; align-items:center; justify-content:center; font-size:1.1em; border-radius:8px;" title="Send"><i class="fa-solid fa-paper-plane"></i></button>
    `;

  area.innerHTML = `
    <div id="konnectChatHeaderContainer"></div>

    <!-- Messages Timeline -->
    <div id="konnectTimeline" style="flex:1; overflow-y:auto; padding:12px 16px; display:flex; flex-direction:column; gap:3px;">
      <p class="empty-state">Loading timeline...</p>
    </div>

    <!-- Reply Context Bar -->
    <div id="konnectReplyBar" style="display:none; padding:8px 16px; background:var(--bg-secondary); border-top:1px solid var(--border); border-left:4px solid var(--primary); justify-content:space-between; align-items:center; color:var(--text);">
      <div style="font-size:0.8em;">
        <strong>Replying to <span id="konnectReplySender"></span></strong>
        <p id="konnectReplyText" style="margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:400px; color:var(--text-secondary);"></p>
      </div>
      <button onclick="window.cancelReply()" style="background:none; border:none; color:#ef4444; font-weight:700; cursor:pointer; font-size:1.1em;">&times;</button>
    </div>

    <!-- Bottom Input -->
    <div class="konnect-input-bar">
      ${inputBarHtml}
    </div>
  `;

  updateChatHeaderAndBulkBar();
  await loadMessages();
  
  let markReadQuery = supabaseClient.from('messages')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);

  if (type === 'user') {
    markReadQuery = markReadQuery
      .eq('recipient_type', 'user')
      .eq('sender_id', id)
      .eq('recipient_id', state.user.id);
  } else {
    let dbRecipientId = id;
    if (type === 'role') {
      if (id === 'broadcast-all') dbRecipientId = 'all';
      else if (id === 'broadcast-male') dbRecipientId = 'male';
      else if (id === 'broadcast-female') dbRecipientId = 'female';
    }
    markReadQuery = markReadQuery
      .eq('recipient_type', type)
      .eq('recipient_id', dbRecipientId)
      .neq('sender_id', state.user.id);

    // Group/Team: log read event under read_by_users in metadata
    try {
      const { data: unreadMsgs } = await supabaseClient
        .from('messages')
        .select('*')
        .eq('recipient_type', type)
        .eq('recipient_id', id)
        .neq('sender_id', state.user.id);
      
      const toUpdate = (unreadMsgs || []).filter(m => !m.metadata?.read_by_users?.[state.user.id]);
      for (const m of toUpdate) {
        m.metadata = m.metadata || {};
        m.metadata.read_by_users = m.metadata.read_by_users || {};
        m.metadata.read_by_users[state.user.id] = new Date().toISOString();
        await supabaseClient.from('messages').update({ metadata: m.metadata }).eq('id', m.id);
      }
    } catch (e) {
      console.warn("Failed to log read event under metadata:", e);
    }
  }

  const { error } = await markReadQuery;

  if (error) {
    console.error("Failed to mark messages as read:", error);
  } else {
    await loadConversations();
  }
}

let activeThreadMemberCount = 2;

async function loadMessages() {
  const timeline = document.getElementById('konnectTimeline');
  if (!timeline) return;

  try {
    if (activeThread) {
      if (activeThread.type === 'group') {
        const { count } = await supabaseClient
          .from('chat_group_members')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', activeThread.id);
        activeThreadMemberCount = count || 2;
      } else if (activeThread.type === 'team') {
        const { count } = await supabaseClient
          .from('user_teams')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', activeThread.id);
        activeThreadMemberCount = count || 2;
      } else {
        activeThreadMemberCount = 2;
      }
    }

    const { data: messages, error } = await supabaseClient
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    allMessages = messages || [];

    const filtered = (messages || []).filter(msg => {
      // Direct vs Group/Team sorting
      let match = false;
      if (activeThread.type === 'user') {
        match = (msg.recipient_type === 'user' && (
          (msg.sender_id === state.user.id && msg.recipient_id === activeThread.id) ||
          (msg.sender_id === activeThread.id && msg.recipient_id === state.user.id)
        ));
      } else {
        let dbRecipientId = activeThread.id;
        if (activeThread.type === 'role') {
          if (activeThread.id === 'broadcast-all') dbRecipientId = 'all';
          else if (activeThread.id === 'broadcast-male') dbRecipientId = 'male';
          else if (activeThread.id === 'broadcast-female') dbRecipientId = 'female';
        }
        match = msg.recipient_type === activeThread.type && msg.recipient_id === dbRecipientId;
      }

      if (!match) return false;

      // Filter out messages deleted for all or deleted for me (including client-side localStorage overrides)
      const localDeleted = getLocalDeletedMessageIds();
      if (localDeleted.has(msg.id)) return false;
      if (msg.metadata?.deleted_for_all === true) return false;
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
          <div style="display:flex; align-items:center; width:100%; justify-content:${isMe ? 'flex-end' : 'flex-start'}; margin:2px 0;">
            <div style="max-width:80%; margin:0;">
              <div style="background:#fee2e2; border:1px dashed #ef4444; border-radius:6px; padding:4px 8px; display:flex; align-items:center; justify-content:space-between; gap:12px; animation:pulse 1.5s infinite;">
                <span id="delete-timer-text-${msg.id}" style="color:#b91c1c; font-weight:600; font-size:0.8em;">Deleting in ${deletingCountdown}s...</span>
                <button onclick="window.undoDeleteMessage(event)" style="padding:1px 6px; font-size:0.75em; font-weight:700; color:white; background:#ef4444; border:none; border-radius:3px; cursor:pointer;">Undo</button>
              </div>
            </div>
          </div>
        `;
      }

      // Quoted Reply Context block
      let quoteHtml = '';
      if (msg.metadata?.reply_to) {
        const quoteBg = 'rgba(0,0,0,0.05)';
        const quoteBorder = '3px solid var(--primary)';
        const quoteColor = 'var(--text-secondary)';
        quoteHtml = `
          <div style="background:${quoteBg}; border-left:${quoteBorder}; padding:4px 8px; border-radius:4px; margin-bottom:4px; font-size:0.8em; color:${quoteColor}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; box-sizing:border-box; display:block; border-bottom:1px solid rgba(0,0,0,0.05);">
            <strong>${escapeHtml(msg.metadata.reply_to.sender)}</strong>: "${escapeHtml(msg.metadata.reply_to.body)}"
          </div>
        `;
      }

      // Attachment rendering
      let attachHtml = '';
      if (msg.attachment_url) {
        attachHtml = `
          <div style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:4px; padding:2px 6px; display:inline-flex; align-items:center; gap:6px; font-size:0.8em; color:var(--primary); vertical-align:middle;">
            <span>📎</span>
            <a href="${msg.attachment_url}" target="_blank" style="color:inherit; font-weight:600; text-decoration:underline; word-break:break-all;">
              ${escapeHtml(msg.attachment_name || 'Attached file')}
            </a>
          </div>
        `;
      }

      const destructDuration = msg.metadata?.destruct_duration;
      let isTimedPlaceholder = false;
      let remainingSeconds = null;

      if (destructDuration) {
        if (!isMe) {
          const readAtStr = msg.metadata?.read_by_users?.[state.user.id];
          if (!readAtStr) {
            isTimedPlaceholder = true;
          } else {
            const readAt = new Date(readAtStr).getTime();
            const elapsed = Math.floor((Date.now() - readAt) / 1000);
            remainingSeconds = destructDuration - elapsed;
            if (remainingSeconds <= 0) {
              window.expireTimedMessage(msg.id);
              return '';
            }
          }
        } else {
          // I am the sender: check if recipients have read and expired
          if (activeThread.type === 'user') {
            const receiverReadAtStr = msg.metadata?.read_by_users?.[activeThread.id];
            if (receiverReadAtStr) {
              const readAt = new Date(receiverReadAtStr).getTime();
              const elapsed = Math.floor((Date.now() - readAt) / 1000);
              remainingSeconds = destructDuration - elapsed;
              if (remainingSeconds <= 0) {
                window.expireTimedMessage(msg.id);
                return '';
              }
            }
          } else {
            const readUsers = Object.keys(msg.metadata?.read_by_users || {});
            const targetCount = activeThreadMemberCount - 1;
            if (readUsers.length >= targetCount && readUsers.length > 0) {
              const readTimestamps = Object.values(msg.metadata.read_by_users).map(t => new Date(t).getTime());
              const latestReadAt = Math.max(...readTimestamps);
              const elapsed = Math.floor((Date.now() - latestReadAt) / 1000);
              remainingSeconds = destructDuration - elapsed;
              if (remainingSeconds <= 0) {
                window.expireTimedMessage(msg.id);
                return '';
              }
            }
          }
        }
      }

      let contentBody = '';
      if (isTimedPlaceholder) {
        contentBody = `
          <div onclick="window.revealTimedMessage(event, '${msg.id}', ${destructDuration})" style="cursor:pointer; display:flex; align-items:center; gap:6px; background:${isMe ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)'}; padding:6px 12px; border-radius:6px; font-style:italic; font-size:0.9em; user-select:none; width:100%; box-sizing:border-box;">
            ⏱️ Timed message (${destructDuration}s) - Tap to reveal
          </div>
        `;
      } else {
        contentBody = `
          <span style="white-space:normal; word-break:break-word; font-size:0.95em;">${escapeHtml(msg.body)}</span>
          ${attachHtml}
        `;

        if (remainingSeconds !== null) {
          window.__konnectTimedIntervals = window.__konnectTimedIntervals || {};
          if (!window.__konnectTimedIntervals[msg.id]) {
            let sec = remainingSeconds;
            window.__konnectTimedIntervals[msg.id] = setInterval(() => {
              sec--;
              const el = document.getElementById(`timer-${msg.id}`);
              if (el) {
                el.textContent = `⏱️ ${sec}s`;
              }
              if (sec <= 0) {
                window.expireTimedMessage(msg.id);
              }
            }, 1000);
          }
        }
      }

      const timerBadge = remainingSeconds !== null 
        ? `<span id="timer-${msg.id}" style="color:${isMe ? 'var(--primary)' : '#ef4444'}; font-weight:700; margin-left:6px; font-size:0.8em; flex-shrink:0;">⏱️ ${remainingSeconds}s</span>`
        : (destructDuration && isMe ? `<span style="color:var(--primary); margin-left:6px; font-size:0.8em; flex-shrink:0;" title="Timed Message">⏱️ ${destructDuration}s</span>` : '');

      let statusDot = '';
      if (isMe) {
        if (activeThread.type === 'user') {
          const isRead = msg.read_at || msg.metadata?.read_by_users?.[activeThread.id];
          statusDot = isRead 
            ? `<span style="font-size:0.7em; margin-left:4px;" title="Read">🟢</span>`
            : `<span style="font-size:0.7em; margin-left:4px;" title="Sent">🔴</span>`;
        } else {
          const readCount = Object.keys(msg.metadata?.read_by_users || {}).length;
          const targetCount = activeThreadMemberCount - 1;
          if (readCount === 0) {
            statusDot = `<span style="font-size:0.7em; margin-left:4px;" title="Sent">🔴</span>`;
          } else if (readCount < targetCount) {
            statusDot = `<span style="font-size:0.7em; margin-left:4px;" title="Read by some (${readCount}/${targetCount})">🟠</span>`;
          } else {
            statusDot = `<span style="font-size:0.7em; margin-left:4px;" title="Read by all (${readCount}/${targetCount})">🟢</span>`;
          }
        }
      }

      const checkboxHtml = window.konnectDeleteMode
        ? `<input type="checkbox" class="msg-select-checkbox" data-msg-id="${msg.id}" onchange="window.handleMsgSelectChange(this)" style="cursor:pointer; width:16px; height:16px; margin-right:8px; align-self:center;" ${window.selectedMsgIds.has(msg.id) ? 'checked' : ''}>`
        : '';
        
      const actionTriggerHtml = window.konnectDeleteMode
        ? ''
        : `<span class="msg-action-trigger" onclick="window.toggleMessageActions(event, '${msg.id}')" style="cursor:pointer; font-weight:700; opacity:0.8; padding:0 2px;">⋮</span>`;

      return `
        <div style="display:flex; align-items:center; width:100%; justify-content:${isMe ? 'flex-end' : 'flex-start'}; margin:2px 0;">
          ${checkboxHtml}
          <div class="msg-bubble-container" data-msg-id="${msg.id}" style="display:flex; flex-direction:column; max-width:80%; position:relative; width:auto;">
            <div class="msg-bubble" style="background:var(--card-bg); color:var(--text); border:${isMe ? '2px solid var(--primary)' : '1px solid var(--border)'}; border-radius:${isMe ? '8px 8px 0px 8px' : '8px 8px 8px 0px'}; padding:4px 8px; box-shadow:0 1px 2px rgba(0,0,0,0.05); position:relative; width:100%; box-sizing:border-box;">
              ${quoteHtml}
              <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px; font-size:0.85em; width:100%;">
                <div style="min-width:0; flex:1;">
                  ${(!isMe && activeThread.type !== 'user') ? `<strong style="color:var(--primary); font-weight:700; margin-right:4px;">${escapeHtml(senderName)}:</strong>` : ''}
                  ${contentBody}
                </div>
                <div style="display:flex; align-items:center; gap:4px; flex-shrink:0; margin-left:6px; white-space:nowrap;">
                  ${timerBadge}
                  <span style="font-size:0.8em; opacity:0.8;">${timeStr}</span>
                  ${statusDot}
                  ${actionTriggerHtml}
                </div>
              </div>

              <!-- Floating Actions Dropdown Card -->
              <div id="msgDropdown-${msg.id}" class="msg-actions-dropdown" style="display:none; position:absolute; right:10px; top:24px; background:var(--card-bg); border:1px solid var(--border); border-radius:6px; box-shadow:0 4px 6px rgba(0,0,0,0.15); z-index:100; font-size:0.85em; flex-direction:column; width:135px; overflow:hidden; color:var(--text);">
                <div onclick="window.replyToMessage('${msg.id}', '${escapeHtml(msg.body)}', '${escapeHtml(senderName)}')" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid var(--border); text-align:left; background:var(--card-bg); color:var(--text);">💬 Reply</div>
                ${isMe ? `<div onclick="window.showReadReceipts('${msg.id}')" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid var(--border); text-align:left; background:var(--card-bg); color:var(--text);">ℹ️ Info</div>` : ''}
                ${!isMe ? `<div onclick="window.markChatAsUnread('${msg.id}')" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid var(--border); text-align:left; background:var(--card-bg); color:var(--text);">📩 Mark Unread</div>` : ''}
                <div onclick="window.startDeleteMessageFlow('${msg.id}', 'me')" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid var(--border); text-align:left; background:var(--card-bg); color:#ef4444;">🗑️ Delete for me</div>
                ${isMe ? `<div onclick="window.startDeleteMessageFlow('${msg.id}', 'everyone')" style="padding:8px 12px; cursor:pointer; text-align:left; background:var(--card-bg); color:#ef4444; font-weight:600;">🗑️ Delete for all</div>` : ''}
              </div>
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

  const selfDestructEnabled = document.getElementById('selfDestructEnabled')?.checked;
  const selfDestructSecondsInput = document.getElementById('selfDestructSeconds');
  if (selfDestructEnabled && selfDestructSecondsInput) {
    const duration = parseInt(selfDestructSecondsInput.value, 10) || 60;
    if (duration >= 15 && duration <= 300) {
      metadata.destruct_duration = duration;
      metadata.read_by_users = {};
    } else {
      showToast('Timed message range must be 15s to 300s', 'warning');
      return;
    }
  }

  try {
    let dbRecipientId = activeThread.id;
    if (activeThread.type === 'role') {
      if (activeThread.id === 'broadcast-all') dbRecipientId = 'all';
      else if (activeThread.id === 'broadcast-male') dbRecipientId = 'male';
      else if (activeThread.id === 'broadcast-female') dbRecipientId = 'female';
    }

    const { error } = await supabaseClient
      .from('messages')
      .insert({
        sender_id: state.user.id,
        recipient_type: activeThread.type,
        recipient_id: dbRecipientId,
        body,
        metadata
      });

    if (error) throw error;
    input.value = '';
    cancelReply();
    const checkbox = document.getElementById('selfDestructEnabled');
    if (checkbox) checkbox.checked = false;
    window.handleSelfDestructToggle();
    const panel = document.getElementById('selfDestructConfigPanel');
    if (panel) panel.style.display = 'none';
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
    if (el.style.display === 'flex') {
      const trigger = e.target;
      const rect = trigger.getBoundingClientRect();
      const container = document.getElementById('konnectTimeline');
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const spaceBelow = containerRect.bottom - rect.bottom;
        if (spaceBelow < 150) {
          el.style.top = 'auto';
          el.style.bottom = '24px';
        } else {
          el.style.bottom = 'auto';
          el.style.top = '24px';
        }
      }
    }
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

  if (deletingMessageId && deletingMessageId !== msgId) {
    finalizeMessageDeletion();
  }

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
      const timerText = document.getElementById(`delete-timer-text-${msgId}`);
      if (timerText) {
        timerText.textContent = `Deleting in ${deletingCountdown}s...`;
      }
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
  if (!msgId) return;
  const scope = deletingScope;
  deletingMessageId = null;

  try {
    if (scope === 'me') {
      saveLocalDeletedMessageId(msgId);
      const msg = allMessages.find(m => m.id === msgId);
      if (msg) {
        const metadata = msg.metadata || {};
        const deletedForMe = metadata.deleted_by_users || [];
        if (!deletedForMe.includes(state.user.id)) {
          deletedForMe.push(state.user.id);
        }
        metadata.deleted_by_users = deletedForMe;
        await supabaseClient.from('messages').update({ metadata }).eq('id', msgId);
      }
    } else {
      // Try hard delete
      const { error: deleteErr } = await supabaseClient
        .from('messages')
        .delete()
        .eq('id', msgId);

      if (deleteErr) {
        console.warn('Hard delete failed, falling back to soft delete metadata flag:', deleteErr);
        const msg = allMessages.find(m => m.id === msgId);
        const metadata = msg?.metadata || {};
        metadata.deleted_for_all = true;

        const { error: updateErr } = await supabaseClient
          .from('messages')
          .update({ metadata })
          .eq('id', msgId);

        if (updateErr) throw updateErr;
      }
    }

    showToast('Message deleted', 'success');
    await loadMessages();
    await loadConversations();
  } catch (err) {
    console.error(err);
    if (scope === 'me') {
      showToast('Message deleted', 'success');
    } else {
      showToast(err.message || 'Failed to delete message', 'error');
    }
    loadMessages(); // Redraw
  }
}

function triggerChatAttachment() {
  const fileInput = document.getElementById('konnectAttachmentInput');
  if (fileInput) fileInput.click();
}

async function handleChatFileSelection(e) {
  const file = e.target.files[0];
  if (!file) return;

  const captionInput = await showCustomPrompt(`Enter a caption for "${file.name}" (optional):`, file.name);
  if (captionInput === null) return;
  const caption = captionInput.trim() || file.name;

  try {
    showToast('Uploading attachment...', 'info');

    const { objectKey } = await uploadReceipt(file);
    const publicUrl = resolveReceiptViewUrl(objectKey);

    let dbRecipientId = activeThread.id;
    if (activeThread.type === 'role') {
      if (activeThread.id === 'broadcast-all') dbRecipientId = 'all';
      else if (activeThread.id === 'broadcast-male') dbRecipientId = 'male';
      else if (activeThread.id === 'broadcast-female') dbRecipientId = 'female';
    }

    const { error: msgErr } = await supabaseClient
      .from('messages')
      .insert({
        sender_id: state.user.id,
        recipient_type: activeThread.type,
        recipient_id: dbRecipientId,
        body: `Shared file: ${caption}`,
        attachment_url: publicUrl,
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

async function markChatAsUnread(msgId) {
  let targetMsgId = msgId;
  
  if (!targetMsgId && activeThread) {
    const lastReceived = allMessages.find(m => {
      let dbRecipientId = activeThread.id;
      if (activeThread.type === 'role') {
        if (activeThread.id === 'broadcast-all') dbRecipientId = 'all';
        else if (activeThread.id === 'broadcast-male') dbRecipientId = 'male';
        else if (activeThread.id === 'broadcast-female') dbRecipientId = 'female';
      }
      const isThisThread = activeThread.type === 'user'
        ? (m.recipient_type === 'user' && m.sender_id === activeThread.id && m.recipient_id === state.user.id)
        : (m.recipient_type === activeThread.type && m.recipient_id === dbRecipientId && m.sender_id !== state.user.id);
      return isThisThread;
    });
    if (lastReceived) targetMsgId = lastReceived.id;
  }

  if (!targetMsgId) {
    showToast('No messages to mark as unread', 'warning');
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('messages')
      .update({ read_at: null })
      .eq('id', targetMsgId);

    if (error) throw error;
    showToast('Message marked unread', 'success');
    await loadConversations();
    document.querySelectorAll('.msg-actions-dropdown').forEach(el => el.style.display = 'none');
  } catch (err) {
    console.error(err);
  }
}

// Custom Promise-Driven dialog prompts (replacing native prompt/confirm)
let promptResolver = null;
function showCustomPrompt(title, defaultValue = '') {
  return new Promise(resolve => {
    promptResolver = resolve;
    document.getElementById('konnectPromptTitle').textContent = title;
    const input = document.getElementById('konnectPromptInput');
    if (input) {
      input.value = defaultValue;
      input.focus();
    }
    const modal = document.getElementById('konnectPromptModal');
    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
    }
  });
}
window.closePromptModal = function(submitted) {
  const modal = document.getElementById('konnectPromptModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
  if (promptResolver) {
    const val = document.getElementById('konnectPromptInput').value;
    promptResolver(submitted ? val : null);
    promptResolver = null;
  }
};

let confirmResolver = null;
function showCustomConfirm(title, message) {
  return new Promise(resolve => {
    confirmResolver = resolve;
    document.getElementById('konnectConfirmTitle').textContent = title;
    document.getElementById('konnectConfirmMessage').textContent = message;
    const modal = document.getElementById('konnectConfirmModal');
    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
    }
  });
}
window.closeConfirmModal = function(confirmed) {
  const modal = document.getElementById('konnectConfirmModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
  if (confirmResolver) {
    confirmResolver(confirmed);
    confirmResolver = null;
  }
};

window.revealTimedMessage = async function(e, msgId, duration) {
  e.stopPropagation();
  const yes = await showCustomConfirm('Timed Message', `This is a timed message and will self-destruct in ${duration}s. Do you want to open it?`);
  if (!yes) return;

  const msg = allMessages.find(m => m.id === msgId);
  if (msg) {
    msg.metadata = msg.metadata || {};
    msg.metadata.read_by_users = msg.metadata.read_by_users || {};
    msg.metadata.read_by_users[state.user.id] = new Date().toISOString();

    try {
      await supabaseClient.from('messages').update({ metadata: msg.metadata }).eq('id', msgId);
      await loadMessages();
    } catch (err) {
      console.error("Failed to update reveal state:", err);
    }
  }
};

window.expireTimedMessage = async function(msgId) {
  // Clear local interval if any
  if (window.__konnectTimedIntervals && window.__konnectTimedIntervals[msgId]) {
    clearInterval(window.__konnectTimedIntervals[msgId]);
    delete window.__konnectTimedIntervals[msgId];
  }

  // Hide element instantly from DOM
  const bubble = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (bubble) bubble.style.display = 'none';

  try {
    const msg = allMessages.find(m => m.id === msgId);
    if (!msg) return;

    if (activeThread.type === 'user') {
      // 1-to-1 chat: recipient expired, delete completely
      await supabaseClient.from('messages').delete().eq('id', msgId);
    } else {
      // Group/team chat: hide for this user
      msg.metadata = msg.metadata || {};
      msg.metadata.deleted_by_users = msg.metadata.deleted_by_users || [];
      if (!msg.metadata.deleted_by_users.includes(state.user.id)) {
        msg.metadata.deleted_by_users.push(state.user.id);
      }

      // Check if all members except sender have read it
      let totalMembers = 0;
      if (activeThread.type === 'group') {
        const { count } = await supabaseClient
          .from('chat_group_members')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', activeThread.id);
        totalMembers = count || 0;
      } else if (activeThread.type === 'team') {
        const { count } = await supabaseClient
          .from('user_teams')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', activeThread.id);
        totalMembers = count || 0;
      }

      const readCount = Object.keys(msg.metadata.read_by_users || {}).length;
      if (totalMembers > 0 && readCount >= (totalMembers - 1)) {
        // Everyone read it, delete completely
        await supabaseClient.from('messages').delete().eq('id', msgId);
      } else {
        // Otherwise, update metadata to hide for current user
        await supabaseClient.from('messages').update({ metadata: msg.metadata }).eq('id', msgId);
      }
    }
  } catch (err) {
    console.error("Failed to expire timed message:", err);
  }
};

async function showReadReceipts(msgId) {
  // Close dropdowns
  document.querySelectorAll('.msg-actions-dropdown').forEach(el => el.style.display = 'none');

  const msg = allMessages.find(m => m.id === msgId);
  if (!msg) return;

  const contentDiv = document.getElementById('konnectInfoContent');
  if (!contentDiv) return;

  contentDiv.innerHTML = '<p style="text-align:center;">Loading read receipts...</p>';
  const modal = document.getElementById('konnectInfoModal');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }

  let listHtml = '';
  try {
    if (activeThread.type === 'user') {
      const isRead = msg.read_at || msg.metadata?.read_by_users?.[activeThread.id];
      const readTime = isRead ? new Date(msg.read_at || msg.metadata?.read_by_users?.[activeThread.id]).toLocaleString() : '';
      listHtml = `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #f3f4f6;">
          <strong style="color:var(--text-main);">${escapeHtml(activeThread.name)}</strong>
          <span>${isRead ? `🟢 Read at ${readTime}` : '🔴 Unread'}</span>
        </div>
      `;
    } else {
      let members = [];
      if (activeThread.type === 'group') {
        const { data } = await supabaseClient
          .from('chat_group_members')
          .select('user_id, users:user_id(name)')
          .eq('group_id', activeThread.id);
        members = data || [];
      } else {
        const { data } = await supabaseClient
          .from('user_teams')
          .select('user_id, users:user_id(name)')
          .eq('team_id', activeThread.id);
        members = data || [];
      }

      const recipients = members.filter(m => m.user_id !== state.user.id);
      listHtml = recipients.map(m => {
        const name = m.users?.name || 'Unknown Member';
        const readAtStr = msg.metadata?.read_by_users?.[m.user_id];
        const readTime = readAtStr ? new Date(readAtStr).toLocaleString() : '';
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #f3f4f6;">
            <strong style="color:var(--text-main);">${escapeHtml(name)}</strong>
            <span>${readAtStr ? `🟢 Read at ${readTime}` : '🔴 Unread'}</span>
          </div>
        `;
      }).join('');

      if (recipients.length === 0) {
        listHtml = '<p style="color:var(--text-secondary); font-style:italic;">No other members in this chat</p>';
      }
    }
  } catch (e) {
    console.error("Failed to load read receipts details:", e);
    listHtml = '<p style="color:var(--danger);">Error loading read receipts details</p>';
  }

  contentDiv.innerHTML = listHtml;
}

function closeInfoModal() {
  const modal = document.getElementById('konnectInfoModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

function backToChatsList() {
  activeThread = null;
  const container = document.getElementById('konnectContainer');
  if (container) {
    container.classList.remove('active-chat');
  }
  const area = document.getElementById('konnectChatArea');
  if (area) {
    area.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:40px; text-align:center; color:var(--text-secondary);">
        <span style="font-size:4em; margin-bottom:16px;">💬</span>
        <h2 style="font-size:1.3em; font-weight:600; margin-bottom:8px; color:var(--text-main);">Welcome to Konnect</h2>
        <p style="font-size:0.9em; max-width:320px; margin:0;">Select a contact, team, or group from the list on the left to start messaging securely.</p>
      </div>
    `;
  }
  renderConversations();
}

function updateChatHeaderAndBulkBar() {
  const headerContainer = document.getElementById('konnectChatHeaderContainer');
  if (!headerContainer || !activeThread) return;
  
  const id = activeThread.id;
  const name = activeThread.name;
  const type = activeThread.type;
  const isPinned = starPins.some(p => p.chat_target_id === id && p.is_pinned);

  if (window.konnectDeleteMode) {
    headerContainer.innerHTML = `
      <!-- Top Bar in Delete Mode -->
      <div style="padding:12px 20px; background:var(--card-bg); border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; z-index:10; color:var(--text);">
        <div style="display:flex; align-items:center; gap:10px;">
          <button id="konnectMobileBackBtn" onclick="window.backToChatsList()" class="secondary" style="display:none; padding:4px 8px; margin:0; font-size:0.85em; border-radius:6px; border:1px solid var(--border); font-weight:600; cursor:pointer;">&larr; Back</button>
          <div>
            <h2 style="margin:0; font-size:1.05em; font-weight:600; color:var(--text);">Select Messages to Delete</h2>
            <span style="font-size:0.75em; color:var(--text-secondary); text-transform:uppercase;">Bulk Delete Mode</span>
          </div>
        </div>
      </div>
      <!-- Bulk Delete Options Bar -->
      <div id="konnectBulkDeleteBar" style="display:flex; align-items:center; justify-content:space-between; padding:8px 20px; background:rgba(239, 68, 68, 0.1); border-bottom:1px solid rgba(239, 68, 68, 0.2); color:var(--text); font-size:0.9em;">
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="selectAllMessagesCheckbox" onchange="window.handleSelectAllMessages(this.checked)" style="cursor:pointer; width:16px; height:16px;">
          <label for="selectAllMessagesCheckbox" style="font-weight:600; cursor:pointer; user-select:none;">Select All</label>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button onclick="window.executeBulkDelete()" class="danger" id="konnectBulkDeleteBtn" style="padding:4px 12px; font-size:0.85em; font-weight:700; margin:0;">Delete Selected (0)</button>
          <button onclick="window.exitDeleteMode()" class="secondary" style="padding:4px 12px; font-size:0.85em; margin:0;">Cancel</button>
        </div>
      </div>
    `;
  } else {
    headerContainer.innerHTML = `
      <!-- Normal Top Bar -->
      <div style="padding:12px 20px; background:var(--card-bg); border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; z-index:10; color:var(--text);">
        <div style="display:flex; align-items:center; gap:10px;">
          <button id="konnectMobileBackBtn" onclick="window.backToChatsList()" class="secondary" style="display:none; padding:4px 8px; margin:0; font-size:0.85em; border-radius:6px; border:1px solid var(--border); font-weight:600; cursor:pointer;">&larr; Back</button>
          <div>
            <h2 style="margin:0; font-size:1.05em; font-weight:600; color:var(--text);">${escapeHtml(name)}</h2>
            <span style="font-size:0.75em; color:var(--text-secondary); text-transform:uppercase;">${type} conversation</span>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button onclick="window.togglePinChat()" class="secondary" style="padding:4px 10px; font-size:0.8em; margin:0;">${isPinned ? '📌 Unpin' : '📌 Pin'}</button>
          <button onclick="window.enterDeleteMode()" class="danger" style="padding:4px 10px; font-size:0.8em; margin:0; background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.2); color:#ef4444;">🗑️ Select Delete</button>
        </div>
      </div>
    `;
  }
}

function enterDeleteMode() {
  window.konnectDeleteMode = true;
  window.selectedMsgIds.clear();
  loadMessages();
  updateChatHeaderAndBulkBar();
}

function exitDeleteMode() {
  window.konnectDeleteMode = false;
  window.selectedMsgIds.clear();
  loadMessages();
  updateChatHeaderAndBulkBar();
}

function handleSelectAllMessages(checked) {
  const checkboxes = document.querySelectorAll('.msg-select-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = checked;
    const msgId = cb.dataset.msgId;
    if (checked) {
      window.selectedMsgIds.add(msgId);
    } else {
      window.selectedMsgIds.delete(msgId);
    }
  });
  updateBulkDeleteBtn();
}

function handleMsgSelectChange(cb) {
  const msgId = cb.dataset.msgId;
  if (cb.checked) {
    window.selectedMsgIds.add(msgId);
  } else {
    window.selectedMsgIds.delete(msgId);
  }
  const selectAll = document.getElementById('selectAllMessagesCheckbox');
  const checkboxes = document.querySelectorAll('.msg-select-checkbox');
  if (selectAll) {
    selectAll.checked = window.selectedMsgIds.size === checkboxes.length && checkboxes.length > 0;
  }
  updateBulkDeleteBtn();
}

function updateBulkDeleteBtn() {
  const btn = document.getElementById('konnectBulkDeleteBtn');
  if (btn) {
    btn.textContent = `Delete Selected (${window.selectedMsgIds.size})`;
  }
}

async function executeBulkDelete() {
  if (window.selectedMsgIds.size === 0) {
    showToast('No messages selected', 'warning');
    return;
  }
  
  const confirmed = await showConfirm(`Are you sure you want to delete these ${window.selectedMsgIds.size} messages for yourself?`);
  if (!confirmed) return;
  
  try {
    const msgIds = Array.from(window.selectedMsgIds);
    for (const id of msgIds) {
      saveLocalDeletedMessageId(id);
      const msg = allMessages.find(m => m.id === id);
      if (msg) {
        const metadata = msg.metadata || {};
        const deletedForMe = metadata.deleted_by_users || [];
        if (!deletedForMe.includes(state.user.id)) {
          deletedForMe.push(state.user.id);
        }
        metadata.deleted_by_users = deletedForMe;
        await supabaseClient.from('messages').update({ metadata }).eq('id', id);
      }
    }
    
    showToast(`${msgIds.length} messages deleted`, 'success');
    window.exitDeleteMode();
  } catch (err) {
    console.error(err);
    showToast(`${window.selectedMsgIds.size} messages deleted`, 'success');
    window.exitDeleteMode();
  }
}
