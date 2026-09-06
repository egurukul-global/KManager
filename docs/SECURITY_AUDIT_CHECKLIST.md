# Web Application Security Audit Checklist

**Purpose**: Comprehensive security review checklist for web applications to identify and mitigate common vulnerabilities before production deployment.

**Last Updated**: September 2026  
**Applicable To**: Full-stack web applications (Frontend + Backend + Database)

---

## 📋 Quick Start: Pre-Production Security Checklist

- [ ] Run static code analysis tools
- [ ] Complete OWASP Top 10 review
- [ ] Perform dependency vulnerability scan
- [ ] Review authentication & authorization
- [ ] Test for injection attacks
- [ ] Verify encryption in transit & at rest
- [ ] Check error handling & logging
- [ ] Review secrets management
- [ ] Conduct penetration testing
- [ ] Complete security documentation

---

## 1. OWASP Top 10 Web Application Vulnerabilities

### 1.1 Injection Attacks (SQL, NoSQL, Command Injection)
**Risk Level**: 🔴 Critical

**What to check**:
- [ ] All user inputs are parameterized/prepared statements (avoid string concatenation)
- [ ] Database queries use ORM frameworks or parameterized queries
- [ ] NoSQL databases use schema validation
- [ ] Command execution never uses unsanitized user input
- [ ] File path traversal is prevented (no `../` allowed)

**Testing**:
```sql
-- Test SQL Injection
' OR '1'='1
'; DROP TABLE users; --
1 UNION SELECT NULL, NULL, NULL --
```

```javascript
// What NOT to do
const query = `SELECT * FROM users WHERE email = '${email}'`; // ❌ Vulnerable

// What TO do
const query = 'SELECT * FROM users WHERE email = ?';
const result = await db.query(query, [email]); // ✅ Safe
```

**Common Libraries**:
- Node.js: `knex`, `sequelize`, `prisma`, `typeorm`
- Python: `sqlalchemy`, `django ORM`
- PHP: `doctrine`, `eloquent`

---

### 1.2 Broken Authentication & Session Management
**Risk Level**: 🔴 Critical

**What to check**:
- [ ] Passwords hashed with strong algorithms (bcrypt, argon2, scrypt - NOT md5/sha1)
- [ ] Minimum password length enforced (12+ characters recommended)
- [ ] Session tokens are random and unpredictable
- [ ] Session timeout implemented (idle + absolute timeout)
- [ ] Secure session storage (httpOnly, Secure, SameSite cookies)
- [ ] Multi-factor authentication (MFA) implemented for sensitive operations
- [ ] Password reset tokens expire (15-60 minutes)
- [ ] Brute force protection on login endpoint
- [ ] Account lockout after failed attempts
- [ ] No sensitive data in JWT/tokens

**Implementation Checklist**:
```javascript
// ✅ Secure password hashing
const bcrypt = require('bcrypt');
const hashedPassword = await bcrypt.hash(password, 12);

// ✅ Secure session cookie
res.cookie('sessionId', token, {
  httpOnly: true,        // Prevent XSS access
  Secure: true,          // HTTPS only
  SameSite: 'Strict',    // CSRF protection
  maxAge: 3600000,       // 1 hour
  domain: 'yourdomain.com',
  path: '/'
});

// ✅ Rate limiting on login
const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                     // 5 attempts
  message: 'Too many login attempts'
});

// ✅ MFA implementation
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
```

---

### 1.3 Sensitive Data Exposure
**Risk Level**: 🔴 Critical

**What to check**:
- [ ] HTTPS/TLS 1.2+ enforced (redirect HTTP → HTTPS)
- [ ] Strong cipher suites configured
- [ ] Database passwords encrypted/in environment variables
- [ ] API keys not committed to version control (use `.env` files)
- [ ] PII (credit cards, SSNs) encrypted at rest
- [ ] Backup data encrypted
- [ ] No sensitive data in logs or error messages
- [ ] Database encryption enabled
- [ ] Sensitive data masked in UI (display last 4 digits only)

**Checklist**:
```javascript
// ❌ DON'T commit secrets
const password = 'my-db-password'; // Exposed in git history

// ✅ DO use environment variables
const password = process.env.DB_PASSWORD;

// ✅ Encrypt sensitive data
const crypto = require('crypto');
const encrypted = crypto.createCipheriv('aes-256-gcm', key, iv).update(data);

// ✅ HTTPS redirect
app.use((req, res, next) => {
  if (!req.secure) {
    res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});
```

---

