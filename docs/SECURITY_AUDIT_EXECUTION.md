# Security Audit Execution Plan - Step by Step

**Purpose**: Systematic process to audit your existing web app codebase and identify security issues before production deployment.

**Timeline**: 2-7 days depending on codebase size  
**Effort**: Medium-High complexity  
**Output**: Detailed vulnerability report + fixes

---

## Phase 1: Setup & Tools Installation (30 minutes)

### 1.1 Install Security Scanning Tools

```bash
# Navigate to your project root
cd /path/to/your/project

# Core dependency audit
npm audit
npm outdated

# Install security linters
npm install --save-dev eslint eslint-plugin-security snyk

# Install code quality tools
npm install --save-dev sonarqube-scanner

# Install OWASP ZAP for dynamic testing (optional but recommended)
# Download from https://www.zaproxy.org/

# For Python backends (if applicable)
pip install safety bandit
```

### 1.2 Create Audit Output Directory

```bash
mkdir -p .security-audit
mkdir -p .security-audit/reports
mkdir -p .security-audit/findings
```

---

## Phase 2: Automated Scanning (1-2 hours)

### 2.1 Dependency Vulnerability Scan

```bash
# Full audit report with detailed output
npm audit --audit-level=moderate > .security-audit/reports/npm-audit.txt

# Fix automatically fixable vulnerabilities
npm audit fix --force

# List still-vulnerable packages
npm audit --json > .security-audit/reports/npm-audit-detailed.json

# Check for outdated packages
npm outdated > .security-audit/reports/npm-outdated.txt

# Use Snyk for additional scanning (requires free account)
snyk auth
snyk test --json > .security-audit/reports/snyk-report.json
```

**Action Items**:
- [ ] Review npm-audit.txt - note any CRITICAL vulnerabilities
- [ ] For unfixable vulnerabilities, create GitHub issues with update requests
- [ ] Verify all patches applied correctly with testing
- [ ] Document any accepted risks

### 2.2 Static Code Analysis - JavaScript/Node.js

```bash
# Run ESLint with security plugin
npx eslint . --format json > .security-audit/reports/eslint-security.json

# Manual review of critical findings
npx eslint . --format unix | grep -i "security\|xss\|injection" | tee .security-audit/findings/eslint-issues.txt
```

**Look for**:
- ❌ `eval()` usage
- ❌ `child_process.exec()` with user input
- ❌ `dangerouslySetInnerHTML` in React
- ❌ Hardcoded passwords/secrets
- ❌ `innerHTML` assignments

### 2.3 Secret Scanning

```bash
# Install and run secret scanner
npm install --save-dev git-secrets

# Check git history for secrets
git secrets --scan
git secrets --scan-history

# Scan current codebase for obvious secrets
grep -r "password\|secret\|api.key\|token\|credential" \
  --include="*.js" --include="*.jsx" --include="*.json" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  . | tee .security-audit/findings/hardcoded-secrets.txt

# Check for .env files in git
git log --all --full-history -- .env .env.* | head -20
```

**Action Items**:
- [ ] If secrets found in git history, use `git-filter-repo` to remove
- [ ] Rotate any exposed credentials immediately
- [ ] Create/update `.gitignore` to exclude `.env*` files
- [ ] Implement pre-commit hooks to prevent secret commits

### 2.4 Dependency Check (Supply Chain Security)

```bash
# Check for known vulnerable dependencies
npm install -g snyk
snyk test --severity-threshold=high

# Check for outdated transitive dependencies
npm list --depth=10 > .security-audit/reports/full-dependency-tree.txt

# Identify licenses
npm list --depth=10 --long --json > .security-audit/reports/licenses.json
```

---

## Phase 3: Code Review - Security Focus (3-5 hours)

### 3.1 Authentication & Session Management Review

**Files to Review**:
- `src/auth/` or `routes/auth.js`
- `middleware/auth.js` or similar
- `config/passport.js` (if using Passport.js)

