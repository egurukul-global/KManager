# CLAUDE.md - Instructions for AI Assistants

**Purpose**: Quick reference for Claude/Cline on how to work with this project.

**Read this FIRST before any coding task.**

---

## Quick Facts About This Project

- **Name**: Kailasa Manager (KManager)
- **Version**: 3.0.0
- **Type**: NGO Finance Management System
- **Tech Stack**: React + Vite (frontend) | Supabase + Node.js (backend)
- **Status**: Pre-production (security hardening in progress)
- **Users**: Non-technical NGO staff (keep UI/UX simple)
- **Budget**: Limited token budget - be efficient!

---

## 🔒 SECURITY FIRST - ALWAYS

### Golden Rules (Never Break These):

1. **NO hardcoded credentials** - EVER
   - All secrets → environment variables ONLY
   - No fallback values like: `process.env.KEY || 'hardcoded-value'`
   - DELETE any `console.log()` with secrets

2. **NO console.log with sensitive data**
   - Never log: passwords, tokens, API keys, user emails in production
   - Debug logs only in development (`if (process.env.NODE_ENV !== 'production')`)

3. **Sessions MUST be short**
   - Max duration: 1 hour (3600 seconds)
   - Refresh tokens: 7 days max
   - Offline access: 1 hour max

4. **Input validation on EVERYTHING**
   - Server-side validation mandatory
   - User can NEVER be trusted
   - Type checking + length limits

5. **Same error messages**
   - Login fails → "Invalid email or password" (same for both cases)
   - Don't tell attacker which field is wrong
   - Never say "user not found" or "wrong password"

6. **Authorization checks on every API call**
   - Never trust user ID from frontend
   - Always verify: `if (req.user.id !== req.params.userId) reject`
   - Check roles/permissions every time

7. **HTTPS only in production**
   - Redirect HTTP → HTTPS automatically
   - All cookies marked Secure + HttpOnly + SameSite

---

## 📁 Project Structure (What You Need to Know)

```
KManager-test/
├── src/                          # React frontend
│   ├── auth.js                   # ⚠️ Authentication logic (CRITICAL)
│   ├── db.js                     # ⚠️ Database queries (CHECK FOR INJECTION)
│   ├── main.js                   # App entry point
│   ├── state.js                  # State management
│   ├── components/               # React components
│   ├── pages/                    # Page components
│   ├── utils/                    # Helper functions
│   └── styles/
│
├── api/                          # Backend API
│   ├── auth/                     # ⚠️ CRITICAL - auth endpoints
│   │   ├── login.js              # ⚠️ FIX: Remove hardcoded creds
│   │   ├── logout.js
│   │   ├── verify.js
│   │   ├── refresh.js
│   │   └── migrate.js
│   └── supabase-proxy.js        # ⚠️ Proxy to Supabase
│
├── supabase/                     # Supabase config
│   └── migrations/
│
├── SECURITY.md                   # ← Read before security work
├── SECURITY_AUDIT_CHECKLIST.md   # ← Reference for vulnerabilities
├── CLAUDE.md                     # ← This file
├── ARCHITECTURE.md               # ← System design
├── DATABASE_SECURITY.md          # ← DB-specific rules
├── PROGRESS.md                   # ← Track what's done
└── .env                          # ← Secrets (NEVER COMMIT)
```

---

## 🚀 How to Work Efficiently (Minimal Tokens)

### Before Coding, ALWAYS Do This:

1. **Read SECURITY.md first** (2 min)
   - Check if your feature involves: auth, data access, user input, errors
   - If yes, read security requirements

2. **Read ARCHITECTURE.md** (3 min)
   - Understand how components connect
   - Know which files to modify

3. **Check PROGRESS.md** (1 min)
   - See what's already fixed
   - Avoid duplicating work

4. **Search for similar patterns** (2 min)
   - `grep` for similar code you're modifying
   - Ensure consistency

### Token-Saving Tips:

- Don't ask "how should I structure this?" → Read ARCHITECTURE.md
- Don't ask "is this secure?" → Check SECURITY.md
- Don't explain the whole project → Assume I read SECURITY.md + ARCHITECTURE.md
- Don't show the full file if only 20 lines matter → Show context + problem line
- Use `grep` to find patterns instead of asking

---

## 🔍 Mandatory Checks Before Committing Code

### Security Checklist (Run Every Time):

```javascript
// 1. No hardcoded secrets?
grep -r "process.env.*||" api/       // ❌ Reject if found
grep -r "password:" api/             // ❌ Reject if found
grep -r "api.key" src/               // ❌ Reject if found

// 2. No sensitive console.logs?
grep -r "console.log.*password" .    // ❌ Reject if found
grep -r "console.log.*token" .       // ❌ Reject if found
grep -r "console.log.*key" .         // ❌ Reject if found

// 3. Sessions reasonable length?
grep -r "Max-Age" api/               // Should be 3600 (1 hour) max
grep -r "expiresAt" src/             // Should be 1 hour max

// 4. Authorization checks present?
grep -r "req.params" api/            // Should have permission check after
grep -r "req.user.id" api/           // Good - means checking identity

// 5. Same error messages?
grep -r "user not found" api/        // ❌ Reject - leaks info
grep -r "wrong password" api/        // ❌ Reject - leaks info
grep -r "Invalid email or password" api/ // ✅ Good - generic
```