### 1.4 XML External Entities (XXE)
**Risk Level**: 🟠 High

**What to check**:
- [ ] XML parsers configured to disable external entities
- [ ] DTD processing disabled
- [ ] XXE payload testing performed

**Safe Implementation**:
```javascript
// ❌ Vulnerable
const xml = require('xml2js');
const parser = new xml.Parser();

// ✅ Safe
const parser = new xml.Parser({
  strict: false,
  dtdallowed: false,
  doctype: false,
  validateOnly: true
});
```

---

### 1.5 Broken Access Control (IDOR, Privilege Escalation)
**Risk Level**: 🔴 Critical

**What to check**:
- [ ] User can only access own data (Insecure Direct Object Reference - IDOR)
- [ ] Direct ID reference in URLs requires authorization check
- [ ] Role-based access control (RBAC) implemented
- [ ] Admin endpoints protected
- [ ] API endpoints validate user permissions per request
- [ ] File uploads use only system-generated names, not user input
- [ ] Directory traversal prevented

**Testing**:
```javascript
// ❌ Vulnerable - trusting user input for resource access
app.get('/api/profile/:userId', (req, res) => {
  const user = db.getUserById(req.params.userId);
  res.json(user);
});
// Attacker: /api/profile/2 (access another user's data)

// ✅ Safe - verify authorization
app.get('/api/profile/:userId', (req, res) => {
  if (req.user.id !== req.params.userId) {
    return res.status(403).send('Unauthorized');
  }
  const user = db.getUserById(req.params.userId);
  res.json(user);
});

// ✅ Better - use middleware
const authOwner = (req, res, next) => {
  if (req.user.id === req.params.userId) {
    next();
  } else {
    res.status(403).send('Unauthorized');
  }
};
```

---

### 1.6 Security Misconfiguration
**Risk Level**: 🟠 High

**What to check**:
- [ ] Default credentials changed (databases, servers, admin panels)
- [ ] Debug mode disabled in production
- [ ] Security headers configured (see section 2.1)
- [ ] Unnecessary HTTP methods disabled (HEAD, OPTIONS, TRACE)
- [ ] Directory listing disabled
- [ ] Error messages don't reveal system information
- [ ] Outdated software/frameworks updated
- [ ] Unused dependencies removed
- [ ] Secure CORS configuration

**Configuration Examples**:
```javascript
// ✅ Disable debug mode
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ✅ Set security headers
const helmet = require('helmet');
app.use(helmet()); // Enables multiple security headers

// ✅ Configure CORS properly
const cors = require('cors');
app.use(cors({
  origin: ['https://yourdomain.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));

// ✅ Disable unnecessary HTTP methods
app.disable('x-powered-by');
app.all('*', (req, res, next) => {
  if (['TRACE', 'CONNECT'].includes(req.method)) {
    res.status(405).send('Method not allowed');
  } else {
    next();
  }
});
```

---

### 1.7 Cross-Site Scripting (XSS)
**Risk Level**: 🔴 Critical

**Types**:
- **Reflected XSS**: Malicious script in URL parameter
- **Stored XSS**: Malicious script saved in database
- **DOM-based XSS**: JavaScript manipulating DOM unsafely

**What to check**:
- [ ] All user input sanitized before display
- [ ] HTML entities encoded in templates
- [ ] Content Security Policy (CSP) implemented
- [ ] React/Vue auto-escapes output (use `dangerouslySetInnerHTML` safely)
- [ ] No `eval()` or dynamic code execution
- [ ] External scripts validated

**Testing**:
```html
<!-- Test XSS payloads -->
<img src=x onerror="alert('XSS')">
<svg onload="alert('XSS')">
<iframe src="javascript:alert('XSS')"></iframe>
<script>alert('XSS')</script>
```

**Safe Implementation**:
```javascript
// ❌ Vulnerable - React
<div>{userInput}</div> // If userInput = '<img onerror=alert()>'

// ✅ Safe - React auto-escapes text
<div>{userInput}</div> // Renders safely as text

// ❌ Vulnerable - HTML
const html = `<div>${userInput}</div>`;
element.innerHTML = html;

// ✅ Safe - HTML
element.textContent = userInput;

// ✅ Or sanitize if HTML needed
const DOMPurify = require('dompurify');
element.innerHTML = DOMPurify.sanitize(userInput);
```

**Security Headers**:
```javascript
// ✅ Content Security Policy
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
  next();
});
```

---

### 1.8 Cross-Site Request Forgery (CSRF)
**Risk Level**: 🟠 High

