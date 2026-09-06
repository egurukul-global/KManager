# QUICK_REFERENCE.md - Token-Efficient Claude Commands

**Purpose**: Minimal prompts for maximum efficiency. Copy-paste these commands to Claude Desktop.

**Pro Tip**: Always reference SECURITY.md, ARCHITECTURE.md, and CLAUDE.md first. Claude can then use shorter commands.

---

## 🔐 Security Issues (Use These Commands)

### Command 1: Fix All Critical Auth Issues

```
Fix these CRITICAL issues in api/auth/login.js per SECURITY.md section 4.1:
1. Line 5-7: Remove hardcoded Supabase URL and API key
2. Remove console.log with secrets (line ~13)
3. Change Max-Age from 604800 (7 days) to 3600 (1 hour)
4. Fix CORS: only allow ALLOWED_ORIGINS from env var
5. Change login error message to "Invalid email or password" (same for both failures)
6. Add rate limiting: max 5 attempts per 15 minutes

Provide:
- Fixed login.js code with comments
- .env.example template with required variables
- Test cases to verify each fix
```

### Command 2: Fix IndexedDB Session Storage

```
Fix src/auth.js per SECURITY.md section 1.3:
1. Remove IndexedDB session storage (lines 17-27)
2. Change to use httpOnly cookies ONLY
3. Change offline session from 24 hours to 1 hour
4. Maintain offline mode capability without storing secrets

Provide:
- Fixed auth.js code
- Explanation of security improvements
- How offline mode now works safely
```

### Command 3: Fix Database Queries

```
Review src/db.js and api/supabase-proxy.js per SECURITY.md section 8.1:
1. Find all database queries with user input
2. Verify parameterized queries (NOT string concatenation)
3. Check authorization before returning data
4. Ensure error messages don't leak info

Provide:
- List of all queries found
- Any vulnerable patterns found
- Fixes for vulnerable patterns
- How to prevent SQL injection
```

---

## 🔄 Common Repeating Tasks

### Task: "I'm adding a new feature, make sure it's secure"

**Tell Claude this**:
```
I'm adding a new feature: [FEATURE_NAME]

It involves:
[ ] User authentication
[ ] Accessing user data  
[ ] Accepting user input
[ ] Database queries
[ ] API endpoint
[ ] File uploads
[ ] Other: ___________

Review against SECURITY.md golden rules before starting.
Specifically check: [sections relevant to your feature]
```

### Task: "Check this code for vulnerabilities"

**Tell Claude this**:
```
Review this code snippet for security issues per SECURITY.md:

[PASTE CODE HERE]

Check for:
1. Hardcoded secrets
2. SQL injection
3. Authorization bypass
4. Input validation
5. Error messages leaking info
6. Logging sensitive data

Report findings and fixes needed.
```

### Task: "Is this approach secure?"

**Tell Claude this**:
```
Is this approach secure per SECURITY.md?

[DESCRIBE APPROACH]

Specifically check:
- Authentication: Section 1.0
- Authorization: Section 2.0
- Input validation: Section 3.0
- Data protection: Section 4.0

Flag any issues and suggest fixes.
```

---

## 🛠️ Setup & Configuration Commands

### Setup .env File

```
Create .env template file with these variables for a Kailasa Manager NGO app:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_KEY
- NODE_ENV (development/production)
- ALLOWED_ORIGINS (comma-separated domains)

Provide:
- .env.example (template, no secrets)
- Instructions for developer setup
- How to add to .env.production
```

### Setup GitHub Actions

```
I need GitHub Actions to automatically scan security per our GitHub Actions workflow.

Create a GitHub Actions config at: .github/workflows/security.yml

It should:
1. Run on every push and PR
2. Run npm audit
3. Scan for hardcoded secrets
4. Check for console.log with secrets
5. Verify .env is gitignored
6. Block merge if critical issues found

Provide complete workflow file.
```

---

## 📋 Quick Checklists (Copy-Paste These)

### Before Committing Code

```
[ ] Read SECURITY.md - Check relevant sections
[ ] No hardcoded secrets (database URL, API keys)
[ ] No console.log with password/token/key/email
[ ] All user inputs validated server-side
[ ] Authorization checks on every endpoint
[ ] Sessions/tokens expire in 1 hour max
[ ] Error messages are generic (no info leak)
[ ] Database queries are parameterized
[ ] HTTPS enforced in production
[ ] Rate limiting on sensitive endpoints
```

### Before Deploying to Production

```
[ ] All SECURITY.md requirements met
[ ] All tests passing (npm test)
[ ] npm audit shows no critical issues
[ ] No secrets in .env file (use .env.example)
[ ] HTTPS certificate valid
[ ] Database backups working
[ ] Monitoring/logging configured
[ ] Incident response plan ready
[ ] Team aware of security changes
```

---

## 🚀 Feature-Specific Minimal Commands

### "Add Login Form"
```
Build secure login endpoint per SECURITY.md auth + error sections:
- Use Supabase.auth.signInWithPassword()
- Same error message for wrong email AND wrong password
- Rate limit: 5 attempts per 15 minutes
- Return user + token in httpOnly cookie
- Log: userId + timestamp + IP (never password)
- Return generic error if anything fails

Provide: api/auth/login.js complete code + test cases
```

