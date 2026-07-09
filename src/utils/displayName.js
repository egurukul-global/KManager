const DISPLAY_NAME_MAX = 10;

export function getDisplayName(user) {
  if (!user?.id) return 'User';
  const key = `km_display_name_${user.id}`;
  const saved = localStorage.getItem(key);
  if (saved) return saved.slice(0, DISPLAY_NAME_MAX);
  const first = (user.name || user.email?.split('@')[0] || 'User').split(/\s+/)[0];
  return first.slice(0, DISPLAY_NAME_MAX);
}

export function setDisplayName(userId, name) {
  if (!userId) return;
  localStorage.setItem(`km_display_name_${userId}`, String(name || '').slice(0, DISPLAY_NAME_MAX));
}
