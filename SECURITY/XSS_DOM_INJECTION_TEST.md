# KManager Cross-Site Scripting (XSS) and DOM Injection Testing Report

## 1. Executive Summary
This assessment maps the susceptibility of KManager to Cross-Site Scripting (XSS) and DOM Injection vulnerabilities in the `KManager-test` environment. Multiple stored XSS vulnerability sinks were identified—most notably within the **Konnect Messaging (Chat) and Approval Portal attachment link rendering**. Because these components display user-submitted metadata directly inside `href` attributes without validating the URL scheme, an attacker can store a payload that executes arbitrary JavaScript in the context of another authenticated user's browser session.

---

## 2. DOM Sink Inventory (Part A)
*   **`innerHTML`**:
    *   `src/pages/konnect.js` (Rendering message feeds and active chats)
    *   `src/pages/approval-portal.js` (Rendering comment timelines and detail rows)
    *   `src/pages/budgets.js` (Rendering lines and historical reviews)
    *   `src/pages/tasks.js` (Rendering Kanban board layouts and comments)
    *   `src/pages/expenses.js` (Rendering receipt preview grids)
*   **`href` / Attribute Sinks**:
    *   `src/pages/konnect.js:1017` (`<a href="${msg.attachment_url}">`)
    *   `src/pages/approval-portal.js:1183` (`<a href="${c.resolvedUrl}">`)
    *   `src/pages/tasks.js:947` (`<a href="${escapeHtml(viewUrl)}">`)
    *   `src/pages/expenses.js:951` (`<a href="${stored}">`)

---

## 3. Source-to-Sink Data-Flow Analysis (Part B)
User-supplied text (input from comment textareas, chat entry inputs, and attachment upload payloads) flows directly into PostgreSQL database tables (`public.messages`, `public.approval_comments`, `public.expense_attachments`).
When other users (e.g., Finance, Team Leads, or general workflow participants) load their dashboard, portal, or chat feeds:
1.  The client app fetches records via `supabase-proxy.js`.
2.  The retrieved JSON object (containing unsanitized `attachment_url` values) is concatenated directly into HTML templates.
3.  The templates are assigned to DOM container nodes via `.innerHTML`.
4.  If the payload contains a malicious URI scheme, user interaction triggers JavaScript execution.

---

## 4. Escaping/Sanitization Function Analysis (Part C)
*   **`escapeHtml` Function**:
    ```javascript
    function escapeHtml(text) {
      return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
    ```
    *   *HTML Text Context*: **Safe**.
    *   *HTML Attribute Context*: **Safe**.
    *   *URI Scheme Context*: **Vulnerable**. It does not inspect or validate URI schemes (e.g., allowing `javascript:`, `data:`).
*   **`escapeHtmlAttr` Function** (defined in `budgets.js` and `dashboard.js`):
    ```javascript
    function escapeHtmlAttr(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
    }
    ```
    *   *HTML Attribute Context*: **Vulnerable**. It fails to escape the single quote (`'`), meaning that if a template context binds attributes inside single quotes, breakout is possible.
    *   *Characters Escaped*: Only `&`, `"`, and `<` are replaced.

---

## 5. Stored & Reflected XSS Test Results (Part D, E, F, G)
*   **Stored XSS via Chat Attachment Link**:
    *   *Method*: Sending a message payload with `attachment_url` set to `javascript:alert(document.domain)`.
    *   *Result*: **Vulnerable**. The link renders as `<a href="javascript:alert(document.domain)" ...>`. When any user in the chat channel clicks the attachment icon, the JavaScript executes.
*   **Stored XSS via Approval Comments / Clarifications**:
    *   *Method*: Submitting an approval action containing a receipt attachment override referencing `javascript:alert(document.domain)`.
    *   *Result*: **Vulnerable**. The fallback handler in `approval-portal.js` renders the link as-is inside `href`, allowing payload execution on click.

---

## 6. Konnect / Chat Injection Details (Part H)
*   **Message Body**: Successfully sanitized by `escapeHtml(msg.body)`.
*   **Attachment Link**: **Unescaped**. Vulnerable to `javascript:` scheme injection.
*   **Metadata & Reply Quotes**: Properly escaped using `escapeHtml(msg.metadata.reply_to.body)`.

---

## 7. IndexedDB & Offline Injection (Part I)
*   **Local Caches**: Local caches populate the same DOM templates. An attacker who can write to local IndexedDB storage can execute XSS payloads locally on screen mount. However, this is limited to self-exploitation unless the payload is synced to the database.

---

## 8. Confirmed Vulnerabilities (Part J)

### [Finding ID: KMAN-SEC-01] Stored XSS via Chat Attachment URL
*   **Severity**: **HIGH**
*   **Source**: User-controlled `attachment_url` parameter in message payloads.
*   **Sink**: `src/pages/konnect.js` (Line 1017: `<a href="${msg.attachment_url}">`)
*   **Attack Prerequisite**: Authenticated access to any team chat.
*   **Harmless Proof-of-Concept Payload**: `javascript:alert(document.domain)`
*   **Reproduction Steps**:
    1.  Submit a message to a channel with `attachment_url` set to `javascript:alert(document.domain)`.
    2.  Other channel members receive the message.
    3.  When a member clicks the attachment link, the JavaScript executes.
*   **Affected Parties**: Any team member reading the channel.
*   **Potential Impact**: Session hijacking, malicious action triggering, or CSRF simulation in the context of other users.

### [Finding ID: KMAN-SEC-02] Stored XSS via Approval Comment Attachment URL
*   **Severity**: **HIGH**
*   **Source**: User-controlled `attachment_url` in approval comment schemas.
*   **Sink**: `src/pages/approval-portal.js` (Line 1183: `<a href="${c.resolvedUrl}">`)
*   **Attack Prerequisite**: Authenticated role access to approval flows.
*   **Harmless Proof-of-Concept Payload**: `javascript:alert(document.domain)`
*   **Reproduction Steps**:
    1.  Create an approval comment with an `attachment_url` set to `javascript:alert(document.domain)`.
    2.  An auditor/approver inspects the request timeline.
    3.  Clicking the attachment link triggers script execution.

---

## 9. Next Recommended Phase
Phase 4 — **Remediation & Verification** (implementing URL scheme validation and escaping improvements).
