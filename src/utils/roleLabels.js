// ==================== ROLE DISPLAY LABELS (Phase 4A — DB values unchanged until 5B) ====================

const TEAM_ACCESS_LABELS = {
  view: 'VIEW',
  member: 'OPS',
  oht: 'OPH',
  lead: 'OPL',
  admin: 'Team Admin'
};

const ORG_ROLE_LABELS = {
  admin: 'SYS',
  caoh: 'CAO',
  oh: 'FIH',
  ceo: 'CEO',
  user: 'User'
};

export function teamAccessLabel(accessLevel) {
  const key = String(accessLevel || 'member').toLowerCase().trim();
  return TEAM_ACCESS_LABELS[key] || key.toUpperCase();
}

export function orgRoleLabel(role) {
  const key = String(role || 'user').toLowerCase().trim();
  return ORG_ROLE_LABELS[key] || key.toUpperCase();
}

export function isOpsStaff(accessLevel) {
  return String(accessLevel || '').toLowerCase().trim() === 'member';
}

export function isOplOrAbove(accessLevel) {
  const level = String(accessLevel || '').toLowerCase().trim();
  return level === 'lead' || level === 'admin';
}
