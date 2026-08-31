const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

// 1. Fix handleUnlockSession
const oldUnlock = `async function handleUnlockSession(e) {
  e.preventDefault();
  const pwd = document.getElementById('lockPassword').value;
  const btn = document.getElementById('unlockBtn');
  const errDiv = document.getElementById('lockError');
  if (!state.session?.user?.email) return;

  btn.disabled = true;
  btn.innerText = 'Unlocking...';
  errDiv.style.display = 'none';

  try {
    const data = await secureLogin(state.session.user.email, pwd);
    state.session = { user: data.user, expires_at: data.expires_at };
    
    state.isLocked = false;
    sessionStorage.removeItem('ok-session-locked');
    const lock = document.getElementById('lockScreen');
    if (lock) lock.style.display = 'none';
    document.getElementById('lockPassword').value = '';
    resetInactivityTimer();
    showToast('Session unlocked', 'success');
  } catch (err) {`;

const newUnlock = `async function handleUnlockSession(e) {
  e.preventDefault();
  const pwd = document.getElementById('lockPassword').value;
  const btn = document.getElementById('unlockBtn');
  const errDiv = document.getElementById('lockError');
  
  const email = state.session?.user?.email || document.getElementById('lockUserEmail').innerText;
  if (!email) {
    const lock = document.getElementById('lockScreen');
    if (lock) lock.style.display = 'none';
    renderLoginScreen();
    return;
  }

  btn.disabled = true;
  btn.innerText = 'Unlocking...';
  errDiv.style.display = 'none';

  try {
    const data = await secureLogin(email, pwd);
    state.session = { user: data.user, expires_at: data.expires_at };
    
    state.isLocked = false;
    sessionStorage.removeItem('ok-session-locked');
    const lock = document.getElementById('lockScreen');
    if (lock) lock.style.display = 'none';
    document.getElementById('lockPassword').value = '';
    resetInactivityTimer();
    showToast('Session unlocked', 'success');
    
    // If the session was completely lost, reinitialize
    if (!state.user) {
      initializeApp();
    }
  } catch (err) {`;

code = code.replace(oldUnlock, newUnlock);

// 2. Fix initializeApp TypeError
const oldFallback = `      if (fallback.error) {
        state.user = {
          id: state.session.user.id,
          email: state.session.user.email,
          name: state.session.user.user_metadata?.name || state.session.user.email.split('@')[0],
          role: 'user',
          team_id: null,
          gender: null,
          on_hold: false,
          notification_mode: 'summary'
        };`;

const newFallback = `      if (fallback.error) {
        if (!state.session || !state.session.user) return; // Prevent TypeError if session was nuked by 401
        state.user = {
          id: state.session.user.id,
          email: state.session.user.email,
          name: state.session.user.user_metadata?.name || state.session.user.email.split('@')[0],
          role: 'user',
          team_id: null,
          gender: null,
          on_hold: false,
          notification_mode: 'summary'
        };`;

code = code.replace(oldFallback, newFallback);

fs.writeFileSync('src/main.js', code, 'utf8');
console.log('Fixed unlock session and initializeApp error');
