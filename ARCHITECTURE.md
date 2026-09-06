# ARCHITECTURE.md - System Design

**Purpose**: How the system is structured. Read this to understand component relationships.

---

## 🏗️ High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER / FRONTEND (React + Vite)         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  React Components                                    │   │
│  │  ├── Pages (accounts, expenses, reports, etc)       │   │
│  │  ├── Components (modals, forms, tables)             │   │
│  │  └── Utils (helpers, formatters)                    │   │
│  └──────────────────────────────────────────────────────┘   │
│           ↓ (HTTPS only)                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  src/auth.js  - Authentication                      │   │
│  │  src/db.js    - Database queries via API            │   │
│  │  src/state.js - State management                    │   │
│  └──────────────────────────────────────────────────────┘   │
│           ↓ API Calls with credentials                       │
└─────────────────────────────────────────────────────────────┘
           ↓ HTTP/HTTPS Requests
┌─────────────────────────────────────────────────────────────┐
│                    NODE.JS BACKEND (API)                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  api/auth/                                           │   │
│  │  ├── login.js      - User authentication            │   │
│  │  ├── logout.js     - Session cleanup                │   │
│  │  ├── verify.js     - Check if logged in             │   │
│  │  ├── refresh.js    - Refresh tokens                 │   │
│  │  └── migrate.js    - Legacy token migration         │   │
│  └──────────────────────────────────────────────────────┘   │
│           ↓ Validate + Authorize                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  api/supabase-proxy.js                              │   │
│  │  - Forward requests to Supabase                     │   │
│  │  - Check permissions                               │   │
│  │  - Enforce RLS (Row Level Security)                 │   │
│  └──────────────────────────────────────────────────────┘   │
│           ↓ Secure connection                                │
└─────────────────────────────────────────────────────────────┘
           ↓ (HTTPS + Authentication)
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE (Database Backend)               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  PostgreSQL Database                                │   │
│  │  ├── users table          - User accounts           │   │
│  │  ├── organizations table  - NGO/teams               │   │
│  │  ├── budgets table        - Budget allocations      │   │
│  │  ├── expenses table       - Expense records         │   │
│  │  └── ... other tables                               │   │
│  └──────────────────────────────────────────────────────┘   │
│           ↓                                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Row Level Security (RLS)                            │   │
│  │  - Users can only see own data                      │   │
│  │  - Managers can see team data                       │   │
│  │  - Admins can see everything                        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Flow

### Login Flow

```
User enters email/password
    ↓
Frontend: src/auth.js → secureLogin()
    ↓
POST /api/auth/login (with email, password)
    ↓
Backend: api/auth/login.js
    ├─ Validate input (email format, password length)
    ├─ Call Supabase.auth.signInWithPassword()
    ├─ Get back: session tokens + user data
    └─ Set httpOnly cookies with tokens
    ↓
Response: { user: {id, email, role}, expires_at }
    ↓
Frontend: Store in IndexedDB (BEING FIXED)
    ├─ Better: Store in httpOnly cookie (backend-only access)
    └─ Session expires in 1 hour
```

### API Call Flow

```
User clicks "View Expenses"
    ↓
Frontend: db.js → queryExpenses(teamId)
    ↓
GET /api/expenses?teamId=123 (with credentials)
    ├─ Browser auto-includes httpOnly cookies
    └─ Backend receives authenticated request
    ↓
Backend: api/supabase-proxy.js
    ├─ Extract user from cookie/token
    ├─ Check: Is this user authorized for teamId=123?
    ├─ If yes → Forward to Supabase
    ├─ If no → Return 403 Forbidden
    └─ Supabase RLS enforces row-level security
    ↓
Supabase Database
    ├─ Query: SELECT * FROM expenses WHERE team_id = 123
    ├─ RLS Policy: Only return rows user can access
    └─ Return filtered data
    ↓
Response: [expense1, expense2, ...]
    ↓
Frontend: Display in table
```

---

## 🔐 Authentication Architecture

### Sessions & Tokens

```
┌─────────────────────────────────────────┐
│  Supabase Auth (Handles these)          │
├─────────────────────────────────────────┤
│ Access Token (JWT)                      │
│ ├─ Short-lived: 1 hour                  │
│ ├─ Contains: user_id, email, role       │
│ ├─ Stored in: httpOnly cookie (secure) │
│ └─ Expires: 1 hour (NOT 7 DAYS!)       │
│                                         │
│ Refresh Token                           │
│ ├─ Long-lived: 7 days                   │
│ ├─ Used to get new access token         │
│ ├─ Stored in: httpOnly cookie (secure) │
│ └─ Rotated on each refresh              │
└─────────────────────────────────────────┘
```

