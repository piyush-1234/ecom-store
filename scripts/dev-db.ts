/**
 * Local development PostgreSQL — no Docker, no global install.
 *
 * Uses `embedded-postgres`, which ships platform-specific Postgres binaries as an
 * optional dependency, so the cluster lives entirely inside this repo (`.pgdata/`,
 * gitignored).
 *
 * Usage:
 *   npm run dev:db            # start (initialises on first run)
 *   Ctrl+C                    # stop
 *
 * Then point DATABASE_URL at it:
 *   postgresql://postgres:postgres@localhost:5433/store?schema=public
 *
 * Why this exists: the authoring/admin environment had neither Docker nor a system
 * PostgreSQL, which blocked migrations and seeding (BLOCKERS.md BLK-009). This keeps the
 * "clone and run" promise true without requiring an install or admin rights.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PG_PORT ?? 5433);
const DATA_DIR = path.resolve(process.env.PG_DATA_DIR ?? '.pgdata');
const USER = process.env.PG_USER ?? 'postgres';
const PASSWORD = process.env.PG_PASSWORD ?? 'postgres';
const DATABASE = process.env.PG_DATABASE ?? 'store';

async function main(): Promise<void> {
  // ESM-only package: import dynamically so this works under tsx's CJS interop.
  const { default: EmbeddedPostgres } = await import('embedded-postgres');

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    port: PORT,
    user: USER,
    password: PASSWORD,
    persistent: true,
    authMethod: 'scram-sha-256',
    // UTF8 is non-negotiable for a commerce database: product names, addresses and
    // the rupee sign must round-trip. The Windows default locale produces WIN1252,
    // which cannot store those characters and breaks migrations on import.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: (message: string) => console.log(String(message).trimEnd()),
    onError: (error: unknown) => console.error('[pg]', error),
  });

  const alreadyInitialised = existsSync(path.join(DATA_DIR, 'PG_VERSION'));

  if (alreadyInitialised) {
    console.log(`[pg] existing cluster found at ${DATA_DIR}`);
  } else {
    console.log(`[pg] initialising cluster at ${DATA_DIR}`);
    await pg.initialise();
  }

  console.log(`[pg] starting on port ${PORT}`);
  await pg.start();

  try {
    await pg.createDatabase(DATABASE);
    console.log(`[pg] created database "${DATABASE}"`);
  } catch {
    // Already exists — fine on every subsequent run.
    console.log(`[pg] database "${DATABASE}" already exists`);
  }

  console.log('');
  console.log('  PostgreSQL ready');
  console.log(`  DATABASE_URL=postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}?schema=public`);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[pg] received ${signal}, stopping…`);
    try {
      await pg.stop();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Keep the process (and therefore the cluster) alive.
  await new Promise<void>(() => {
    /* never resolves */
  });
}

main().catch((error) => {
  console.error('[pg] failed to start:', error);
  process.exit(1);
});
