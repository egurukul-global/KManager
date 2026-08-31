const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

// 1. Update resetInactivityTimer
const oldTimer = `function resetInactivityTimer() {
  if (state.isLocked || !state.session) return;

  const saved = localStorage.getItem('ok-last-activity-time');
  const lastActivityTime = saved ? parseInt(saved, 10) : Date.now();

  if (Date.now() - lastActivityTime > INACTIVITY_LIMIT) {
    lockSession();
    return;
  }

  localStorage.setItem('ok-last-activity-time', Date.now().toString());
  clearTimeout(inactivityTimeout);
  inactivityTimeout = setTimeout(lockSession, INACTIVITY_LIMIT);
}`;

const newTimer = `function resetInactivityTimer() {
  if (!state.session) return;

  const saved = localStorage.getItem('ok-last-activity-time');
  const lastActivityTime = saved ? parseInt(saved, 10) : Date.now();

  if (Date.now() - lastActivityTime > INACTIVITY_LIMIT) {
    forceLogout();
    return;
  }

  localStorage.setItem('ok-last-activity-time', Date.now().toString());
  clearTimeout(inactivityTimeout);
  inactivityTimeout = setTimeout(forceLogout, INACTIVITY_LIMIT);
}`;

code = code.replace(oldTimer, newTimer);

// 2. Remove lock screen DOM and handler functions
code = code.replace(/function lockSession\(\) \{[\s\S]*?async function handleForceLogoutFromLock\(\) \{[\s\S]*?\}\n/m, '');

// 3. Remove lock check in checkExistingSession
const oldCheck = `      if (Date.now() - lastActivity > INACTIVITY_LIMIT) {
        sessionStorage.setItem('ok-session-locked', 'true');
      }

      if (sessionStorage.getItem('ok-session-locked') === 'true') {
      state.isLocked = true;
      initLockScreenDOM();
      const lockEl = document.getElementById('lockScreen');
      if (lockEl) lockEl.style.display = 'flex';
      const emailEl = document.getElementById('lockUserEmail');
      if (emailEl) emailEl.innerText = state.session.user?.email || '';
    }`;
const newCheck = `      if (Date.now() - lastActivity > INACTIVITY_LIMIT) {
        await forceLogout();
        return;
      }`;
code = code.replace(oldCheck, newCheck);

// 4. Clean up any remaining references
code = code.replace("window.handleUnlock = handleUnlock;", "");
code = code.replace("window.handleForceLogoutFromLock = handleForceLogoutFromLock;", "");
code = code.replace("state.isLocked = false;", "");

fs.writeFileSync('src/main.js', code, 'utf8');
console.log('Removed lock session logic');
