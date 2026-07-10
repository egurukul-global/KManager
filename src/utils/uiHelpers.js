/** Truncate display text to max characters */
export function truncLabel(text, max = 15) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/** Green box — edit */
export function btnIconEdit(onclick, title = 'Edit') {
  return `<button type="button" class="btn-icon btn-icon--edit" onclick="${onclick}" title="${title}" aria-label="${title}">✓</button>`;
}

/** Red box — delete */
export function btnIconDelete(onclick, title = 'Delete') {
  return `<button type="button" class="btn-icon btn-icon--delete" onclick="${onclick}" title="${title}" aria-label="${title}">✕</button>`;
}

/** Standard card row: label left, value right */
export function cardRow(label, value, valueClass = '') {
  return `
    <div class="data-card-row">
      <span class="data-card-row-label">${label}</span>
      <span class="data-card-row-value ${valueClass}">${value}</span>
    </div>`;
}

/** Pair of edit + delete icon buttons */
export function actionPair(editOnclick, deleteOnclick) {
  return `<span class="action-icon-group">${btnIconEdit(editOnclick)}${btnIconDelete(deleteOnclick)}</span>`;
}
