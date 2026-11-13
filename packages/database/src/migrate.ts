import {createHash} from 'node:crypto';
import {readdir, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import type {Pool} from 'pg';

/** SQL migrations are immutable, ordered by filename, and committed as one atomic upgrade. */
export async function migrate(pool: Pool, directory = fileURLToPath(new URL('../migrations/', import.meta.url))): Promise<string[]> {
  const files = (await readdir(directory)).filter(file => /^\d+_[a-z0-9_-]+\.sql$/.test(file)).sort();
  const migrations = await Promise.all(files.map(async name => {
    const sql = await readFile(join(directory, name), 'utf8');
    return {name, sql, checksum: createHash('sha256').update(sql).digest('hex')};
  }));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [384191891]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const applied = await client.query<{name: string; checksum: string}>('SELECT name, checksum FROM schema_migrations ORDER BY name');
    const known = new Map(applied.rows.map(row => [row.name, row.checksum]));
    for (const row of applied.rows) {
      if (!migrations.some(migration => migration.name === row.name)) throw new Error(`Missing applied migration: ${row.name}`);
    }
    const completed: string[] = [];
    for (const migration of migrations) {
      const previous = known.get(migration.name);
      if (previous !== undefined) {
        if (previous !== migration.checksum) throw new Error(`Changed applied migration: ${migration.name}`);
        continue;
      }
      if (applied.rows.some(row => row.name > migration.name)) throw new Error(`Out-of-order migration: ${migration.name}`);
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]);
      completed.push(migration.name);
    }
    await client.query('COMMIT');
    return completed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
