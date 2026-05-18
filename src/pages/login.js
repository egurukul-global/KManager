// ==================== LOGIN PAGE ====================

export function getLoginPage() {
  return `
    <div class="login-container">
      <div class="login-card">
        <div class="logo">🔱</div>
        <h1>Kailasa Manager</h1>
        <p class="subtitle">Sign in to manage your team's finances</p>

        <div id="loginError" class="error-msg"></div>

        <form id="loginForm" onsubmit="window.handleLogin(event)">
          <div class="form-group">
            <label for="loginEmail">Email</label>
            <input type="email" id="loginEmail" placeholder="you@example.com" required 
              value="rishi.advait.one@gmail.com" autocomplete="email">
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
      </div>
    </div>
  `;
}

export function initLoginPage() {
  // Focus on password field since email is pre-filled
  const passwordField = document.getElementById('loginPassword');
  if (passwordField) {
    setTimeout(() => passwordField.focus(), 100);
  }
}
