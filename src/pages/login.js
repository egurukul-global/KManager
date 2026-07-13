// ==================== LOGIN PAGE ====================
import { supabaseClient } from '../db.js';
import { showPrompt, showToast } from '../components/toasts.js';

export function getLoginPage() {
  return `
    <div class="login-container">
      <div class="login-card">
        <div class="logo">🔱</div>
        <h1>One Kailasa</h1>
        <p class="subtitle">Sign in to One Kailasa</p>

        <div id="loginError" class="error-msg"></div>
        <div id="loginInfo" class="login-info-msg" style="display:none;"></div>

        <form id="loginForm" onsubmit="window.handleLogin(event)">
          <div class="form-group">
            <label for="loginEmail">Email</label>
            <input type="email" id="loginEmail" placeholder="you@example.com" required 
              autocomplete="email">
          </div>
          <div class="form-group">
            <label for="loginPassword">Password</label>
            <input type="password" id="loginPassword" placeholder="Enter your password" required 
              autocomplete="current-password">
          </div>
          <button type="submit" class="login-btn" id="loginBtn">
            Sign In
          </button>
        </form>

        <p class="login-forgot">
          <button type="button" class="link-btn" id="forgotPasswordBtn" onclick="window.handleForgotPassword()">
            Forgot password?
          </button>
        </p>
        <p class="login-signup-note">
          Need an account? Ask a One Kailasa administrator to create one.
        </p>
      </div>
    </div>
  `;
}

export function initLoginPage() {
  window.handleForgotPassword = handleForgotPassword;

  const emailField = document.getElementById('loginEmail');
  const passwordField = document.getElementById('loginPassword');
  if (passwordField && emailField?.value) {
    setTimeout(() => passwordField.focus(), 100);
  } else if (emailField) {
    setTimeout(() => emailField.focus(), 100);
  }
}

async function handleForgotPassword() {
  let email = document.getElementById('loginEmail')?.value?.trim() || '';
  if (!email) {
    email = await showPrompt('Enter your account email for a password reset link.', {
      title: 'Forgot password',
      label: 'Email',
      placeholder: 'you@example.com',
      inputType: 'email',
      okLabel: 'Send reset link'
    }) || '';
  }

  if (!email) return;

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) throw error;

    if (document.getElementById('loginEmail') && !document.getElementById('loginEmail').value) {
      document.getElementById('loginEmail').value = email;
    }

    await showToast(`If an account exists for ${email}, a reset link has been sent.`, 'success');
  } catch (err) {
    await showToast(err.message || 'Could not send reset email.', 'error');
  }
}