### "Add Expense Export to Excel"
```
Build expense export per SECURITY.md auth + data sections:
- Verify user owns expenses (authorization check)
- Only export fields: id, date, amount, category, note
- Exclude: internal IDs, API keys, system info
- Validate user has permission for team
- Log: userId + action + timestamp
- Handle errors safely (no sensitive info exposed)

Provide: Complete implementation + test cases
```

### "Add Admin User Management"
```
Build admin feature per SECURITY.md auth + error sections:
- Check req.user.role === 'admin' first
- Verify user exists before showing/modifying
- Never expose system info in errors
- Log all admin actions: who, what, when
- Validate all inputs server-side
- Use same error message for user not found

Provide: API endpoints + authorization middleware
```

### "Add File Upload"
```
Build file upload per SECURITY.md sections 2.6 (file upload):
- Max file size: 5MB
- Allowed types: PDF, PNG, JPG only
- Validate MIME type (not just extension)
- Rename file (use system-generated name, not user input)
- Store outside web root
- Delete files when user deletes expense
- Virus scan (if available)

Provide: Upload handler + security checks
```

---

## 📊 Minimal Documentation Commands

### "Summarize the security issues found"
```
Per PROGRESS.md, create a 1-page executive summary:
- Total issues found: X
- Critical: X (what are they?)
- High: X (what are they?)
- Timeline to fix
- Impact if not fixed
- Recommended priority
```

### "Create deployment checklist"
```
Per SECURITY.md + ARCHITECTURE.md, create production deployment checklist with:
- Pre-deployment (code review, testing)
- Deployment steps
- Post-deployment verification
- Rollback procedure
- Monitoring what to watch
- First week monitoring schedule
```

---

## 🔍 Code Review Commands (For Existing Code)

### "Find security issues in this file"
```
Scan [FILENAME] per SECURITY.md for:
1. Hardcoded secrets
2. Authorization checks (missing any?)
3. Input validation (types, lengths, formats)
4. Error messages (leak info?)
5. Logging (expose secrets?)
6. SQL injection (parameterized queries?)
7. HTTPS enforcement
8. Rate limiting

List: Line number + Issue + Fix needed
```

### "Verify this follows SECURITY.md"
```
Does this code follow all SECURITY.md rules?

[PASTE CODE]

Check against:
- Golden Rules (section 1 of CLAUDE.md)
- Relevant SECURITY.md section

Pass/Fail: [List which rules apply and if followed]
```

---

## ⚡ Time-Saving Tips

### Instead of explaining issues:
```
❌ WASTES TOKENS:
"In my auth code, I'm using localStorage to store the session token 
but I heard that's not secure and XSS attacks can steal it..."

✅ SAVES TOKENS:
"I'm storing session in localStorage. 
Fix per SECURITY.md section 1.3 (Cookie Security)."
```

### Instead of asking how:
```
❌ WASTES TOKENS:
"How do I make sure only the user can see their own data?"

✅ SAVES TOKENS:
"Add IDOR prevention check per SECURITY.md section 2.2 
to api/expenses/:id endpoint"
```

### Instead of general questions:
```
❌ WASTES TOKENS:
"Can you review my authentication code for security?"

✅ SAVES TOKENS:
"Review api/auth/login.js against SECURITY.md sections 1-2. 
List any issues + fixes needed."
```

---

## 🎯 Prompt Template for Any Task

**Use this template for clearest communication**:

```
TASK: [What you want done]

CONTEXT: 
- Relevant file: [path/to/file.js]
- What it currently does: [brief description]
- What needs to change: [specific requirement]

REQUIREMENTS:
- Must follow: [relevant SECURITY.md section]
- Must include: [specific security check]
- Test cases should cover: [specific scenarios]

DELIVER:
- Fixed code with comments
- Explanation of security improvements
- Test cases
- How to verify it works

REFERENCE: SECURITY.md section X.X for details
```

---

## 📞 When You Need Different Types of Help

### "I need help understanding a concept"
```
"Explain [CONCEPT] per ARCHITECTURE.md and SECURITY.md.
Use simple language (NGO team, non-technical background).
Include: What it is, why it matters, example code."
```

### "I need to onboard a new developer"
```
"Create quick start guide for new developer:
1. Read these 3 files: [list files]
2. Must understand: [key concepts]
3. Setup instructions: [steps]
4. When adding code, check: [checklist]
5. Security rules they MUST follow: [list]"
```

### "I need to brief my team"
```
"Create 5-minute explanation for non-technical NGO team:
- What security issues were found
- Why they matter
- What we're fixing
- When it'll be done
- What users need to do

Make it: Non-technical, reassuring, action-focused"
```

---

## Version Info

- **Created**: September 6, 2026
- **Purpose**: Minimize tokens while maximizing accuracy
- **Update Frequency**: Add new patterns as they emerge

**Remember**: 
- Reference SECURITY.md, ARCHITECTURE.md, CLAUDE.md FIRST
- Be specific, not vague
- Include file paths + line numbers
- Copy-paste these commands
