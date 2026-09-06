# SECURITY.md - Security Requirements & Best Practices

**Purpose**: What security rules MUST be followed. Check this before every code change.

**Format**: Each section has [✅ DO] and [❌ DON'T] examples.

---

## 1. Authentication & Session Management

### 1.1 Password Handling

**✅ DO:**
```javascript
// Use bcrypt for hashing
const bcrypt = require('bcrypt');
const hashedPassword = await bcrypt.hash(password, 12);
await db.users.update({ passwordHash: hashedPassword });
```

**❌ DON'T:**
```javascript
// Never store plain text passwords
await db.users.create({ password: userPassword });

// Never use weak hashing
const hash = crypto.createHash('md5').update(password).digest('hex');
const hash = crypto.createHash('sha1').update(password).digest('hex');
```

**Rule**: All passwords MUST be hashed with bcrypt (salt rounds: 12+) or Argon2.

---

### 1.2 Session Duration

**✅ DO:**
```javascript
// Short-lived access tokens
Max-Age: 60 * 60           // 1 hour

// Longer-lived refresh tokens
Max-Age: 60 * 60 * 24 * 7  // 7 days max

// Offline/cached session
expiresAt: Date.now() + 60 * 60 * 1000  // 1 hour max
```

**❌ DON'T:**
```javascript
// Way too long
Max-Age: 60 * 60 * 24 * 30  // 30 days!
Max-Age: 60 * 60 * 24 * 7   // 7 days!

// Infinite sessions
Max-Age: 99999999999
```

**Rule**: Access tokens max 1 hour. Offline sessions max 1 hour. Always short duration.

---

### 1.3 Cookie Security

**✅ DO:**
```javascript
res.setHeader('Set-Cookie', 
  `session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`
);
```

**❌ DON'T:**
```javascript
// Missing HttpOnly - JavaScript can read it!
res.setHeader('Set-Cookie', 
  `session=${token}; Path=/; Max-Age=3600`
);

// Missing Secure - sent over HTTP!
res.setHeader('Set-Cookie', 
  `session=${token}; Path=/; HttpOnly`
);

// Missing SameSite - CSRF vulnerable!
res.setHeader('Set-Cookie', 
  `session=${token}; Path=/; HttpOnly; Secure`
);

// Stored in localStorage - XSS vulnerable!
localStorage.setItem('token', token);
```

**Rule**: Cookies MUST be HttpOnly + Secure + SameSite=Strict. NEVER localStorage for tokens.

---

### 1.4 Session Storage (Frontend)

**✅ DO:**
```javascript
// Session in httpOnly cookie (backend-only access)
// No JavaScript can read it
// Automatically sent with each request

// For user UI data only, use state:
const [user, setUser] = useState(null);
```

**❌ DON'T:**
```javascript
// IndexedDB - accessible to XSS!
const db = await openDB('mydb');
await db.put(SESSION_STORE, sensitiveData, 'current-session');

// localStorage - accessible to XSS!
localStorage.setItem('session', JSON.stringify(userData));

// sessionStorage - accessible to XSS!
sessionStorage.setItem('token', token);

// Global variable - accessible to XSS!
window.authToken = token;
```

**Rule**: Tokens ONLY in httpOnly cookies. User UI data in React state only.

---

## 2. Authorization & Access Control

### 2.1 Authorization Checks (Mandatory on Every API Call)

**✅ DO:**
```javascript
export default async function handler(req, res) {
  // Step 1: Extract user from request
  const user = req.user; // From auth middleware
  
  // Step 2: Check authentication
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Step 3: Check authorization (most important!)
  const resourceOwnerId = req.body.userId; // From request
  if (resourceOwnerId !== user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // Step 4: Check permissions/role if needed
  if (req.body.action === 'delete' && user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can delete' });
  }
  
  // Step 5: Do the work
  return res.status(200).json({ success: true });
}
```

**❌ DON'T:**
```javascript
// Missing authorization check!
export default async function handler(req, res) {
  const { userId } = req.body;
  const user = await db.users.findById(userId);
  res.json(user); // IDOR - anyone can access anyone's data!
}

// Trusting frontend to enforce permissions
export default async function handler(req, res) {
  if (req.body.isAdmin === true) { // ❌ Frontend told us to!
    // Do admin action
  }
}

// Checking permissions but still returning error details
export default async function handler(req, res) {
  if (!user.isAdmin) {
    return res.status(403).json({ error: 'Admin users only' }); // Leaks info!
  }
}
```

**Rule**: EVERY endpoint MUST check:
1. Is user authenticated?
2. Can user access this resource?
3. Does user have permission for this action?

---

### 2.2 IDOR (Insecure Direct Object Reference) Prevention

**✅ DO:**
```javascript
// User can only access their own profile
app.get('/api/users/:userId', (req, res) => {
  if (req.user.id !== req.params.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const user = db.users.findById(req.params.userId);
  res.json(user);
});

// User can only access their team's expenses
app.get('/api/expenses/:expenseId', (req, res) => {
  const expense = db.expenses.findById(req.params.expenseId);
  if (expense.team_id !== req.user.team_id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(expense);
});
```

**❌ DON'T:**
```javascript
// No ownership check
app.get('/api/users/:userId', (req, res) => {
  const user = db.users.findById(req.params.userId);
  res.json(user); // Anyone can access anyone's profile!
});

// No team membership check
app.get('/api/expenses/:expenseId', (req, res) => {
  const expense = db.expenses.findById(req.params.expenseId);
  res.json(expense); // Anyone can see any expense!
});
```

**Rule**: Always verify user owns/can access the resource BEFORE returning data.

---

## 3. Input Validation & Sanitization

### 3.1 Server-Side Validation (Mandatory!)

**✅ DO:**
```javascript
const joi = require('joi');

const schema = joi.object({
  email: joi.string().email().required(),
  password: joi.string().min(12).max(128).required(),
  age: joi.number().integer().min(0).max(150),
  name: joi.string().max(200)
});

app.post('/register', (req, res) => {
  const { error, value } = schema.validate(req.body);
  
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  
  // Use validated data
  const user = createUser(value);
  res.json(user);
});
```

**❌ DON'T:**
```javascript
// No validation!
app.post('/register', (req, res) => {
  const user = createUser(req.body);
  res.json(user);
});

// Only frontend validation!
if (req.body.password.length < 8) { // Attacker can bypass this
  return res.status(400).json({ error: 'Password too short' });
}

// Type coercion vulnerabilities
const age = req.body.age; // Could be string "99" or array or object
db.users.create({ age });
```

**Rule**: Validate EVERY input on server-side. Never trust frontend validation alone.

---

### 3.2 Type Checking

**✅ DO:**
```javascript
app.post('/transfer-budget', (req, res) => {
  // Validate types
  if (typeof req.body.amount !== 'number') {
    return res.status(400).json({ error: 'Amount must be number' });
  }
  
  if (!Array.isArray(req.body.accountIds)) {
    return res.status(400).json({ error: 'Account IDs must be array' });
  }
  
  // Proceed with type-safe data
  const transfer = createTransfer(req.body.amount, req.body.accountIds);
  res.json(transfer);
});
```

**❌ DON'T:**
```javascript
// No type checking
app.post('/transfer-budget', (req, res) => {
  // req.body.amount could be string, array, object, etc.
  const transfer = createTransfer(req.body.amount, req.body.accountIds);
  res.json(transfer);
});
```

**Rule**: Check data types explicitly. JavaScript type coercion can hide security issues.

---

### 3.3 Length Limits

**✅ DO:**
```javascript
const schema = joi.object({
  name: joi.string().max(100).required(),
  description: joi.string().max(5000),
  email: joi.string().email().max(255),
  budgetAmount: joi.number().max(9999999) // Prevent overflow
});

// Or manually:
if (req.body.name && req.body.name.length > 100) {
  return res.status(400).json({ error: 'Name too long' });
}
```

**❌ DON'T:**
```javascript
// No length limits - attacker sends 1MB string
app.post('/create-report', (req, res) => {
  const report = createReport(req.body.description); // No limit!
  res.json(report);
});

// No limits on arrays
app.get('/users', (req, res) => {
  const limit = req.query.limit; // Could be 999999999
  const users = db.users.limit(limit).getAll();
  res.json(users); // Returns massive response
});
```

**Rule**: Set max length for all string inputs. Set max items for all array inputs.

---

## 4. Data Protection

### 4.1 Secrets Management

**✅ DO:**
```javascript
// Environment variables ONLY
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing required environment variables');
}

// Never with fallback values!
const getConfig = () => {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY
  };
};
```

**❌ DON'T:**
```javascript
// Hardcoded secrets
const supabaseUrl = 'https://nvhaetvreopkktlxxdwg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

// Hardcoded with fallback
const getSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL || 'https://hardcoded.url'; // ❌ Fallback!
  const key = process.env.SUPABASE_ANON_KEY || 'hardcoded-key'; // ❌ Fallback!
  return { url, key };
};

// Secrets in comments
// API Key: sk_live_1234567890abcdef

// Secrets in git history (even deleted)
// Once in git, always compromised
```

**Rule**: Secrets ONLY from environment variables. No hardcoded values. No fallbacks. No comments with secrets.

---

### 4.2 Logging (Secure)

**✅ DO:**
```javascript
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log' })
  ]
});

// Good logging - secure data
logger.info('User login success', {
  userId: user.id,
  email: user.email,
  timestamp: new Date(),
  ipAddress: req.ip
  // No password, no token, no API key
});

logger.error('Database error', {
  operation: 'findUser',
  error: 'Connection timeout'
  // No query details that leak info
});
```

**❌ DON'T:**
```javascript
// Logging secrets
console.log('Connecting to', url, 'with key', apiKey); // ❌ Secrets in logs!

// Logging passwords
console.log('User attempting login:', email, password); // ❌ Password in logs!

// Logging sensitive queries
console.log('Query:', 'SELECT * FROM users WHERE id =', userId); // ❌ Leaks schema!

// Logging in production
if (process.env.NODE_ENV === 'production') {
  console.log('User data:', userData); // ❌ Console logs might be logged!
}
```

**Rule**: Log useful info (userId, action, error type) but NEVER passwords, tokens, API keys, or sensitive data.

---

### 4.3 API Response Filtering

**✅ DO:**
```javascript
// Return only necessary fields
app.get('/api/profile', (req, res) => {
  const user = db.users.findById(req.user.id);
  
  const safeUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    profilePhoto: user.profilePhoto
    // Exclude: passwordHash, ssn, creditCard, etc.
  };
  
  res.json(safeUser);
});

// Mask sensitive data
app.get('/api/payment-methods', (req, res) => {
  const methods = db.paymentMethods.findByUserId(req.user.id);
  
  const safe = methods.map(m => ({
    id: m.id,
    type: m.type,
    lastFour: '**** **** **** ' + m.cardNumber.slice(-4),
    expiryMonth: m.expiryMonth,
    expiryYear: m.expiryYear
    // Never return full card number
  }));
  
  res.json(safe);
});
```

**❌ DON'T:**
```javascript
// Returning everything
app.get('/api/profile', (req, res) => {
  const user = db.users.findById(req.user.id);
  res.json(user); // Returns passwordHash, ssn, creditCard, etc!
});

// Exposing internal IDs
res.json({
  internalDatabaseId: user.internal_id,
  legacyUserId: user.old_id,
  systemVersion: process.version
});
```

**Rule**: Only return fields user needs. Exclude: passwords, hashes, internal IDs, system info.

---

## 5. Error Handling

### 5.1 User-Facing Error Messages

**✅ DO:**
```javascript
// Same error message for both cases - don't leak info
app.post('/login', async (req, res) => {
  const user = await db.users.findByEmail(req.body.email);
  const validPassword = user && await bcrypt.compare(req.body.password, user.passwordHash);
  
  if (!user || !validPassword) {
    return res.status(401).json({ 
      error: 'Invalid email or password' // Same message!
    });
  }
  
  // Login successful
  res.json({ user, token });
});

// Generic messages
try {
  await doSomething();
} catch (error) {
  logger.error('Error details:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    requestId: req.id // For support reference
  });
}
```

**❌ DON'T:**
```javascript
// Different messages leak info
app.post('/login', async (req, res) => {
  const user = await db.users.findByEmail(req.body.email);
  
  if (!user) {
    return res.status(401).json({ error: 'Email not found' }); // ❌ Leaks info!
  }
  
  if (!await bcrypt.compare(req.body.password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid password' }); // ❌ Different message!
  }
});

// Stack traces exposed
catch (error) {
  res.status(500).json({ 
    error: error.message,
    stack: error.stack // ❌ Exposes code paths!
  });
}

// Database errors exposed
res.status(500).json({ 
  error: 'FOREIGN KEY constraint failed' // ❌ Database schema leaks!
});
```

**Rule**: Generic error messages to users. Detailed logs server-side. NEVER expose stack traces.

---

## 6. HTTPS & Transport Security

### 6.1 HTTPS Enforcement

**✅ DO:**
```javascript
// Redirect HTTP to HTTPS
app.use((req, res, next) => {
  if (!req.secure && process.env.NODE_ENV === 'production') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// Force HSTS header
app.use((req, res, next) => {
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );
  next();
});
```

**❌ DON'T:**
```javascript
// Allowing HTTP
// No redirect
// No HSTS header

// Sending credentials over HTTP
if (!req.secure) {
  // Still processing auth!
  const token = req.cookies.sessionToken;
}
```

**Rule**: HTTPS only in production. Redirect HTTP → HTTPS. Set HSTS header.

---

## 7. Brute Force & Rate Limiting

### 7.1 Rate Limiting (Especially Login)

**✅ DO:**
```javascript
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                     // 5 attempts
  message: 'Too many login attempts',
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100             // 100 requests
});

app.post('/api/auth/login', loginLimiter, loginHandler);
app.use('/api/', apiLimiter);
```

**❌ DON'T:**
```javascript
// No rate limiting
app.post('/api/auth/login', (req, res) => {
  // Attacker can try infinite passwords!
  // Brute force attacks work
});
```

**Rule**: Rate limit login (5 attempts per 15 minutes). Rate limit APIs (reasonable limits).

---

## 8. SQL Injection Prevention

### 8.1 Parameterized Queries (Use Always!)

**✅ DO:**
```javascript
// Using parameterized queries
const result = await db.query(
  'SELECT * FROM users WHERE email = ? AND role = ?',
  [email, role]
);

// Using ORM (best practice)
const user = await User.findOne({ email, role });

// Using Supabase (already safe)
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('email', email);
```

**❌ DON'T:**
```javascript
// String concatenation = SQL Injection!
const result = await db.query(
  `SELECT * FROM users WHERE email = '${email}'`
);

// Template literals don't help
const result = await db.query(
  `SELECT * FROM users WHERE email = ${email}`
);

// Concatenation with .where()
const result = db('users')
  .where('email', `'${email}'`) // Still vulnerable!
  .select();
```

**Rule**: NEVER concatenate user input into SQL. ALWAYS use parameterized queries or ORM.

---

## 9. Common Vulnerability Check

### Quick Security Checklist

Before committing ANY code:

```
[ ] No hardcoded secrets (database URL, API keys, etc)
[ ] No console.log with sensitive data
[ ] All user inputs validated server-side
[ ] Authorization checks on every endpoint
[ ] Sessions/tokens set to reasonable duration (1 hour max)
[ ] httpOnly + Secure + SameSite cookies
[ ] Parameterized database queries
[ ] Error messages don't leak info
[ ] HTTPS enforced in production
[ ] Rate limiting on login/sensitive endpoints
[ ] API responses don't include unnecessary fields
[ ] Logging doesn't contain passwords/tokens
```

---

## Version Info

- **Created**: September 2026
- **Status**: Active
- **Last Updated**: September 2026

**Next**: Read DATABASE_SECURITY.md for database-specific rules!
