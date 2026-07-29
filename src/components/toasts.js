// ==================== TOAST & ALERT NOTIFICATIONS ====================
// All user-facing messages use a centered modal that requires OK / Yes / Cancel.
// No auto-dismiss side toasts. No browser alert/confirm/prompt.

let activeAlert = null;

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Allow intentional HTML from callers that already escaped user content. */
function bodyHtml(message, { allowHtml = false } = {}) {
  if (allowHtml) return String(message ?? '');
  // Support simple line breaks from plain strings
  return escapeHtml(message).replace(/\n/g, '<br>');
}

function removeActiveAlert() {
  if (activeAlert) {
    activeAlert.remove();
    activeAlert = null;
  }
}

/** Centered modal — user must click OK */
export function showAlert(message, type = 'info', options = {}) {
  removeActiveAlert();

  const icons = { error: '❌', warning: '⚠️', info: 'ℹ️', success: '✅' };
  const titles = { error: 'Error', warning: 'Warning', info: 'Notice', success: 'Success' };

  const modal = document.createElement('div');
  modal.className = 'modal active alert-modal';
  modal.innerHTML = `
    <div class="modal-content small alert-modal-content">
      <h3 class="alert-modal-title">${icons[type] || 'ℹ️'} ${titles[type] || 'Notice'}</h3>
      <div class="alert-modal-body">${bodyHtml(message, options)}</div>
      <div class="btn-group alert-modal-actions">
        <button type="button" class="primary" id="alertOkBtn">OK</button>
      </div>
    </div>
  `;
  const container = document.getElementById('okShellThemeWrapper') || document.body;
  container.appendChild(modal);
  activeAlert = modal;

  return new Promise(resolve => {
    const close = () => {
      modal.remove();
      if (activeAlert === modal) activeAlert = null;
      resolve();
    };
    modal.querySelector('#alertOkBtn').onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    modal.onclick = e => { if (e.target === modal) close(); };
    setTimeout(() => modal.querySelector('#alertOkBtn')?.focus(), 0);
  });
}

/**
 * All toast types now use the OK modal (no side toast / auto-hide).
 * Pass { allowHtml: true } only when the message is already safe HTML.
 */
export function showToast(message, type = 'info', options = {}) {
  return showAlert(message, type, options);
}

/** Yes / Cancel confirm. Returns Promise&lt;boolean&gt;. Callbacks still supported. */
export function showConfirm(message, onConfirm, onCancel) {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content alert-modal-content">
      <h3 class="alert-modal-title">⚠️ Confirm</h3>
      <div class="alert-modal-body" style="text-align: center; margin-bottom: 20px;">${message}</div>
      <div class="btn-group" style="justify-content: center; gap: 10px;">
        <button type="button" class="danger" id="confirmBtn">Yes, Proceed</button>
        <button type="button" class="secondary" id="cancelBtn">Cancel</button>
      </div>
    </div>
  `;
  const container = document.getElementById('okShellThemeWrapper') || document.body;
  container.appendChild(modal);

  return new Promise(resolve => {
    const close = (ok, cb) => {
      modal.remove();
      setTimeout(() => {
        if (cb) cb();
        resolve(ok);
      }, 0);
    };

    modal.querySelector('#confirmBtn').onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      close(true, onConfirm);
    };
    modal.querySelector('#cancelBtn').onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      close(false, onCancel);
    };
    modal.onclick = e => {
      if (e.target === modal) close(false, onCancel);
    };
  });
}

/**
 * In-app text prompt (replaces window.prompt).
 * Resolves to trimmed string, or null if cancelled / empty when required.
 * Pass multiline: true for a response/textarea box.
 */
export function showPrompt(message, options = {}) {
  const {
    title = 'Input required',
    label = '',
    defaultValue = '',
    placeholder = '',
    inputType = 'text',
    required = true,
    okLabel = 'OK',
    multiline = false,
    rows = 4
  } = options;

  removeActiveAlert();

  const field = multiline
    ? `<textarea id="appPromptInput" rows="${Number(rows) || 4}"
          placeholder="${escapeHtml(placeholder)}"
          style="width:100%;resize:vertical;min-height:96px;">${escapeHtml(defaultValue)}</textarea>`
    : `<input type="${escapeHtml(inputType)}" id="appPromptInput"
          value="${escapeHtml(defaultValue)}"
          placeholder="${escapeHtml(placeholder)}"
          autocomplete="off">`;

  const modal = document.createElement('div');
  modal.className = 'modal active alert-modal';
  modal.innerHTML = `
    <div class="modal-content small alert-modal-content">
      <h3 class="alert-modal-title">✏️ ${escapeHtml(title)}</h3>
      <div class="alert-modal-body">${bodyHtml(message)}</div>
      <div class="form-group" style="margin-top:12px;text-align:left;">
        ${label ? `<label for="appPromptInput">${escapeHtml(label)}</label>` : ''}
        ${field}
      </div>
      <div class="btn-group alert-modal-actions">
        <button type="button" class="primary" id="promptOkBtn">${escapeHtml(okLabel)}</button>
        <button type="button" class="secondary" id="promptCancelBtn">Cancel</button>
      </div>
    </div>
  `;
  const container = document.getElementById('okShellThemeWrapper') || document.body;
  container.appendChild(modal);
  activeAlert = modal;

  const input = modal.querySelector('#appPromptInput');

  return new Promise(resolve => {
    const close = (value) => {
      modal.remove();
      if (activeAlert === modal) activeAlert = null;
      resolve(value);
    };

    modal.querySelector('#promptOkBtn').onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const value = (input?.value || '').trim();
      if (required && !value) {
        input?.focus();
        return;
      }
      close(value || null);
    };
    modal.querySelector('#promptCancelBtn').onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      close(null);
    };
    modal.onclick = e => {
      if (e.target === modal) close(null);
    };
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !multiline) {
        e.preventDefault();
        modal.querySelector('#promptOkBtn')?.click();
      }
    });
    setTimeout(() => {
      input?.focus();
      if (!multiline && typeof input?.select === 'function') input.select();
    }, 0);
  });
}
