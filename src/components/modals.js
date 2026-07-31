// ==================== MODAL HELPERS ====================

export function createModal(id, content, options = {}) {
  const existing = document.getElementById(id);
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = id;
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content" style="${options.maxWidth ? `max-width: ${options.maxWidth};` : ''}">
      ${options.hideCloseButton ? '' : `<button class="close-modal" onclick="document.getElementById('${id}').classList.remove('active')">&times;</button>`}
      ${content}
    </div>
  `;
  document.body.appendChild(modal);

  // Close on outside click
  // modal.addEventListener('click', (e) => {
  //   if (e.target === modal) {
  //     modal.classList.remove('active');
  //   }
  // });

  return modal;
}

export function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

export function removeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.remove();
}
