// ==================== TOAST NOTIFICATIONS ====================

export function showToast(message, type = 'info') {
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
      <h3 style="margin-bottom: 20px;">⚠️ Confirm</h3>
      <p style="margin-bottom: 25px; line-height: 1.6;">${message}</p>
      <div class="btn-group">
        <button class="danger" id="confirmBtn">Yes, Proceed</button>
        <button class="secondary" id="cancelBtn">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#confirmBtn').onclick = () => {
    modal.remove();
    if (onConfirm) onConfirm();
  };
  modal.querySelector('#cancelBtn').onclick = () => {
    modal.remove();
    if (onCancel) onCancel();
  };
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.remove();
      if (onCancel) onCancel();
    }
  };
}
