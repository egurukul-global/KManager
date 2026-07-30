# Agent Rules

1. **Database Documentation Sync**: Whenever you make a database schema change, you must:
   * Write/modify the SQL migration file in `supabase/migrations/`.
   * Update the `docs/database_documentation.md` file in the repository to reflect the changes (new columns, tables, functions, triggers, or RLS policies).

2. **Work Directory Constraint**: Always work, edit files, and build/run commands ONLY in the `KManager-test` directory. Do not modify files in the main `KManager` directory until the feature has been fully implemented, tested, and explicitly approved by the user for migration.
