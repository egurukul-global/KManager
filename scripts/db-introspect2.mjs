import { Client } from 'pg';
import { writeFileSync } from 'fs';

const client = new Client({ connectionString: process.env.DIRECT_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const queries = {
  constraints: `
    SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
    ORDER BY conrelid::regclass::text, conname;
  `,
  indexes: `
    SELECT tablename AS table_name, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname;
  `,
  triggerdefs: `
    SELECT c.relname AS table_name, t.tgname AS trigger_name, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname = 'public'
    ORDER BY c.relname, t.tgname;
  `,
  extensions: `SELECT extname FROM pg_extension ORDER BY extname;`,
  sequences: `
    SELECT sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
    ORDER BY sequence_name;
  `
};

const out = {};
for (const [key, sql] of Object.entries(queries)) {
  const res = await client.query(sql);
  out[key] = res.rows;
  console.log(`${key}: ${res.rows.length} rows`);
}
await client.end();
writeFileSync('scripts/.db-live-state2.json', JSON.stringify(out, null, 2), 'utf-8');
console.log('Written scripts/.db-live-state2.json');
