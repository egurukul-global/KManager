import { Client } from 'pg';
import { writeFileSync } from 'fs';

const client = new Client({ connectionString: process.env.DIRECT_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const res = await client.query(`
  SELECT table_name, column_name, ordinal_position, data_type, udt_name,
         character_maximum_length, numeric_precision, numeric_scale,
         is_nullable, column_default, is_identity, identity_generation
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position;
`);
console.log(`columns_detailed: ${res.rows.length} rows`);
await client.end();
writeFileSync('scripts/.db-columns-detailed.json', JSON.stringify(res.rows, null, 2), 'utf-8');