**What to check**:
- [ ] CSRF tokens implemented for state-changing operations (POST, PUT, DELETE)
- [ ] SameSite cookie attribute set (Strict or Lax)
- [ ] Token validated on backend
- [ ] Token regenerated after login
- [ ] Custom headers for API endpoints

**Implementation**:
```javascript
// ✅ Using csrf package
const csrf = require('csurf');
const cookieParser = require('cookie-parser');

app.use(cookieParser());
app.use(csrf({ cookie: true }));

// Generate token
app.get('/form', (req, res) => {
  res.render('form', { csrfToken: req.csrfToken() });
});

// Validate token
app.post('/form', (req, res) => {
  // Token automatically validated by middleware
  res.send('Form submitted safely');
});

// ✅ In HTML form
<form action="/submit" method="POST">
  <input type="hidden" name="_csrf" value="<%= csrfToken %>">
  <input type="text" name="data">
  <button type="submit">Submit</button>
</form>

// ✅ Or use SameSite cookies
res.cookie('sessionId', token, {
  sameSite: 'Strict' // Best protection
});
```

---

### 1.9 Using Components with Known Vulnerabilities
**Risk Level**: 🔴 Critical

**What to check**:
- [ ] Dependency audit completed (npm audit, yarn audit)
- [ ] All dependencies updated to latest secure versions
- [ ] No deprecated packages in use
- [ ] Lock files committed to version control
- [ ] Automated dependency scanning enabled in CI/CD

**Tools**:
```bash
# NPM/Node
npm audit
npm audit fix
npm outdated

# Python
safety check
pip-audit

# Ruby
bundle audit

# Docker
trivy image myapp:latest
```

---

### 1.10 Insufficient Logging & Monitoring
**Risk Level**: 🟠 High

**What to check**:
- [ ] Login attempts logged (success & failure)
- [ ] Failed authentication attempts tracked
- [ ] Administrative actions logged
- [ ] Sensitive data access logged
- [ ] Errors logged (without sensitive data)
- [ ] Audit trail maintained
- [ ] Logs stored securely (not publicly accessible)
- [ ] Log retention policy defined
- [ ] Alerting on suspicious activity

**Implementation**:
```javascript
// ✅ Structured logging
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// ✅ Log security events
logger.info('User login', {
  userId: user.id,
  timestamp: new Date(),
  ipAddress: req.ip
});

logger.warn('Failed login attempt', {
  email: req.body.email,
  attempts: failedAttempts,
  ipAddress: req.ip
});
```

---

## 2. Additional Security Layers

### 2.1 Security Headers
**What to check**:
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY or SAMEORIGIN
- [ ] X-XSS-Protection: 1; mode=block
- [ ] Strict-Transport-Security: max-age=31536000
- [ ] Content-Security-Policy configured
- [ ] Referrer-Policy configured
- [ ] Permissions-Policy configured

**Implementation**:
```javascript
const helmet = require('helmet');

app.use(helmet.contentSecurityPolicy());
app.use(helmet.crossOriginEmbedderPolicy());
app.use(helmet.crossOriginOpenerPolicy());
app.use(helmet.crossOriginResourcePolicy());
app.use(helmet.dnsPrefetchControl());
app.use(helmet.frameguard({ action: 'deny' }));
app.use(helmet.hidePoweredBy());
app.use(helmet.hsts({ maxAge: 31536000 }));
app.use(helmet.ieNoOpen());
app.use(helmet.noSniff());
app.use(helmet.referrerPolicy({ policy: 'no-referrer' }));
app.use(helmet.xssFilter());
```

---

### 2.2 Secrets Management
**What to check**:
- [ ] No secrets in `.git` history (`git secret`, `git-crypt`)
- [ ] `.env` files in `.gitignore`
- [ ] Separate keys for dev/staging/production
- [ ] API keys rotated regularly
- [ ] Secrets manager used (AWS Secrets Manager, HashiCorp Vault)
- [ ] Environment variables validated on startup

**Tools**:
- AWS Secrets Manager
- HashiCorp Vault
- Doppler
- 1Password
- Azure Key Vault

---

### 2.3 Infrastructure Security
**What to check**:
- [ ] Firewall rules configured
- [ ] Only necessary ports exposed
- [ ] DDoS protection enabled
- [ ] WAF (Web Application Firewall) deployed
- [ ] Database not accessible from internet
- [ ] VPN for admin access
- [ ] SSL/TLS certificate valid and up to date
- [ ] Server hardening completed
- [ ] Regular security patches applied

