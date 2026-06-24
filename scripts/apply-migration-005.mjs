/**
 * Applies supabase/migrations/005_refresh_matview_fn.sql via direct Postgres.
 * Requires SUPABASE_DB_PASSWORD in .env.local (Supabase → Settings → Database).
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvLocal() {
  const path = resolve(root, '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

loadEnvLocal();

const url = process.env.VITE_SUPABASE_URL ?? '';
const password = process.env.SUPABASE_DB_PASSWORD ?? '';
const refMatch = url.match(/https:\/\/([^.]+)\.supabase\.co/);
const projectRef = refMatch?.[1];

if (!projectRef) {
  console.error('Missing or invalid VITE_SUPABASE_URL in .env.local');
  process.exit(1);
}
if (!password) {
  console.error(
    'Missing SUPABASE_DB_PASSWORD in .env.local.\n' +
      'Add your database password from Supabase Dashboard → Project Settings → Database → Database password.',
  );
  process.exit(1);
}

const sqlPath = resolve(root, 'supabase/migrations/005_refresh_matview_fn.sql');
const sql = readFileSync(sqlPath, 'utf-8');

const connectionString =
  process.env.SUPABASE_DB_URL ??
  `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log('Connected to Supabase Postgres. Applying migration 005…');
  await client.query(sql);
  console.log('Migration applied: refresh_student_performance_summary()');

  const { rows } = await client.query(
    `SELECT proname FROM pg_proc WHERE proname = 'refresh_student_performance_summary'`,
  );
  if (rows.length) {
    console.log('Verified: function exists.');
    await client.query('SELECT public.refresh_student_performance_summary()');
    console.log('Materialized view refreshed successfully.');
  }
} catch (err) {
  console.error('Migration failed:', err.message);
  if (String(err.message).includes('password authentication failed')) {
    console.error('Check SUPABASE_DB_PASSWORD in .env.local (reset in Supabase if needed).');
  }
  if (String(err.message).includes('ENOTFOUND') || String(err.message).includes('timeout')) {
    console.error('Try setting SUPABASE_DB_URL to the full connection string from Supabase → Database → Connection string (URI).');
  }
  process.exit(1);
} finally {
  await client.end();
}