**Checklist**:
```javascript
// ❌ BAD PATTERNS - Look for these

// 1. Weak password hashing
const hash = crypto.createHash('md5').update(password).digest('hex');
const hash = crypto.createHash('sha1').update(password).digest('hex');
// FIX: Use bcrypt or argon2

// 2. No password reset token expiration
const resetToken = crypto.randomBytes(32).toString('hex');
// Store in DB without expiration
// FIX: Add expiresAt: Date.now() + 15*60*1000

// 3. Weak session timeout
res.cookie('session', token, { maxAge: 30*24*60*60*1000 }); // 30 days!
// FIX: Use 1 hour for sensitive apps

// 4. Storing secrets in JWT
const token = jwt.sign({
  userId: user.id,
  password: user.password, // ❌ NEVER
  apiKey: apiKey // ❌ NEVER
}, secret);

// 5. Predictable tokens
const token = Date.now().toString();
const token = user.id + 'secret';
// FIX: Use crypto.randomBytes()

// 6. No brute force protection
app.post('/login', (req, res) => {
  // Any attacker can try 1000s of passwords
});
// FIX: Add rate limiting + account lockout

// 7. No CSRF protection
app.post('/change-password', (req, res) => {
  // Missing CSRF validation
});
// FIX: Implement CSRF middleware

// ✅ GOOD PATTERNS - Look for these

// 1. Password hashing with bcrypt
const bcrypt = require('bcrypt');
const hash = await bcrypt.hash(password, 12);

// 2. Reset token with expiration
const resetToken = crypto.randomBytes(32).toString('hex');
await db.users.updateOne(
  { id: user.id },
  {
    resetToken: crypto.createHash('sha256').update(resetToken).digest('hex'),
    resetTokenExpires: Date.now() + 15 * 60 * 1000 // 15 minutes
  }
);

// 3. Secure session cookie
res.cookie('sessionId', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'Strict',
  maxAge: 3600000 // 1 hour
});

// 4. MFA implementation check
if (user.mfaEnabled) {
  // Verify TOTP token
  const speakeasy = require('speakeasy');
  const verified = speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: 'base32',
    token: req.body.mfaToken
  });
}

// 5. Brute force protection
const failedAttempts = await redis.incr(`login_attempts:${email}`);
if (failedAttempts > 5) {
  await redis.expire(`login_attempts:${email}`, 15*60);
  throw new Error('Too many login attempts');
}

// 6. CSRF protection in forms
<form action="/change-password" method="POST">
  <input type="hidden" name="_csrf" value="<%= csrfToken %>">
  ...
</form>
```

**Output**: Create `.security-audit/findings/auth-review.md` documenting findings

### 3.2 Authorization & Access Control Review

**Files to Review**:
- `middleware/permissions.js` or `middleware/authorize.js`
- All API route definitions
- Database models/schemas

**Checklist**:
```javascript
// ❌ DANGEROUS PATTERNS - Test these immediately

// 1. Trusting user input for resource access (IDOR)
app.get('/api/users/:userId', (req, res) => {
  const user = db.users.findById(req.params.userId);
  res.json(user);
});
// Attack: /api/users/999 (access someone else's data)
// FIX: Always verify req.user.id === req.params.userId

// 2. No role checking
app.post('/api/admin/users/:userId/delete', (req, res) => {
  db.users.deleteById(req.params.userId);
});
// Attack: Non-admin calls this endpoint
// FIX: Add middleware that checks req.user.role === 'admin'

// 3. Privilege escalation
app.post('/api/profile', (req, res) => {
  const user = { ...req.body };
  db.users.update(user); // User can set role: 'admin'!
});

// 4. Direct object reference without permission check
app.get('/api/projects/:projectId', (req, res) => {
  const project = db.projects.findById(req.params.projectId);
  res.json(project); // User can access any project
});

// 5. No file access restrictions
app.get('/uploads/:filename', (req, res) => {
  res.sendFile(`./uploads/${req.params.filename}`);
});
// Attack: /uploads/../../.env accesses .env file
// FIX: Validate filename, store uploads outside web root

// ✅ GOOD PATTERNS

// 1. Authorization middleware
const authorize = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user || req.user.role !== requiredRole) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    next();
  };
};

app.delete('/api/users/:userId', authorize('admin'), (req, res) => {
  // Only admins can access
});

// 2. IDOR check
app.get('/api/profile/:userId', (req, res) => {
  // User can only access own profile
  if (req.user.id !== req.params.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const user = db.users.findById(req.params.userId);
  res.json(user);
});

// 3. Safe file access
const path = require('path');
app.get('/uploads/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filepath = path.join('./uploads', filename);
  
  // Prevent directory traversal
  if (!filepath.startsWith(path.resolve('./uploads'))) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  
  res.sendFile(filepath);
});
```

