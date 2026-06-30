/**
 * Standalone migration runner for the Saved Search Service.
 *
 * Applies migrations/*.sql in lexicographic order against the database
 * referenced by DATABASE_URL. Each statement file uses idempotent
 * `CREATE TABLE/INDEX IF NOT EXISTS`, so re-running is safe.
 *
 *   pnpm --filter @shop/saved-search-service db:migrate
 */
import { readFileSync, readdirSync } from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pool = new Pool({ connectionString: url });
  try {
    for (const file of files) {
      const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
      // eslint-disable-next-line no-console
      console.log(`Applying migration: ${file}`);
      await pool.query(sql);
    }
    // eslint-disable-next-line no-console
    console.log(`Applied ${files.length} migration(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Migration failed:', err);
  process.exit(1);
});