### Offline Mode

```
CURRENT (Bad):
  └─ Session stored in IndexedDB
     ├─ Accessible to JavaScript
     ├─ Can be stolen by XSS attack
     ├─ Lasts 24 hours (too long!)
     └─ Security risk if device stolen

AFTER FIX (Good):
  └─ Session in httpOnly cookie
     ├─ NOT accessible to JavaScript
     ├─ Only sent to backend
     ├─ Lasts 1 hour
     └─ Secure even if device stolen
```

---

## 📁 File Structure Explained

### Frontend (`src/`)

```
src/
├── auth.js
│   └─ Functions: secureLogin(), secureLogout(), secureVerify()
│   └─ ISSUE: Stores session in IndexedDB (being fixed)
│   └─ FIX: Use httpOnly cookies only
│
├── db.js
│   └─ Database query functions
│   └─ Calls /api endpoints for data
│   └─ CHECK: Are all queries parameterized? No string concatenation?
│
├── state.js
│   └─ Global state management
│   └─ Stores: user, team, current organization
│   └─ WARNING: Don't store secrets here!
│
├── main.js
│   └─ Main app logic
│   └─ Entry point for React app
│
├── components/
│   ├─ Forms (login, expense, budget, etc)
│   ├─ Tables (user lists, expense lists, etc)
│   ├─ Modals (confirmation dialogs, etc)
│   └─ Navigation (menu, sidebar)
│
├── pages/
│   ├─ Dashboard
│   ├─ Expenses
│   ├─ Reports
│   ├─ Admin
│   └─ etc.
│
├── utils/
│   ├─ formatters (dates, money, etc)
│   ├─ helpers (calculations, etc)
│   └─ validation (input checks)
│
└── styles/
    └─ styles.css - All styling
```

### Backend (`api/`)

```
api/
├── auth/
│   ├─ login.js
│   │  └─ ISSUE: Hardcoded Supabase URL/key
│   │  └─ ISSUE: 7-day session (too long)
│   │  └─ ISSUE: Console logs secrets
│   │  └─ ISSUE: CORS allows all origins
│   │  └─ FIX: Use env vars, 1 hour sessions, remove logs, restrict CORS
│   │
│   ├─ logout.js
│   │  └─ Clear session/cookies
│   │
│   ├─ verify.js
│   │  └─ Check if user is still logged in
│   │  └─ Check: Does it re-issue tokens?
│   │
│   ├─ refresh.js
│   │  └─ Get new access token using refresh token
│   │
│   └─ migrate.js
│       └─ Migrate old localStorage tokens (legacy)
│
└── supabase-proxy.js
    ├─ Forward API requests to Supabase
    ├─ CRITICAL: Check authorization here
    ├─ This is where data access is controlled
    └─ Apply Row Level Security (RLS) policies
```

### Config (`supabase/`)

```
supabase/
└─ migrations/
   └─ SQL files that define tables, RLS policies, triggers
   └─ CRITICAL: Check if RLS policies exist
   └─ SECURITY: Ensure row-level security enforces data isolation
```

---

## 🔄 Component Relationships

### Who talks to whom?

```
React Component (e.g., ExpenseList)
    ↓ calls
    db.js (getExpenses function)
    ↓ calls
    /api/expenses endpoint
    ↓
Backend middleware
    ├─ Extract user from cookie
    ├─ Check authorization
    └─ Return 403 if not allowed
    ↓
supabase-proxy.js
    ├─ Call Supabase API with user context
    └─ Supabase RLS filters data
    ↓
Response back to component
    ↓
React renders the data
```

---

## 🛡️ Security Boundaries

```
┌─ SECURITY BOUNDARY 1: Frontend ←→ Backend ─┐
│  Everything crosses HTTPS                   │
│  - Use credentials: 'include'              │
│  - Cookies auto-sent with each request    │
│  - Never send auth tokens in URL or body  │
└────────────────────────────────────────────┘

┌─ SECURITY BOUNDARY 2: Backend ←→ Supabase ─┐
│  Every call must verify:                   │
│  - Is this user authenticated?             │
│  - Can this user access this data?         │
│  - Supabase RLS enforces final check       │
└────────────────────────────────────────────┘

┌─ SECURITY BOUNDARY 3: Supabase Database ───┐
│  Row Level Security (RLS) policies ensure:  │
│  - Users see only their data               │
│  - Managers see their team's data          │
│  - Admins see everything (but logged)      │
└────────────────────────────────────────────┘
```

---

## 🔌 API Endpoints