**Test Cases** - Create `.security-audit/findings/idor-test-cases.txt`:
```
Test these immediately:
1. Get user 1's data, then try to access user 2's data
   GET /api/users/1
   GET /api/users/2 (should fail)

2. Try accessing admin endpoints as regular user
   POST /api/admin/users/1/delete (should fail)

3. Try directory traversal
   GET /uploads/../../.env (should fail)
   GET /uploads/../../../../etc/passwd (should fail)

4. Try modifying own role
   PUT /api/profile with {"role": "admin"} (should fail)

5. Try accessing others' private data
   GET /api/projects/2/details where user only owns project 1
```

### 3.3 Input Validation Review

**Files to Review**:
- All route handlers
- Form validation logic
- API input handling

**Checklist**:
```javascript
// ❌ PATTERNS THAT ALLOW INJECTION ATTACKS

// 1. SQL Injection - String concatenation
app.get('/search', (req, res) => {
  const query = `SELECT * FROM products WHERE name LIKE '%${req.query.q}%'`;
  db.query(query);
});

// 2. NoSQL Injection
app.post('/login', async (req, res) => {
  const user = await db.users.findOne({ email: req.body.email });
  // Attack: {"email": {"$ne": null}} bypasses auth
});

// 3. Command injection
const { execSync } = require('child_process');
app.post('/process-file', (req, res) => {
  execSync(`convert ${req.body.filename} output.pdf`);
  // Attack: filename = "; rm -rf /" 
});

// 4. No type validation
app.post('/create-user', (req, res) => {
  db.users.create({
    name: req.body.name,          // Could be object
    age: req.body.age,            // Could be string
    email: req.body.email,        // Could be array
    isAdmin: req.body.isAdmin     // Should never come from user!
  });
});

// 5. No length validation
app.post('/create-post', (req, res) => {
  db.posts.create({
    title: req.body.title,  // Could be 1MB of data
    content: req.body.content // Unbounded
  });
});

// ✅ GOOD PATTERNS

// 1. Parameterized queries (SQL)
app.get('/search', async (req, res) => {
  const query = 'SELECT * FROM products WHERE name LIKE ?';
  const results = await db.query(query, [`%${req.query.q}%`]);
});

// 2. Input validation with joi/yup
const joiSchema = joi.object({
  email: joi.string().email().required(),
  password: joi.string().min(12).required(),
  age: joi.number().integer().min(0).max(150)
});

const { value, error } = joiSchema.validate(req.body);
if (error) {
  return res.status(400).json({ error: error.details });
}

// 3. Whitelist validation
const allowedSortFields = ['name', 'date', 'price'];
const sortBy = req.query.sort || 'date';
if (!allowedSortFields.includes(sortBy)) {
  return res.status(400).json({ error: 'Invalid sort field' });
}

// 4. Type checking
app.post('/create-user', (req, res) => {
  if (typeof req.body.name !== 'string') {
    return res.status(400).json({ error: 'Name must be string' });
  }
  if (typeof req.body.age !== 'number') {
    return res.status(400).json({ error: 'Age must be number' });
  }
  // isAdmin never comes from user input
  const newUser = {
    name: req.body.name,
    age: req.body.age,
    isAdmin: false // Set server-side
  };
});

// 5. Length validation
app.post('/create-post', (req, res) => {
  const schema = joi.object({
    title: joi.string().max(200).required(),
    content: joi.string().max(50000).required()
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error });
});
```

