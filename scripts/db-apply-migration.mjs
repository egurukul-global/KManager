import { Client } from 'pg';
import { readFileSync } from 'fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/db-apply-migration.mjs <path-to-sql-file>');
  process.exit(1);
}

const connectionString = process.env.DIRECT_DATABASE_URL;
if (!connectionString) {
  console.error('DIRECT_DATABASE_URL not set in .env');
  process.exit(1);
}

const sql = readFileSync(file, 'utf-8');
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  console.log(`Applied: ${file}`);
} catch (err) {
  console.error('FAILED:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
