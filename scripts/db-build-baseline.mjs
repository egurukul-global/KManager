import { readFileSync, writeFileSync } from 'fs';

const state1 = JSON.parse(readFileSync('scripts/.db-live-state.json', 'utf-8'));
const state2 = JSON.parse(readFileSync('scripts/.db-live-state2.json', 'utf-8'));
const columnsDetailed = JSON.parse(readFileSync('scripts/.db-columns-detailed.json', 'utf-8'));
const scope = JSON.parse(readFileSync('scripts/.km-scope.json', 'utf-8'));

const KM_TABLES = new Set(scope.confirmed);
const KM_FUNCTION_NAMES = new Set(scope.kmFunctionNames);

function pgType(col) {
  if (col.data_type === 'ARRAY') {
    const base = col.udt_name.startsWith('_') ? col.udt_name.slice(1) : col.udt_name;
    return `${base}[]`;
  }
  if (col.data_type === 'USER-DEFINED') return col.udt_name;
  if (col.data_type === 'numeric' && col.numeric_precision != null) {
    return col.numeric_scale != null
      ? `numeric(${col.numeric_precision},${col.numeric_scale})`
      : `numeric(${col.numeric_precision})`;
  }
  if ((col.data_type === 'character varying' || col.data_type === 'character') && col.character_maximum_length != null) {
    return `${col.data_type}(${col.character_maximum_length})`;
  }
  return col.data_type;
}

const lines = [];
const section = (title) => lines.push(`\n-- ============================================================\n-- ${title}\n-- ============================================================\n`);

lines.push(`-- KManager baseline schema, reconstructed from the LIVE Supabase database on 2026-09-06.`);
lines.push(`-- This replaces the untrustworthy 87-file migration history (only 33 of 96 live tables`);
lines.push(`-- had any matching CREATE TABLE in that history - see PROGRESS.md Phase 3.5).`);
lines.push(`-- Scope: KManager's own ${KM_TABLES.size} tables only. This Supabase project also hosts`);
lines.push(`-- unrelated apps (an LMS, a chanting app, an ops tracker, a password vault) - their`);
lines.push(`-- tables/functions are deliberately excluded, verified by checking actual function`);
lines.push(`-- bodies and app code usage, not by guessing from table names.`);
lines.push(`-- Intended target: self-hosted Postgres + PostgREST (matches the existing RLS +`);
lines.push(`-- auth.uid()-via-JWT-claims design, which is native PostgREST behavior, not Supabase-`);
lines.push(`-- proprietary). auth.uid()/auth.jwt() helper functions still need to be defined on the`);
lines.push(`-- new server - see the note near the top of the Functions section below.`);

section('Extensions');
for (const e of state2.extensions) {
  if (e.extname === 'plpgsql') continue; // always present by default
  lines.push(`CREATE EXTENSION IF NOT EXISTS "${e.extname}";`);
}

section('Roles (required by PostgREST convention - anon/authenticated/service_role)');
lines.push(`DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;`);