**Output**: Document all input fields in `.security-audit/findings/input-validation-audit.txt`

### 3.4 Data Protection Review

**Files to Review**:
- `.env` template and actual environment handling
- Database schema/models
- Logging configuration
- API response handling

**Checklist**:
```javascript
// ❌ PATTERNS EXPOSING SENSITIVE DATA

// 1. Database credentials in code
const mongoose = require('mongoose');
mongoose.connect('mongodb://admin:password123@localhost:27017/mydb');

// 2. API keys in code
const apiKey = 'sk_live_51234567890abcdef';
const response = await fetch('https://api.stripe.com', {
  headers: { 'Authorization': `Bearer ${apiKey}` }
});

// 3. Logging sensitive data
logger.info('User login', {
  email: user.email,
  password: user.password,      // ❌ NEVER log
  ssn: user.ssn,                // ❌ NEVER log
  creditCard: user.creditCard   // ❌ NEVER log
});

// 4. Exposing PII in API responses
app.get('/api/users/:userId', (req, res) => {
  const user = db.users.findById(req.params.userId);
  res.json(user); // Returns password hash, ssn, etc.
});

// 5. No HTTPS enforcement
// Application works over HTTP in production

// 6. No database encryption
// Database running without encryption at rest
sqlite3 mydb.db // SQLite with no encryption

// 7. Storing passwords as plain text
db.users.create({ email, password: userPassword }); // Never hash

// ✅ GOOD PATTERNS

// 1. Environment variables
const dbUrl = process.env.DATABASE_URL;
const apiKey = process.env.STRIPE_API_KEY;

// 2. Secure logging
logger.info('User login', {
  email: user.email,
  userId: user.id,
  timestamp: new Date(),
  ipAddress: req.ip
  // No passwords, SSNs, credit cards, etc.
});

// 3. Sanitized API responses
app.get('/api/users/:userId', (req, res) => {
  const user = db.users.findById(req.params.userId);
  const safeUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    // Exclude: password, passwordHash, ssn, creditCard, etc.
  };
  res.json(safeUser);
});

// 4. Password hashing
const bcrypt = require('bcrypt');
const hashedPassword = await bcrypt.hash(userPassword, 12);
db.users.create({ email, passwordHash: hashedPassword });

// 5. Database encryption
// Enable SQLite encryption: const Database = require('better-sqlite3-with-encryption');
// MongoDB: Enable Encryption at Rest in Atlas
// PostgreSQL: Use pgcrypto extension

// 6. HTTPS redirect
app.use((req, res, next) => {
  if (!req.secure && process.env.NODE_ENV === 'production') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// 7. Mask sensitive data in UI
app.get('/api/profile', (req, res) => {
  res.json({
    ...user,
    creditCard: '**** **** **** ' + user.creditCard.slice(-4)
  });
});
```

**Output**: Create `.security-audit/findings/sensitive-data-audit.md`

### 3.5 Error Handling Review

**Files to Review**:
- All try/catch blocks
- Express error middleware
- Error response formatting

