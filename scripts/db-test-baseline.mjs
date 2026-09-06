import { Client } from 'pg';
import { readFileSync } from 'fs';

const TEST_SCHEMA = 'km_baseline_smoketest';
const raw = readFileSync('supabase/migrations/00000000000000_km_baseline_from_live_db.sql', 'utf-8');

// Split into sections by the "-- ===...\n-- Title\n-- ===...\n" headers this file uses.
const parts = raw.split(/\n-- ={10,}\n-- (.+)\n-- ={10,}\n/);
// parts[0] is the leading comment block before the first section; then alternating [title, body, title, body, ...]
const sections = [];
for (let i = 1; i < parts.length; i += 2) {
  sections.push({ title: parts[i], body: parts[i + 1] || '' });
}
console.log('Sections found:', sections.map(s => s.title));

// Skip the auth.uid()/auth.jwt() section entirely for this smoke test - it targets the
// real `auth` schema, which already has Supabase's own working versions live.
const keep = sections.filter(s => !s.title.startsWith('auth.uid()'));

// Generic dollar-quote-aware statement splitter: only split on a ';' that is NOT
// inside an open $tag$...$tag$ region (handles DO $$ ... $$ blocks, $function$
// bodies, or any other tag Postgres/pg_get_functiondef might use).
function splitStatements(title, body) {
  const sql = body.replace(/\bpublic\./g, `${TEST_SCHEMA}.`);
  const statements = [];
  let current = '';
  let openTag = null;
  let i = 0;
  while (i < sql.length) {
    if (openTag) {
      if (sql.startsWith(openTag, i)) {
        current += openTag;
        i += openTag.length;
        openTag = null;
        continue;
      }
      current += sql[i++];
      continue;
    }
    const tagMatch = /^\$[a-zA-Z_]*\$/.exec(sql.slice(i));
    if (tagMatch) {
      openTag = tagMatch[0];
      current += openTag;
      i += openTag.length;
      continue;
    }
    if (sql[i] === ';') {
      current += ';';
      statements.push(current.trim());
      current = '';
      i++;
      continue;
    }
    current += sql[i++];
  }
  if (current.trim()) statements.push(current.trim());
  return statements.filter(Boolean);
}

const client = new Client({ connectionString: process.env.DIRECT_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
  await client.query(`CREATE SCHEMA ${TEST_SCHEMA}`);
  // extensions: only needed because this Supabase project already has uuid-ossp/pgcrypto
  // installed in its own `extensions` schema - our CREATE EXTENSION IF NOT EXISTS correctly
  // no-ops against that, but this session's search_path needs to see it too. On a genuinely
  // fresh server (the real VPS target) this schema won't exist and isn't needed - the
  // extension there installs into `public` by default, which is already on the path.
  await client.query(`SET search_path TO ${TEST_SCHEMA}, public, extensions`);

  let ok = 0;
  const failed = [];
  for (const { title, body } of keep) {
    const statements = splitStatements(title, body);
    for (const stmt of statements) {
      try {
        await client.query(stmt.endsWith(';') ? stmt : stmt + ';');
        ok++;
      } catch (err) {
        failed.push({ section: title, stmt: stmt.slice(0, 200), error: err.message });
      }
    }
  }
  console.log(`OK: ${ok} statements, FAILED: ${failed.length}`);
  failed.forEach((f, i) => console.log(`\n[${i + 1}] (${f.section}) ${f.error}\n  in: ${f.stmt}`));
} finally {
  await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
  await client.end();
}