### Commands to Run (Automated):

```bash
# Check for obvious vulnerabilities
npm audit

# Check for hardcoded secrets
grep -r "password.*:" src/ api/ --include="*.js" --exclude-dir=node_modules

# Check for console.logs (remove in production)
grep -r "console\." src/ api/ --include="*.js" --exclude-dir=node_modules
```

---

## 📊 When User Asks You To...

### "Add a login feature"
→ Read: `SECURITY.md` (auth section) + `api/auth/login.js` (existing implementation)
→ Check: PROGRESS.md to see what's already done
→ Ensure: Follow all security rules in "Golden Rules" section

### "Create a data export"
→ Read: `DATABASE_SECURITY.md` (data access rules)
→ Check: Authorization logic in similar features
→ Ensure: User can only access own data (IDOR prevention)

### "Fix an error message"
→ Read: `SECURITY.md` (error handling section)
→ Ensure: Doesn't reveal system information
→ Check: Doesn't tell attacker which field is wrong

### "Connect to an API"
→ Read: `ARCHITECTURE.md` (API section)
→ Check: Is data being validated?
→ Check: Are secrets in environment variables?

### "Add user input field"
→ Read: `SECURITY.md` (input validation section)
→ Check: Server-side validation mandatory
→ Ensure: Length limits + type checking

---

## 🎯 Common Tasks (Copy-Paste These)

### Task 1: Add New API Endpoint

```javascript
// Template - always follow this pattern
export default async function handler(req, res) {
  // 1. Set security headers
  res.setHeader('Content-Type', 'application/json');
  
  // 2. Check method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // 3. Check authentication
  const user = req.user; // Assumes auth middleware sets this
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // 4. Validate input
  const { field1, field2 } = req.body;
  if (!field1 || typeof field1 !== 'string' || field1.length > 100) {
    return res.status(400).json({ error: 'Invalid field1' });
  }
  
  // 5. Check authorization (user can only access own data)
  if (req.body.userId && req.body.userId !== user.id) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  try {
    // 6. Do the work
    const result = await doSomething(field1);
    
    // 7. Return success
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    // 8. Log error securely (no sensitive data)
    console.error('Error in endpoint:', error.message);
    
    // 9. Return generic error to user
    return res.status(500).json({ error: 'Internal server error' });
  }
}
```

### Task 2: Add Database Query

```javascript
// ❌ WRONG - SQL Injection vulnerable
const users = await db.query(`SELECT * FROM users WHERE id = ${userId}`);

// ✅ RIGHT - Parameterized query
const users = await db.query('SELECT * FROM users WHERE id = ?', [userId]);

// ✅ RIGHT - Using ORM (Supabase)
const { data, error } = await supabase
  .from('users')
  .select('*')
  .eq('id', userId);
```

### Task 3: Add Frontend Auth Check

```javascript
// ✅ RIGHT - Check in React component
export default function AdminPanel() {
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    // Get session from secure storage (NOT localStorage)
    // Session stored in httpOnly cookie - can't access from JS
    // Only communicate via API calls with credentials
    verifySession().then(setUser);
  }, []);
  
  if (!user || user.role !== 'admin') {
    return <div>Access Denied</div>;
  }
  
  return <div>Admin Panel</div>;
}
```

---

## 🚨 Red Flags (Stop and Ask for Approval)

If you encounter these, DON'T proceed - ask the user first:

1. **Storing passwords in database** (should be hashed)
2. **Direct database connection from frontend** (backend proxy required)
3. **Storing tokens in localStorage** (should be httpOnly cookies)
4. **Hardcoded API endpoints** (should be from config)
5. **Trusting user input for permissions** (server must verify)
6. **Removing error handling** (even in "minor" fixes)
7. **Increasing session duration** (keep it short)
8. **Removing rate limiting** (brute force protection)
9. **Logging sensitive data** (passwords, tokens, emails)
10. **Disabling HTTPS** (always on in production)

---

## 📞 Token-Efficient Communication

### Tell Claude/Cline LESS by being specific:

❌ **Wastes tokens**: "The app isn't working, fix it"
✅ **Saves tokens**: "Line 45 in src/db.js uses string concatenation in SQL query. Fix to use parameterized queries per SECURITY.md section 1.1"

❌ **Wastes tokens**: "Add authentication"
✅ **Saves tokens**: "Add login endpoint following template in CLAUDE.md - Task 1. Use Supabase auth. Apply all security rules from SECURITY.md - auth section"

❌ **Wastes tokens**: "Is this secure?"
✅ **Saves tokens**: "Check if this follows SECURITY.md golden rules 1-7"

---

## 🔄 Next Steps (After Reading This)

1. Read `SECURITY.md` (understand security requirements)
2. Read `ARCHITECTURE.md` (understand system structure)
3. Read `DATABASE_SECURITY.md` (understand data rules)
4. Review `PROGRESS.md` (see what's already done)
5. Start work with minimal explanation needed

---

## Version Info

- **Created**: September 2026
- **Last Updated**: September 2026
- **Status**: Active - Update PROGRESS.md as work completes

**For questions**: Refer to SECURITY.md, ARCHITECTURE.md, or DATABASE_SECURITY.md first!

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