**Checklist**:
```javascript
// ❌ PATTERNS LEAKING INFORMATION

// 1. Exposing stack traces
app.get('/api/data', (req, res) => {
  try {
    // code
  } catch (err) {
    res.status(500).json({ 
      error: err.message,
      stack: err.stack // ❌ Exposes file paths, code structure
    });
  }
});

// 2. Database error details
try {
  const result = db.query('...');
} catch (err) {
  res.json({ error: err.message }); // ❌ "FOREIGN KEY constraint failed"
}

// 3. Specific error messages for auth
app.post('/login', async (req, res) => {
  const user = db.users.findByEmail(req.body.email);
  if (!user) {
    return res.status(401).json({ error: 'Email not found' }); // ❌ Tells attacker emails don't exist
  }
  if (!validPassword(req.body.password, user.password)) {
    return res.status(401).json({ error: 'Invalid password' }); // ❌ Different message
  }
});

// 4. No error logging
app.get('/api/data', (req, res) => {
  try {
    // code
  } catch (err) {
    res.status(500).send('Error'); // Error silently lost
  }
});

// ✅ GOOD PATTERNS

// 1. Generic error messages to user, detailed logging internally
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    userId: req.user?.id
  });
  
  res.status(500).json({
    error: 'Internal server error', // Generic to user
    requestId: req.id // For support reference
  });
});

// 2. Same error message for auth failures
app.post('/login', async (req, res) => {
  const user = db.users.findByEmail(req.body.email);
  const validPassword = user && await bcrypt.compare(req.body.password, user.passwordHash);
  
  if (!user || !validPassword) {
    return res.status(401).json({ 
      error: 'Invalid email or password' // Same message for both cases
    });
  }
  
  // Login successful
});

// 3. Operational errors vs unexpected errors
try {
  const user = db.users.findById(userId);
  if (!user) {
    // Operational error - user not found (expected)
    return res.status(404).json({ error: 'User not found' });
  }
} catch (err) {
  // Unexpected database error (log it)
  logger.error('Database error', { error: err.message });
  return res.status(500).json({ error: 'Internal server error' });
}

// 4. Consistent error format
{
  "error": "Validation failed",
  "requestId": "abc123",
  "details": [
    { "field": "email", "message": "Invalid email format" }
  ]
}
```

**Output**: Create `.security-audit/findings/error-handling-audit.md`

### 3.6 Dependency Security Review

**Files to Review**:
- `package.json` and `package-lock.json`
- `requirements.txt` (Python)
- `Gemfile` (Ruby)

**Checklist**:
```bash
# Create list of all dependencies
npm list --all > .security-audit/reports/npm-tree-full.txt

# Check for unused dependencies
npm prune --dry-run

# Look for outdated dependencies
npm outdated

# Check for deprecated packages
npm list --deprecated

# Known problematic packages to watch for:
# - moment (large, consider alternatives)
# - request (deprecated, use axios/fetch)
# - body-parser (built-in to Express 4.16+)
```

**Action Items**:
- [ ] Remove unused dependencies
- [ ] Update all dependencies that can be updated
- [ ] Document any dependencies that can't be updated (and why)
- [ ] Review licenses for compatibility

---

## Phase 4: Dynamic Testing (2-3 hours)

### 4.1 Manual Testing Checklist

Test these **manually** in your application:

**A. Authentication Testing**
```
[ ] Try logging in with SQL injection: ' OR '1'='1
[ ] Try logging in with XSS: <img src=x onerror=alert()>
[ ] Try accessing /admin without logging in (should redirect)
[ ] Try accessing /admin after logging in as non-admin (should deny)
[ ] Try changing another user's password via URL manipulation
[ ] Try accessing another user's profile by changing ID in URL
[ ] Test "Remember me" - does it work securely?
[ ] Test session timeout - does it log out after period of inactivity?
[ ] Test logout - can you still use old session token?
[ ] Test concurrent logins - can multiple sessions exist?
```

**B. Authorization Testing**
```
[ ] Create a resource as User A
[ ] Try to access it as User B (should fail)
[ ] Try to delete it as User B (should fail)
[ ] Try to share it with elevated permissions as regular user (should fail)
[ ] Try accessing admin panel functions as regular user (should fail)
[ ] Try modifying your own role in profile (should fail)
[ ] Try accessing other users' private data (should fail)
```

**C. Input Validation Testing**
```
[ ] Submit form with very long input (>10,000 chars)
[ ] Submit form with special characters: <>'";--
[ ] Submit form with SQL: ' OR 1=1; DROP TABLE users; --
[ ] Submit form with XSS: <img src=x onerror="alert('XSS')">
[ ] Submit form with null bytes: test\x00.jpg
[ ] Submit form with Unicode: 你好世界
[ ] Submit empty required fields
[ ] Submit fields with wrong type (string instead of number)
```

