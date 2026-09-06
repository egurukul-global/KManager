// Read-only introspection of the live Supabase Postgres database.
// Never writes, alters, or deletes anything - only SELECTs from system catalogs.
// Run with: node --env-file=.env scripts/db-introspect.mjs
import { Client } from 'pg';
import { writeFileSync } from 'fs';

const connectionString = process.env.DIRECT_DATABASE_URL;
if (!connectionString) {
  console.error('DIRECT_DATABASE_URL not set in .env');
  process.exit(1);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

const queries = {
  tables: `
    SELECT schemaname, tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname IN ('public', 'storage')
    ORDER BY schemaname, tablename;
  `,
  policies: `
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
    ORDER BY schemaname, tablename, policyname;
  `,
  functions: `
    SELECT n.nspname AS schema, p.proname AS name, p.prosecdef AS security_definer,
           pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    ORDER BY p.proname;
  `,
  triggers: `
    SELECT event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation, action_statement
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY event_object_table, trigger_name;
  `,
  columns: `
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `,
  grants: `
    SELECT table_schema, table_name, grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema IN ('public', 'storage') AND grantee IN ('anon', 'authenticated', 'service_role', 'public')
    ORDER BY table_schema, table_name, grantee;
  `,
  storage_buckets: `
    SELECT id, name, public, file_size_limit, allowed_mime_types
    FROM storage.buckets;
  `
};

const out = {};
try {
  await client.connect();
  for (const [key, sql] of Object.entries(queries)) {
    try {
      const res = await client.query(sql);
      out[key] = res.rows;
      console.log(`${key}: ${res.rows.length} rows`);
    } catch (err) {
      out[key] = { error: err.message };
      console.log(`${key}: ERROR - ${err.message}`);
    }
  }
} finally {
  await client.end();
}

writeFileSync('scripts/.db-live-state.json', JSON.stringify(out, null, 2), 'utf-8');
console.log('Written to scripts/.db-live-state.json');
