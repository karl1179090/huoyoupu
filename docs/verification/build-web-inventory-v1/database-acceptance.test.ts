import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir, userInfo} from 'node:os';
import {join} from 'node:path';
import pg from 'pg';
import {createTestDatabase} from '../../../packages/database/src/testing.js';
import {migrate} from '../../../packages/database/src/migrate.js';

test('independent acceptance: real PostgreSQL isolates fixtures, serializes concurrent migrations and cleans failed databases', async t => {
  const root = await mkdtemp(join(tmpdir(), 'huoyoupu-acceptance-pg-'));
  const data = join(root, 'data');
  const socket = join(root, 'socket');
  const migrations = join(root, 'migrations');
  const pgBin = process.env.PG_BIN ?? '/opt/homebrew/opt/postgresql@18/bin';
  let started = false;
  let admin: pg.Pool | undefined;
  await mkdir(socket);
  await mkdir(migrations);
  t.after(async () => {
    await admin?.end();
    if (started) execFileSync(join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], {stdio: 'pipe'});
    await rm(root, {recursive: true, force: true});
  });
  execFileSync(join(pgBin, 'initdb'), ['-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8'], {stdio: 'pipe'});
  execFileSync(join(pgBin, 'pg_ctl'), ['-D', data, '-l', join(root, 'server.log'), '-o', `-F -h '' -k ${socket}`, '-w', 'start'], {stdio: 'pipe'});
  started = true;
  const url = new URL(`postgresql://${encodeURIComponent(userInfo().username)}@localhost/postgres`);
  url.searchParams.set('host', socket);
  const adminUrl = url.toString();
  admin = new pg.Pool({connectionString: adminUrl});
  assert.match((await admin.query('SELECT version()')).rows[0].version, /PostgreSQL 18/);
  await writeFile(join(migrations, '001_fixture.sql'), 'CREATE TABLE probe (id integer PRIMARY KEY, quantity bigint NOT NULL CHECK (quantity BETWEEN 0 AND 9007199254740991)); INSERT INTO probe VALUES (1, 5);');
  const fixture = await createTestDatabase({adminUrl, migrate: false});
  try {
    const results = await Promise.all([migrate(fixture.pool, migrations), migrate(fixture.pool, migrations)]);
    assert.deepEqual(results.map(items => items.length).sort(), [0, 1]);
    assert.equal((await fixture.pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count, '1');
    await assert.rejects(fixture.pool.query('UPDATE probe SET quantity=9007199254740992'), {code: '23514'});
    await assert.rejects(fixture.pool.query('INSERT INTO probe VALUES (1, 3)'), {code: '23505'});
  } finally { await fixture.cleanup(); }
  const before = await admin.query("SELECT datname FROM pg_database WHERE datname LIKE 'huoyoupu_test_%' ORDER BY datname");
  assert.equal(before.rows.length, 0);
  await writeFile(join(migrations, '002_broken.sql'), 'CREATE TABLE must_rollback (id integer); SELECT definitely_missing;');
  await assert.rejects(createTestDatabase({adminUrl, migrationsDirectory: migrations}), {code: '42703'});
  const after = await admin.query("SELECT datname FROM pg_database WHERE datname LIKE 'huoyoupu_test_%' ORDER BY datname");
  assert.deepEqual(after.rows, before.rows, 'failed fixture creation must remove only its own database');
});
