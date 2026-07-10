// ==================== TOAST & ALERT NOTIFICATIONS ====================

let activeAlert = null;

/** Centered modal — user must click OK (errors, warnings, and important notices) */
export function showAlert(message, type = 'info') {
  if (activeAlert) activeAlert.remove();

  const icons = { error: '❌', warning: '⚠️', info: 'ℹ️', success: '✅' };
  const titles = { error: 'Error', warning: 'Warning', info: 'Notice', success: 'Success' };

  const modal = document.createElement('div');
  modal.className = 'modal active alert-modal';
  modal.innerHTML = `
    <div class="modal-content small alert-modal-content">
      <h3 class="alert-modal-title">${icons[type] || 'ℹ️'} ${titles[type] || 'Notice'}</h3>
      <div class="alert-modal-body">${message}</div>
      <div class="btn-group alert-modal-actions">
        <button type="button" class="primary" id="alertOkBtn">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  activeAlert = modal;

  return new Promise(resolve => {
    const close = () => {
      modal.remove();
      if (activeAlert === modal) activeAlert = null;
      resolve();
    };
    modal.querySelector('#alertOkBtn').onclick = close;
    modal.onclick = e => { if (e.target === modal) close(); };
  });
}

export function showToast(message, type = 'info') {
  if (type === 'error' || type === 'warning') {
    return showAlert(message, type);
  }

  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

export function showConfirm(message, onConfirm, onCancel) {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content small">
      <h3 class="alert-modal-title">⚠️ Confirm</h3>
      <div class="alert-modal-body">${message}</div>
      <div class="btn-group">
        <button type="button" class="danger" id="confirmBtn">Yes, Proceed</button>
        <button type="button" class="secondary" id="cancelBtn">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = (cb) => {
    modal.remove();
    if (cb) cb();
  };

  modal.querySelector('#confirmBtn').onclick = () => close(onConfirm);
  modal.querySelector('#cancelBtn').onclick = () => close(onCancel);
  modal.onclick = e => {
    if (e.target === modal) close(onCancel);
  };
}
