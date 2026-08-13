# KManager Security Remediation Plan

This remediation plan outlines the technical changes required to address the confirmed vulnerabilities in the KManager application.

## 1. Vulnerability Matrix & Proposed Fixes

### KMAN-SEC-03 — Budget approval/payment workflow bypass (CRITICAL)
*   **Root Cause**: The database trigger `enforce_budget_plans_integrity` on the `budget_plans` table fails to validate that changes to `approval_status`, `paid_amount`, and `funding_notes` are initiated by the system's approval workflow/authorized roles.
*   **Affected Files/Migrations**: `supabase/migrations/` (new migration needed).
*   **Proposed Fix**: Create a new database trigger `trg_validate_budget_plans_state_changes` that runs `BEFORE UPDATE` on `public.budget_plans`. It will:
    1.  Permit modifications only if the caller has a valid, active workflow role assignment that targets the request at the current step (`public.user_can_act_on_approval_request`).
    2.  Allow state transitions to `APPROVED` or `PAID` only when executed by the system or a valid approver role mapping (`FIN`/`FIP`).
    3.  Assert that transitions out of `DRAFT` must be accompanied by an active `approval_requests` entry.
*   **Legitimate Workflows**: Approver approvals via `approveAndSendRequest`, `submitBudgetApproval` submissions, and admin alterations.
*   **Security Invariant**: Creators cannot transition their own `approval_status` to `APPROVED` or `PAID` without an accompanying valid, logged step approval.
*   **Regression Risks**: Legitimate final FIP payment status mappings failing.

---

### KMAN-SEC-01 & KMAN-SEC-02 — Stored XSS via Attachment URLs (HIGH)
*   **Root Cause**: Chat attachments (`konnect.js`) and approval comment attachments (`approval-portal.js`) render `attachment_url` directly inside anchor tag `href` attributes without validating the URI scheme.
*   **Affected Files**: `src/pages/konnect.js`, `src/pages/approval-portal.js`, and a new shared utility `src/utils/urlValidator.js`.
*   **Proposed Fix**:
    1.  Implement `src/utils/urlValidator.js` which exposes `safeAttachmentUrl(url)` to validate that the URI scheme belongs strictly to `http:` or `https:`. If it matches dangerous schemes like `javascript:`, `data:`, `vbscript:`, or `file:`, it returns `#` or `about:blank`.
    2.  Filter the final rendered `href` value in both UI components.
    3.  Improve `escapeHtmlAttr()` to safely escape single quotes `&#39;` and brackets.
*   **Legitimate Workflows**: Displaying standard bucket file links and external images.
*   **Security Invariant**: No dynamic link can execute dynamic client JavaScript context.

---

### KMAN-SEC-05 — SSRF via API Proxy Path parameter (HIGH)
*   **Root Cause**: `api/supabase-proxy.js` concatenates the client path parameter directly to target URL strings: `const targetUrl = `${SUPABASE_URL}${path}`;`.
*   **Affected Files**: `api/supabase-proxy.js`
*   **Proposed Fix**:
    1.  Use the native Node `URL` constructor to validate the destination.
    2.  Assert that `url.protocol === 'https:'` and `url.hostname` exactly matches the hostname of `SUPABASE_URL`.
    3.  Sanitize or reject paths that contain loopback authorities, credentials (`user:pass`), or path traversal attempts.
    4.  Configure `fetch` to reject redirects (`redirect: 'error'`) or validate that the redirect target belongs to the same origin.
*   **Legitimate Workflows**: Normal PostgREST reads and RPC operations via `/api/supabase-proxy?path=...`.
*   **Security Invariant**: The proxy only issues requests to the trusted Supabase API origin.

---

### KMAN-SEC-04 — Replay / Lack of Idempotency (LOW)
*   **Proposed Fix**: State-changing endpoints (such as budget creations) will verify unique payload hash bindings or reference existing workflow states in `approval_requests` to reject duplicate operations.

---

### Unbounded Konnect Message History & CORS Hardening (LOW / HARDENING)
*   **Proposed Fix**: Add a `.limit(50)` constraint to `messages` select parameters in `konnect.js`. The CORS handler in `api/supabase-proxy.js` will validate origins against a hardcoded trusted origin list.
