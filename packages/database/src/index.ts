import pg, {type Pool, type PoolClient, type PoolConfig} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
export {migrate} from './migrate.js';

export function createDatabase(connectionString: string, options: Omit<PoolConfig, 'connectionString'> = {}) {
  const pool = new pg.Pool({...options, connectionString});
  return {pool, db: drizzle(pool)};
}

/** All statements in work must use this client, never pool.query. */
export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let destroyed = false;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { destroyed = true; client.release(true); throw error; }
    throw error;
  } finally {
    if (!destroyed) client.release();
  }
}