### Auth Endpoints

```
POST /api/auth/login
  Input: { email, password }
  Output: { user: {...}, expires_at: timestamp }
  Security: HTTPS only, rate-limited

GET /api/auth/verify
  Input: (none - uses cookie)
  Output: { authenticated: bool, user: {...} }
  Security: Checks cookie validity

POST /api/auth/logout
  Input: (none)
  Output: { success: true }
  Security: Clears cookies

POST /api/auth/refresh
  Input: (none - uses refresh cookie)
  Output: { user: {...} }
  Security: Issues new access token

POST /api/auth/migrate
  Input: { legacyToken: string }
  Output: { user: {...} }
  Security: Migrates old auth format
```

### Data Endpoints

```
GET /api/expenses?teamId=X
  Authorization: User must be in team X
  Filtering: Only returns user's expenses

PUT /api/expenses/:id
  Authorization: User must own this expense OR be manager
  Validation: All fields validated server-side

DELETE /api/expenses/:id
  Authorization: User must own this OR be admin
  Audit: Should log who deleted what

[... similar for budgets, reports, users, etc ...]
```

---

## 🗄️ Database Schema (Simplified)

```sql
-- User Accounts
users
├─ id (UUID, primary key)
├─ email (unique)
├─ password_hash (bcrypt hashed)
├─ role ('user', 'manager', 'admin')
├─ created_at
└─ RLS: Users see own data only

-- Organizations (NGOs/Teams)
organizations
├─ id (UUID)
├─ name
├─ created_by (user_id)
└─ RLS: Members can see their org data only

-- Team Members
team_members
├─ user_id
├─ organization_id
├─ role ('member', 'manager', 'admin')
└─ RLS: Users see their team members

-- Expenses
expenses
├─ id (UUID)
├─ organization_id
├─ user_id (who created it)
├─ amount
├─ category
├─ date
├─ receipt (file reference)
└─ RLS: Users see own expenses + their team's expenses

-- Budgets
budgets
├─ id (UUID)
├─ organization_id
├─ category
├─ allocated_amount
├─ fiscal_year
└─ RLS: Team members can see their budget allocations
```

---

## 🚀 Deployment Architecture

```
Development
  ├─ Local React dev server (npm run dev)
  ├─ Local Node.js API (http://localhost:3000/api)
  └─ Supabase staging/dev environment

Production
  ├─ Frontend: Deployed to Vercel/Netlify
  │  └─ Runs React build
  │  └─ Environment: VITE_API_URL=https://yourdomain.com/api
  │
  ├─ Backend: Deployed to Vercel/AWS/Netlify
  │  └─ Node.js API functions
  │  └─ Environment variables from .env.production
  │
  └─ Database: Supabase production
     └─ RLS policies enforced
     └─ Backups automated
     └─ SSL/TLS enforced
```

---

## 📊 Request/Response Flow Diagram

```
1. User Input (Frontend)
   ↓
2. Form Validation (Frontend - quick feedback)
   ↓
3. API Call with Credentials (Frontend)
   POST /api/expenses with headers:
   - Authorization: Bearer token (in cookie)
   - Content-Type: application/json
   ↓
4. Backend Receives Request
   - Extract user from cookie/token
   - Middleware checks authentication
   ↓
5. Authorization Check (Backend)
   - Does user.id own this data?
   - Does user.role allow this action?
   - Return 403 if not authorized
   ↓
6. Input Validation (Backend - CRITICAL)
   - Type checking
   - Length validation
   - Sanitization
   - Return 400 if invalid
   ↓
7. Database Query (Backend)
   - Use parameterized queries
   - Supabase RLS applies additional checks
   - Return 500 if database error
   ↓
8. Response (Backend)
   - Sanitize output (remove secrets)
   - Return 200 with data
   ↓
9. Frontend Receives Response
   - Update state
   - Render UI
   ↓
10. User Sees Result
```

---

## 🎯 Key Points for Claude

When working on this project:

1. **Always verify authorization** - User can only access own data
2. **Always validate input** - Server-side, not just frontend
3. **Always use httpOnly cookies** - Never JavaScript-accessible tokens
4. **Always check for SQL injection** - Use parameterized queries
5. **Always enforce HTTPS** - Redirect HTTP → HTTPS
6. **Always use environment variables** - No hardcoded secrets
7. **Always log securely** - Never log passwords/tokens/secrets
8. **Always handle errors safely** - Generic messages to users

---

## Version Info

- **Created**: September 2026
- **Architecture Version**: 3.0.0
- **Status**: Active - Being security hardened

**Next**: Read SECURITY.md for specific security requirements!
