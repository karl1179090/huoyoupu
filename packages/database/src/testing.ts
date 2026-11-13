import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {migrate} from './migrate.js';

/** Requires a PostgreSQL role with CREATEDB. Never clears the supplied database. */
export async function createTestDatabase(options: {adminUrl?: string; migrationsDirectory?: string; migrate?: boolean} = {}) {
  const adminUrl = options.adminUrl ?? process.env.TEST_DATABASE_URL;
  if (!adminUrl) throw new Error('TEST_DATABASE_URL is required; run npm run test:db for an isolated PostgreSQL instance');
  const name = `huoyoupu_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({connectionString: adminUrl, max: 1});
  try { await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`); }
  catch (error) { await admin.end(); throw error; }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({connectionString: url.toString(), max: 8});
  const connected = new Set<pg.PoolClient>();
  pool.on('connect', client => {connected.add(client);});
  pool.on('remove', client => {connected.delete(client);});
  let cleanupResult: Promise<void> | undefined;
  const cleanup = (): Promise<void> => cleanupResult ??= (async () => {
    // pg-pool resolves end() when clients are removed from its list; the remove
    // event follows the physical client.end callback. Wait for both boundaries.
    await new Promise<void>((resolve, reject) => {
      let ended = false;
      const complete = () => {
        if (ended && connected.size === 0) {
          pool.off('remove', complete);
          resolve();
        }
      };
      pool.on('remove', complete);
      pool.end().then(() => {ended = true; complete();}, reject);
    });
    // All owned sockets have closed. Do not forcibly kill a closing backend.
    try { await admin.query(`DROP DATABASE "${name}"`); }
    finally { await admin.end(); }
  })();
  try {
    if (options.migrate !== false) await migrate(pool, options.migrationsDirectory);
    return {name, url: url.toString(), pool, cleanup};
  } catch (error) { await cleanup(); throw error; }
}
