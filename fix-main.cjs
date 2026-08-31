const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

const missingCode = `
['mousemove', 'mousedown', 'keydown', 'scroll', 'click', 'touchstart'].forEach(event => {
  window.addEventListener(event, resetInactivityTimer, { passive: true });
});

export async function handleLogout() {
  if (window.isLoggingOut) return;
  window.isLoggingOut = true;

  const ok = await window.showConfirm('Sign out of One Kailasa?');
  if (!ok) {
    window.isLoggingOut = false;
    return;
  }

  clearTimeout(window.inactivityTimeout);

  try {
    await window.secureLogout();
    const { clearApprovalAccessCache } = await import('./utils/approvalAccess.js');
    clearApprovalAccessCache();
  } catch (err) {
    console.error('Logout error:', err);
  }

  state.user = null;
  state.teams = [];
  state.currentTeam = null;
  state.session = null;
  
  window.renderLoginScreen();
  window.history.pushState({}, '', '/');
  
  setTimeout(() => { window.isLoggingOut = false; }, 500);
}
window.handleLogout = handleLogout;

async function checkExistingSession() {
  const result = await window.secureVerify();
  if (result.authenticated && result.user) {
    state.session = { user: result.user, offline: result.offline };

    const saved = localStorage.getItem('ok-last-activity-time');
    if (saved) {
      const lastActivity = parseInt(saved, 10);
      if (Date.now() - lastActivity > window.INACTIVITY_LIMIT) {
        await window.forceLogout();
        return;
      }
    }
`;

// Replace lines 184 to 192 (which is the broken part of checkExistingSession)
const brokenPartRegex = /      if \(sessionStorage\.getItem\('ok-session-locked'\) === 'true'\) \{[\s\S]*?email \? emailEl\.innerText = state\.session\.user\?\.email \|\| '' : null;\s*\}/;

const lines = code.split('\n');
// Let's just do a clean splice
lines.splice(183, 10, missingCode);

fs.writeFileSync('src/main.js', lines.join('\n'), 'utf8');
