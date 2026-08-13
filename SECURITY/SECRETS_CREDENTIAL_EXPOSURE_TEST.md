# KManager Secrets, Credentials, Tokens, and Sensitive Data Exposure Report

## 1. Executive Summary
This report analyzes the KManager application's exposure of credentials, secrets, connection strings, and session tokens within the `KManager-test` workspace. The reconnaissance included scanning repository source files, configuration manifests, server-side API proxy handlers, and git-ignored categories.

The audit shows that the application **correctly separates public client-facing variables from sensitive credentials**. No privileged secrets (such as Supabase service_role keys, database passwords, or private signing keys) are hardcoded, committed to Git, or bundled into browser assets. Furthermore, user sessions are protected securely via `HttpOnly` and `Secure` cookies.

---

## 2. Environment Files & Git History (Part C & D)
*   **Environment Files**: No `.env`, `.env.local`, or similar environment variables files are tracked in the Git repository.
*   **Git History**: Checking historical commits shows no leaked connection strings or administrative passwords. 

---

## 3. Client Bundle Exposure Analysis (Part E)
*   **Verification**: A static analysis of Vite build configuration (`vite.config.js`) and built production assets in `dist/` was performed.
*   **Result**: No Supabase `service_role` keys, database passwords, or server-side API secrets are bundled into the compiled client JavaScript chunks. 

---

## 4. Supabase Credentials Classification (Part B & F)
*   **Exposed Keys**: The repository contains hardcoded values for `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `src/db.js` and `api/supabase-proxy.js`.
*   **JWT Decode Validation**:
    *   *Payload*: `{"iss":"supabase","ref":"nvhaetvreopkktlxxdwg","role":"anon",...}`
    *   *Classification*: **SAFE / EXPECTED**. The hardcoded token is the standard, public-facing, unprivileged Supabase anonymous key. Possessing this key does not grant administrative access. All sensitive table reads and modifications are guarded by server-side PostgreSQL Row-Level Security (RLS) filters.
*   **Server Fallbacks**: In `api/supabase-proxy.js`, environment variables (`process.env.SUPABASE_URL` and `process.env.SUPABASE_ANON_KEY`) are checked first, falling back to the hardcoded public keys if undefined. No service-role credentials exist in the fallback configurations.

---

## 5. Session Token Exposure Audit (Part G & H)
*   **Cookie Flags**: The authentication handler (`api/auth/login.js`) and token rotator (`api/supabase-proxy.js`) set both `sb-access-token` and `sb-refresh-token` with the following flags:
    `Path=/; HttpOnly; Secure; SameSite=Lax`
*   **Security Boundary**: Because the cookies are flagged as `HttpOnly`, browser-side JavaScript is completely blocked from accessing session tokens (e.g. via `document.cookie`), neutralizing token extraction via XSS.
*   **Storage Checks**: Access tokens and refresh tokens are **NOT** stored in local storage, session storage, browser history, or IndexedDB.
*   **URL Leakage**: No authentication tokens appear in URL query parameters, hash fragments, or HTTP redirect paths.

---

## 6. Logging Exposure (Part F)
*   **Console Logs**: In `api/supabase-proxy.js`, token rotation errors are logged using `console.error('Token rotation failed:', refreshError)`.
*   **Verification**: The logs print error metadata returned by Supabase Auth (e.g. expired tokens) but do **NOT** print raw JWT strings, passwords, or cookie values.

---

## 7. Results Inventory

### Safe & Expected Configurations
1.  **Client Supabase Anon Key (Safe / Expected)**: Hardcoded in `src/db.js` and `api/supabase-proxy.js`. Safe because it is unprivileged and relies on server-side RLS for access control.
2.  **HttpOnly Session Cookies (Safe / Expected)**: Session JWTs are stored in HttpOnly cookies, protecting them against browser-based extraction attacks.

### Vulnerabilities
*   **No credential exposure vulnerabilities were detected in this audit**.

---

## 8. Next Recommended Phase
Phase 6 — **Security Architecture and Remediation Summary**.