---

### 2.4 API Security
**What to check**:
- [ ] API rate limiting implemented
- [ ] API versioning strategy in place
- [ ] API authentication (OAuth 2.0, API keys)
- [ ] API response pagination (prevent data dumping)
- [ ] API errors don't leak information
- [ ] GraphQL depth limiting (if using GraphQL)
- [ ] GraphQL query complexity limits
- [ ] Input validation on all endpoints

**Rate Limiting Example**:
```javascript
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

app.use('/api/', apiLimiter);
```

---

### 2.5 Database Security
**What to check**:
- [ ] Principle of least privilege (minimal DB user permissions)
- [ ] Database backups encrypted and tested
- [ ] Backup retention policy defined
- [ ] Database connection requires password & SSL
- [ ] Query timeouts configured (prevent resource exhaustion)
- [ ] Stored procedures use parameterized inputs
- [ ] Sensitive columns encrypted
- [ ] Database audit logging enabled
- [ ] No public database access

---

### 2.6 File Upload Security
**What to check**:
- [ ] File type validation (not just extension)
- [ ] File size limits enforced
- [ ] Uploaded files stored outside web root
- [ ] Files renamed (system-generated names)
- [ ] Executable files blocked
- [ ] Virus scanning integrated
- [ ] File permissions set correctly
- [ ] No direct access to upload directory from web

**Implementation**:
```javascript
const multer = require('multer');
const fileType = require('file-type');

const upload = multer({
  dest: '/uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: async (req, file, cb) => {
    // Validate MIME type
    const type = await fileType.fromBuffer(file.buffer);
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    
    if (type && allowedTypes.includes(type.mime)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

app.post('/upload', upload.single('file'), (req, res) => {
  // File stored with random name, not user-provided name
  res.json({ fileName: req.file.filename });
});
```

---

### 2.7 Input Validation
**What to check**:
- [ ] All user input validated
- [ ] Whitelisting approach (accept known good)
- [ ] No blacklisting only (block known bad)
- [ ] Type checking implemented
- [ ] Length limits enforced
- [ ] Format validation (email, phone, etc.)
- [ ] Client-side validation + Server-side validation

**Tools**:
- `joi` (Node.js)
- `yup` (JavaScript)
- `zod` (TypeScript)
- `pydantic` (Python)
- `valibot` (JavaScript)

---

## 3. Security Testing & Audit Process

### 3.1 Static Code Analysis
**Tools**:
- SonarQube / SonarCloud
- ESLint + security plugins (eslint-plugin-security)
- Checkmarx
- Bandit (Python)
- Semgrep

```bash
# ESLint security check
npm install --save-dev eslint eslint-plugin-security
npx eslint . --ext .js
```

### 3.2 Dependency Scanning
```bash
npm audit
npm audit fix
snyk test
```

### 3.3 DAST (Dynamic Application Security Testing)
**Tools**:
- OWASP ZAP
- Burp Suite Community
- Qualys
- Acunetix

### 3.4 Penetration Testing Checklist
- [ ] Test for SQL injection
- [ ] Test for XSS vulnerabilities
- [ ] Test for CSRF vulnerabilities
- [ ] Test for IDOR vulnerabilities
- [ ] Test for authentication bypass
- [ ] Test for privilege escalation
- [ ] Test for sensitive data exposure
- [ ] Test for broken business logic
- [ ] Fuzz testing on endpoints
- [ ] Test error handling

### 3.5 Manual Code Review
- [ ] Authentication logic reviewed
- [ ] Authorization checks present
- [ ] Cryptography implementation reviewed
- [ ] Error handling doesn't expose info
- [ ] Secrets management verified
- [ ] Logging doesn't expose PII

---

## 4. Pre-Production Deployment Checklist

### 4.1 Application Level
- [ ] No debug mode enabled
- [ ] Error messages sanitized
- [ ] Logging configured (no sensitive data)
- [ ] All dependencies updated & audited
- [ ] Security headers configured
- [ ] HTTPS enforced
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] Input validation comprehensive
- [ ] Database credentials secured
- [ ] API keys rotated
- [ ] Backup strategy tested

### 4.2 Infrastructure Level
- [ ] Server hardened
- [ ] Firewall rules configured
- [ ] WAF enabled
- [ ] DDoS protection active
- [ ] SSL/TLS certificate valid
- [ ] SSH keys secured (no passwords)
- [ ] Admin access restricted
- [ ] Monitoring & alerting active
- [ ] Log aggregation configured
- [ ] Incident response plan documented

