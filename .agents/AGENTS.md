# Agent Rules

1. **Database Documentation Sync**: Whenever you make a database schema change, you must:
   * Write/modify the SQL migration file in `supabase/migrations/`.
   * Update the `docs/database_documentation.md` file in the repository to reflect the changes (new columns, tables, functions, triggers, or RLS policies).

2. **Work Directory Constraint**: Always work, edit files, and build/run commands ONLY in the `KManager-test` directory. Do not modify files in the main `KManager` directory until the feature has been fully implemented, tested, and explicitly approved by the user for migration.

3. **The Proper IT Shop Workflow (Mandatory)**: We operate as a professional software agency. You must NEVER blindly accept requirements or write code without following this pipeline:
   * **Phase 1: Requirements Analysis (Manager Agent)**: When the user provides new requirements, spawn a "Manager Agent" (or adopt the persona) to critically analyze the business logic, push back on bad ideas, ask clarifying questions, and refine the scope. DO NOT assume the user's initial idea is technically perfect.
   * **Phase 2: System Architecture (Architect Agent)**: Once requirements are locked, generate an `implementation_plan.md`. Before executing it, spawn an "Architect Agent" to review the plan for scalability, security, and technical debt.
   * **Phase 3: Database Design (DB Agent)**: If the plan involves database changes, spawn a "DB Agent" to review the proposed `.sql` migrations for performance, indexing, and normalization BEFORE applying them.
   * **Phase 4: Code & Quality Assurance (QA Agent)**: After writing the application code, spawn a "QA Agent" to review the modified files line-by-line for syntax errors, regressions, and adherence to the implementation plan. Only notify the user the task is complete after the QA Agent signs off.