section('auth.uid() / auth.jwt() - PostgREST-compatible reimplementation of what Supabase provides');
lines.push(`-- Supabase's own auth.uid()/auth.jwt() are just thin wrappers over the exact same`);
lines.push(`-- request.jwt.claims GUC that vanilla PostgREST sets per request when using JWT auth -`);
lines.push(`-- this is why the existing RLS design ports over almost unchanged. Recreating them here`);
lines.push(`-- so every policy/function below that calls auth.uid() keeps working as-is.`);
lines.push(`CREATE SCHEMA IF NOT EXISTS auth;`);
lines.push(`CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('request.jwt.claims', true), '{}')::jsonb;
$$;`);
lines.push(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid;
$$;`);

section(`Tables - bare columns only (constraints added in a later pass, after all tables exist)`);
const colsByTable = {};
for (const c of columnsDetailed) {
  if (!KM_TABLES.has(c.table_name)) continue;
  (colsByTable[c.table_name] ||= []).push(c);
}
for (const [table, cols] of Object.entries(colsByTable)) {
  const colDefs = cols.map(c => {
    let def = `  ${c.column_name} ${pgType(c)}`;
    if (c.is_identity === 'YES') {
      def += ` GENERATED ${c.identity_generation} AS IDENTITY`;
    } else if (c.column_default) {
      def += ` DEFAULT ${c.column_default}`;
    }
    if (c.is_nullable === 'NO') def += ` NOT NULL`;
    return def;
  });
  lines.push(`CREATE TABLE IF NOT EXISTS public.${table} (\n${colDefs.join(',\n')}\n);`);
}

section('Constraints, pass 1: PRIMARY KEY / UNIQUE / CHECK (must precede any FK that references them)');
const kmConstraints = state2.constraints.filter(c => KM_TABLES.has(c.table_name.replace(/^public\./, '')));
for (const c of kmConstraints) {
  if (c.def.startsWith('FOREIGN KEY')) continue;
  const table = c.table_name.replace(/^public\./, '');
  lines.push(`ALTER TABLE public.${table} ADD CONSTRAINT ${c.conname} ${c.def};`);
}

section('Constraints, pass 2: FOREIGN KEY (needs every table\'s own PK/UNIQUE to already exist)');
for (const c of kmConstraints) {
  if (!c.def.startsWith('FOREIGN KEY')) continue;
  const table = c.table_name.replace(/^public\./, '');
  lines.push(`ALTER TABLE public.${table} ADD CONSTRAINT ${c.conname} ${c.def};`);
}

section('Indexes');
for (const i of state2.indexes) {
  if (!KM_TABLES.has(i.table_name)) continue;
  if (i.indexdef.includes(' UNIQUE INDEX ') && state2.constraints.some(c => c.conname === i.indexname)) continue; // already created by its constraint
  lines.push(`${i.indexdef};`);
}

section(`Functions (${KM_FUNCTION_NAMES.size} of ${state1.functions.length} total - KManager scope only)`);
lines.push(`-- Must come AFTER tables: some are LANGUAGE sql functions, which Postgres`);
lines.push(`-- type-checks against the catalog at CREATE time (unlike plpgsql, which only`);
lines.push(`-- validates its body at first execution) - they'd fail here if their tables`);
lines.push(`-- didn't exist yet. Found this the hard way via the isolated-schema smoke test.`);
for (const f of state1.functions) {
  if (!KM_FUNCTION_NAMES.has(f.name)) continue;
  lines.push(f.definition + ';');
}

section('Row Level Security - enable on every KManager table');
for (const t of KM_TABLES) {
  lines.push(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
}

section('Policies');
for (const p of state1.policies) {
  if (p.schemaname !== 'public' || !KM_TABLES.has(p.tablename)) continue;
  const roles = p.roles.replace(/[{}]/g, '');
  let stmt = `CREATE POLICY ${JSON.stringify(p.policyname).replace(/"/g, '"')} ON public.${p.tablename} AS ${p.permissive} FOR ${p.cmd} TO ${roles}`;
  if (p.qual) stmt += ` USING (${p.qual})`;
  if (p.with_check) stmt += ` WITH CHECK (${p.with_check})`;
  lines.push(stmt + ';');
}

section('Triggers');
for (const t of state2.triggerdefs) {
  if (!KM_TABLES.has(t.table_name)) continue;
  lines.push(t.def + ';');
}

section('Grants (anon/authenticated/service_role - required for PostgREST to expose these tables)');
const grantsByTable = {};
for (const g of state1.grants) {
  if (g.table_schema !== 'public' || !KM_TABLES.has(g.table_name)) continue;
  if (!['anon', 'authenticated', 'service_role'].includes(g.grantee)) continue;
  const key = `${g.table_name}|${g.grantee}`;
  (grantsByTable[key] ||= []).push(g.privilege_type);
}
for (const [key, privs] of Object.entries(grantsByTable)) {
  const [table, grantee] = key.split('|');
  lines.push(`GRANT ${privs.join(', ')} ON public.${table} TO ${grantee};`);
}
lines.push(`GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;`);
lines.push(`GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;`);

writeFileSync('supabase/migrations/00000000000000_km_baseline_from_live_db.sql', lines.join('\n') + '\n', 'utf-8');
console.log(`Written supabase/migrations/00000000000000_km_baseline_from_live_db.sql (${lines.length} lines)`);
