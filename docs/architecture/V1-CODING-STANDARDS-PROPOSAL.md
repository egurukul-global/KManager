# One Kailasa V2 Coding Standards Proposal

This document outlines the proposed coding standards, architectural rules, and engineering practices recommended for all future development starting from V2.

---

## 1. Architectural Rules

1.  **Strict MVC / Layer Separation**: Avoid mixing business logic, database queries, and DOM rendering in single files. Page files (e.g. `src/pages/*.js`) must only manage presentation and delegate data queries to API wrappers and state services.
2.  **API Data Fetching**: Never perform direct database calls or bypass the Vercel Proxy layer. All client queries to Supabase must utilize the proxy endpoint via the global custom `fetch` handler on the client wrapper.
3.  **IndexedDB Operations**: Use transaction blocks and batch updates for IndexedDB operations. Avoid reading the full database table (`store.getAll()`) for partial queries or deletions.

---

## 2. Engineering Practices & Coding Patterns

4.  **Component Isolation**: UI modules must be self-contained. Global objects (like `state` or toast indicators) should not be modified directly by internal UI subcomponents. Instead, emit events or use defined state mutation functions.
5.  **State Management**: Modifying `state` properties must trigger explicit observer notifications or UI updates rather than relying on full page updates (`showPage()`).
6.  **Offline Resilience**: All write operations must use the standard `sbInsert`, `sbUpdate`, or `sbSoftDelete` methods from [db.js](file:///c:/Users/user/Documents/GitHub/KManager-test/src/db.js) to guarantee offline synchronization.
7.  **Dynamic Imports**: Large external libraries (e.g. `cropperjs`, `tesseract.js`, `html2canvas`) must be loaded dynamically on demand using ESM `import()` only on pages where they are used, rather than being imported at startup.
8.  **Strict Error Handling**: Do not write silent `try/catch` handlers. All caught exceptions must be logged to a central reporting structure and surfaced to users via unified toast interfaces.
9.  **No Modals Leakage**: Ensure every dynamic modal appended to the document body is removed cleanly using `.remove()` when closing to prevent memory leaks and unresponsive UI overlay states.
10. **Mobile Layout Priority**: All visual elements must be card-based on viewport widths under `768px` and optimize tap target spacing for touch input.