**D. File Upload Testing (if applicable)**
```
[ ] Upload executable file (test.exe) - should be blocked
[ ] Upload hidden file (.htaccess) - should be blocked
[ ] Upload large file (>max size) - should be rejected
[ ] Upload wrong MIME type - should be blocked
[ ] Try path traversal: ../../../etc/passwd
[ ] Try overwriting existing file
[ ] Check where file is stored (should be outside web root)
[ ] Try to execute uploaded file
```

**E. Data Exposure Testing**
```
[ ] View page source - any API keys/secrets? (should be none)
[ ] Check browser dev tools Network tab - any credentials in URL? (should be none)
[ ] Check browser dev tools Application tab - localStorage/sessionStorage for tokens (should be in httpOnly cookies)
[ ] Try to view another user's data in localStorage (should not exist)
[ ] Check API responses - contains sensitive fields like passwordHash? (should not)
[ ] Generate error - does it leak system information?
```

**F. CSRF Testing**
```
[ ] View form HTML - has CSRF token? (should have)
[ ] Try form submission without CSRF token (should fail)
[ ] Try form submission with invalid CSRF token (should fail)
[ ] Try changing account settings via external link/form (should fail)
```

**G. API Testing**
```
[ ] Hit API endpoint with no authentication (should fail)
[ ] Hit API endpoint with invalid authentication (should fail)
[ ] Make 100 requests in 10 seconds (should be rate-limited)
[ ] Check API response headers for security headers
[ ] Try to access more data than needed (/api/users/1/all_data_ever)
[ ] Check if pagination works properly (prevents dumping all data)
```

**Create `.security-audit/findings/manual-testing-results.md`** and document all test results.

### 4.2 Automated Dynamic Testing with OWASP ZAP

```bash
# Install OWASP ZAP (if not already installed)
# Download from https://www.zaproxy.org/

# Run automated scan
zaproxy -cmd \
  -quickurl http://localhost:3000 \
  -quickout .security-audit/reports/zap-scan-report.html

# Or use npm package
npm install -g @owasp-tools/zaproxy-cli

# Run targeted scans
zap-cli --self-signed quick-scan --output-format html \
  -r .security-audit/reports/zap-report.html http://localhost:3000
```

### 4.3 API Security Testing

```javascript
// Create .security-audit/test-api-security.js

const fetch = require('node-fetch');
const assert = require('assert');

const BASE_URL = 'http://localhost:3000';

async function testAPISecurityAsync() {
  console.log('Running API Security Tests...\n');

  // Test 1: No authentication should fail
  console.log('Test 1: Unauthenticated access to protected endpoint');
  const res1 = await fetch(`${BASE_URL}/api/profile`);
  assert.equal(res1.status, 401, 'Should return 401 Unauthorized');
  console.log('✓ PASS\n');

  // Test 2: Invalid token should fail
  console.log('Test 2: Invalid authentication token');
  const res2 = await fetch(`${BASE_URL}/api/profile`, {
    headers: { 'Authorization': 'Bearer invalid_token' }
  });
  assert.equal(res2.status, 401, 'Should return 401');
  console.log('✓ PASS\n');

  // Test 3: Rate limiting
  console.log('Test 3: Rate limiting on API endpoint');
  let successCount = 0;
  for (let i = 0; i < 150; i++) {
    const res = await fetch(`${BASE_URL}/api/public-endpoint`);
    if (res.status === 429) {
      console.log(`✓ Rate limited after ${i} requests\n`);
      break;
    }
    if (res.status === 200) successCount++;
  }
  assert.ok(successCount < 150, 'Should be rate limited');
  console.log('✓ PASS\n');

  // Test 4: SQL injection attempt
  console.log('Test 4: SQL injection in query parameter');
  const res4 = await fetch(
    `${BASE_URL}/api/search?q=' OR '1'='1'`
  );
  const data4 = await res4.json();
  assert.ok(!data4.allUsers, 'Should not return all users');
  console.log('✓ PASS\n');

  // Test 5: Check security headers
  console.log('Test 5: Security headers present');
  const res5 = await fetch(`${BASE_URL}`);
  assert.ok(res5.headers.get('x-content-type-options'), 'Missing X-Content-Type-Options');
  assert.ok(res5.headers.get('x-frame-options'), 'Missing X-Frame-Options');
  assert.ok(res5.headers.get('strict-transport-security'), 'Missing HSTS');
  console.log('✓ PASS\n');

  console.log('All API security tests passed! ✓');
}