### 4.3 Data Level
- [ ] Encryption at rest enabled
- [ ] Encryption in transit enforced
- [ ] Database access restricted
- [ ] Backup encryption enabled
- [ ] PII handling policy defined
- [ ] Data retention policy defined
- [ ] GDPR/CCPA compliance verified

---

## 5. Common Vulnerabilities by Tech Stack

### 5.1 Node.js / Express
**Common Issues**:
- Missing input validation
- Insecure session management
- Missing CSRF tokens
- Vulnerable dependencies
- Path traversal in file operations

**Key Packages**:
```json
{
  "helmet": "^7.0.0",
  "express-rate-limit": "^6.0.0",
  "express-validator": "^7.0.0",
  "bcryptjs": "^2.4.3",
  "jsonwebtoken": "^9.0.0",
  "csrf": "^3.7.0"
}
```

### 5.2 React/Vue Frontend
**Common Issues**:
- XSS through dangerouslySetInnerHTML
- Storing tokens in localStorage
- Insecure direct object references
- Missing CORS headers
- Exposing secrets in client code

**Best Practices**:
- Store tokens in httpOnly cookies
- Use DOMPurify for HTML sanitization
- Implement CSP headers
- Avoid dynamic imports with user input
- Use security linters

### 5.3 Python/Django
**Common Issues**:
- SQL injection in raw queries
- CSRF token missing
- Insufficient permission checks
- Debug mode enabled

**Key Settings**:
```python
DEBUG = False
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_SECURITY_POLICY = {...}
SECURE_HSTS_SECONDS = 31536000
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = True
```

---

## 6. Security Incident Response

### 6.1 Incident Response Plan
- [ ] Incident response team assigned
- [ ] Escalation procedures defined
- [ ] Communication plan established
- [ ] Rollback procedures documented
- [ ] Post-incident review process defined

### 6.2 Vulnerability Disclosure
- [ ] Responsible disclosure policy published
- [ ] Security contact email established
- [ ] Response SLA defined (24-48 hours)
- [ ] Fix deployment timeline set

---

## 7. Ongoing Security Maintenance

### 7.1 Regular Tasks
- [ ] Weekly: Review logs for anomalies
- [ ] Weekly: Run security scans
- [ ] Monthly: Dependency updates
- [ ] Monthly: Security patches
- [ ] Quarterly: Penetration testing
- [ ] Quarterly: Access review
- [ ] Annually: Full security audit

### 7.2 Compliance & Documentation
- [ ] Security policy documented
- [ ] Incident response procedures documented
- [ ] Data classification scheme defined
- [ ] Risk assessment completed
- [ ] Compliance requirements identified (PCI-DSS, HIPAA, GDPR, SOC 2)

---

## 8. Quick Reference: Files to Review

When using this checklist, prioritize reviewing these files:

### Backend
- `config/` - Configuration files
- `routes/` - API endpoints
- `middleware/` - Authentication, authorization
- `controllers/` - Business logic
- `models/` - Database models
- `.env.example` - Environment variables template
- `package.json` / `requirements.txt` - Dependencies

### Frontend
- `src/auth/` - Authentication logic
- `src/api/` - API calls
- `src/components/` - React/Vue components
- `.env.example` - Environment variables template
- `public/index.html` - CSP headers
- `src/utils/sanitize.js` - Input sanitization

### Infrastructure
- `Dockerfile` - Container security
- `docker-compose.yml` - Service configuration
- `.env.production` (not committed) - Production secrets
- `nginx.conf` - Web server config
- `ssl/` - Certificate configuration

---

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [CWE/SANS Top 25](https://cwe.mitre.org/top25/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework/)
- [PortSwigger Web Security Academy](https://portswigger.net/web-security)
- [OWASP CheatSheet Series](https://cheatsheetseries.owasp.org/)

---

## Usage Instructions for Cline

**How to use this checklist with Cline**:

1. Copy this entire file into your project root or docs folder
2. Reference it in your system prompt/instructions for Cline:
   ```
   "When reviewing code or implementing features, cross-reference with SECURITY_AUDIT_CHECKLIST.md to ensure all security requirements are met."
   ```
3. Before each code review session with Cline, mention:
   ```
   "Review the code changes against SECURITY_AUDIT_CHECKLIST.md, specifically sections X, Y, Z"
   ```
4. Use Cline to generate security test cases based on this checklist
5. Use Cline to scan files against each vulnerability category

---

**Version**: 1.0  
**Next Review**: December 2026