testAPISecurityAsync().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
```

Run these tests:
```bash
node .security-audit/test-api-security.js > .security-audit/reports/api-security-tests.txt
```

---

## Phase 5: Remediation & Fixes (Variable)

For each finding:

### 5.1 Create Issue Tracker

Create `.security-audit/findings/VULNERABILITIES.md`:

```markdown
# Security Vulnerabilities Found

## CRITICAL - Fix Immediately

### 1. SQL Injection in User Search
- **Location**: routes/users.js:45
- **Severity**: CRITICAL
- **Description**: User search endpoint vulnerable to SQL injection
- **Current Code**: 
  ```javascript
  const query = `SELECT * FROM users WHERE name LIKE '%${searchTerm}%'`;
  ```
- **Fix**: Use parameterized queries
- **Status**: [ ] Fixed [ ] Tested [ ] Deployed

### 2. Hardcoded API Keys
- **Location**: config/database.js
- **Severity**: CRITICAL
- **Description**: Database password hardcoded in source
- **Fix**: Move to environment variables
- **Status**: [ ] Fixed [ ] Tested [ ] Deployed

## HIGH - Fix Before Production

### 3. Missing CSRF Protection
- **Location**: forms/settings.html
- **Severity**: HIGH
- **Description**: Settings form missing CSRF token
- **Fix**: Add CSRF middleware
- **Status**: [ ] Fixed [ ] Tested [ ] Deployed

### 4. Weak Password Hashing
- **Location**: auth/password.js:12
- **Severity**: HIGH
- **Description**: Using SHA1 instead of bcrypt
- **Fix**: Migrate to bcrypt with salt rounds 12+
- **Status**: [ ] Fixed [ ] Tested [ ] Deployed

## MEDIUM - Fix Within 2 Weeks

### 5. Missing Security Headers
- **Location**: server.js
- **Severity**: MEDIUM
- **Description**: Application missing security headers
- **Fix**: Add helmet.js middleware
- **Status**: [ ] Fixed [ ] Tested [ ] Deployed
```

### 5.2 Fix & Test Pattern

For each vulnerability:

1. **Create feature branch**: `git checkout -b security/fix-sql-injection`
2. **Implement fix**: Apply security patch
3. **Write test**: Create test case that validates fix
4. **Test locally**: Run all tests including new security test
5. **Code review**: Have another dev review security fix
6. **Merge & deploy**: Deploy to staging, then production

### 5.3 Verification Checklist

For each fix:
- [ ] Code change reviewed
- [ ] New test created that validates fix
- [ ] Test passes locally
- [ ] Test passes in CI/CD
- [ ] Fix verified in staging environment
- [ ] Manual testing confirms fix
- [ ] No regressions in existing features
- [ ] Documentation updated

---

## Phase 6: Configuration Review (1 hour)

### 6.1 Server Configuration

**For Node.js/Express:**
```javascript
// config/security.js - Review and ensure all enabled

// 1. Rate limiting
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// 2. Security headers
const helmet = require('helmet');
app.use(helmet());

// 3. CORS
const cors = require('cors');
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS.split(','),
  credentials: true
}));

// 4. Body parser limits
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb' }));

// 5. Morgan logging
const morgan = require('morgan');
app.use(morgan('combined'));
```

**For Nginx/Apache:**
```nginx
# /etc/nginx/sites-available/default

# SSL/TLS
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers HIGH:!aNULL:!MD5;

# Security headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header X-XSS-Protection "1; mode=block" always;

# HTTPS redirect
if ($scheme != "https") {
  return 301 https://$server_name$request_uri;
}
```

**For Docker:**
```dockerfile
# Dockerfile - Security best practices

# Don't run as root
RUN useradd -m appuser
USER appuser

# Minimal base image
FROM node:18-alpine

# No root password
RUN passwd -l root

# Read-only filesystem where possible
RUN chmod 755 /app
```

### 6.2 Environment Configuration

Create `.env.production.example` (commit this, not actual secrets):
```
# Database
DATABASE_URL=postgresql://user:PASSWORD@host:5432/db
DATABASE_SSL=true
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Security
NODE_ENV=production
DEBUG=false
JWT_SECRET=GENERATE_STRONG_SECRET_OFFLINE
SESSION_SECRET=GENERATE_STRONG_SECRET_OFFLINE

# CORS
ALLOWED_ORIGINS=https://yourdomain.com

# API
API_RATE_LIMIT=100
API_RATE_WINDOW=900000

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# SMTP (for password reset emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=APP_SPECIFIC_PASSWORD

# External services
STRIPE_API_KEY=sk_live_XXXXX
STRIPE_WEBHOOK_SECRET=whsec_XXXXX
```

---

## Phase 7: Final Checklist Before Going Live

```markdown
# Pre-Production Security Checklist

## Code
- [ ] All CRITICAL vulnerabilities fixed and tested
- [ ] All HIGH vulnerabilities fixed and tested
- [ ] Dependencies fully audited and updated
- [ ] No hardcoded secrets in code
- [ ] .env file template matches production needs
- [ ] Git history cleaned of secrets (if found)
- [ ] .gitignore prevents secret commits

## Configuration
- [ ] Debug mode disabled
- [ ] Error messages sanitized
- [ ] Security headers configured
- [ ] HTTPS enforced
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] Logging configured without PII

## Testing
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Security-specific tests pass
- [ ] Manual penetration testing completed
- [ ] OWASP ZAP scan run and reviewed
- [ ] API security tests pass
- [ ] Authentication tests pass
- [ ] Authorization tests pass

## Database
- [ ] Database backup tested
- [ ] Encryption at rest enabled
- [ ] Minimal user permissions set
- [ ] Connection requires SSL/TLS
- [ ] Automated backups configured

## Infrastructure
- [ ] Firewall rules configured
- [ ] WAF enabled
- [ ] DDoS protection enabled
- [ ] Monitoring & alerting active
- [ ] Log aggregation configured
- [ ] Incident response plan documented

## Secrets & Keys
- [ ] All API keys rotated
- [ ] Database password secure
- [ ] JWT secrets generated offline
- [ ] Secrets stored in environment variables
- [ ] Secrets manager configured (if using)

## Documentation
- [ ] Security policy documented
- [ ] Incident response procedures documented
- [ ] Data classification documented
- [ ] Access control matrix documented
- [ ] Security findings report completed

## Sign-off
- [ ] Security audit completed by: _____________
- [ ] Date: _____________
- [ ] Approved for production by: _____________
- [ ] Deployment date: _____________
```

---

## Reporting

### Final Security Audit Report Template

Create `.security-audit/SECURITY_AUDIT_REPORT.md`:

```markdown
# Security Audit Report
**Application**: [App Name]  
**Audit Date**: [Date]  
**Auditor**: [Name]  
**Status**: [In Progress / Complete]  

## Executive Summary
[2-3 sentence summary of overall security posture]

## Findings Summary
- CRITICAL: X issues
- HIGH: X issues
- MEDIUM: X issues
- LOW: X issues
- TOTAL: X issues

## Critical Issues
[List each critical issue with severity, impact, fix]

## High Issues
[List each high issue with severity, impact, fix]

## Testing Results
- Automated scanning: PASS / FAIL
- Manual testing: PASS / FAIL
- API security tests: PASS / FAIL
- Penetration testing: PASS / FAIL

## Recommendation
[Ready for production / Not ready - requires X fixes]

## Sign-off
Audited by: [Name]  
Date: [Date]  
Approved by: [Deployment approval authority]
```

---

## Next Steps After Going Live

1. **Weekly**: Review logs for suspicious activity
2. **Weekly**: Run security scans
3. **Monthly**: Dependency updates
4. **Quarterly**: Penetration testing
5. **Annually**: Full security audit
