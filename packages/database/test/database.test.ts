import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTestDatabase} from '../src/testing.js';
import {migrate, withTransaction} from '../src/index.js';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'huoyoupu-migrations-'));
  await writeFile(join(directory, '0001_fixture.sql'), 'CREATE TABLE fixture (id integer PRIMARY KEY, quantity bigint NOT NULL CHECK (quantity >= 0)); INSERT INTO fixture VALUES (1, 5);');
  const database = await createTestDatabase({migrationsDirectory: directory});
  return {...database, directory, cleanup: async () => { await database.cleanup(); await rm(directory, {recursive: true, force: true}); }};
}

test('real PostgreSQL empty databases rebuild independently with transactional migration and checksums', async () => {
  const first = await fixture();
  const second = await fixture();
  try {
    assert.notEqual(first.name, second.name);
    assert.match(String((await first.pool.query('SELECT version()')).rows[0].version), /PostgreSQL/);
    await first.pool.query('UPDATE fixture SET quantity = 2');
    assert.equal((await second.pool.query('SELECT quantity FROM fixture')).rows[0].quantity, '5');
    assert.deepEqual(await migrate(first.pool, first.directory), []);
    await assert.rejects(first.pool.query('UPDATE fixture SET quantity = -1'), {code: '23514'});
    await writeFile(join(first.directory, '0001_fixture.sql'), '-- changed after apply');
    await assert.rejects(migrate(first.pool, first.directory), /Changed applied migration/);
  } finally { await first.cleanup(); await second.cleanup(); }
});

test('failed migration rolls back schema and tracking, then corrected file can apply', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'huoyoupu-migrations-'));
  const database = await createTestDatabase({migrate: false});
  try {
    await writeFile(join(directory, '0001_broken.sql'), 'CREATE TABLE rolled_back (id integer); SELECT missing_column;');
    await assert.rejects(migrate(database.pool, directory), {code: '42703'});
    assert.equal((await database.pool.query("SELECT to_regclass('rolled_back') AS name")).rows[0].name, null);
    assert.equal((await database.pool.query("SELECT to_regclass('schema_migrations') AS name")).rows[0].name, null);
    await writeFile(join(directory, '0001_broken.sql'), 'CREATE TABLE rolled_back (id integer);');
    assert.deepEqual(await migrate(database.pool, directory), ['0001_broken.sql']);
  } finally { await database.cleanup(); await rm(directory, {recursive: true, force: true}); }
});

test('real row locks reject competing transaction and failed transaction preserves original state', async () => {
  const database = await fixture();
  const owner = await database.pool.connect();
  const competitor = await database.pool.connect();
  try {
    await owner.query('BEGIN');
    await owner.query('SELECT * FROM fixture WHERE id=1 FOR UPDATE');
    await competitor.query('BEGIN');
    await competitor.query("SET LOCAL lock_timeout = '100ms'");
    await assert.rejects(competitor.query('UPDATE fixture SET quantity=quantity-4 WHERE id=1'), {code: '55P03'});
    await competitor.query('ROLLBACK');
    await owner.query('UPDATE fixture SET quantity=quantity-4 WHERE id=1');
    await owner.query('COMMIT');
    await assert.rejects(withTransaction(database.pool, async client => {
      await client.query('UPDATE fixture SET quantity=0 WHERE id=1');
      throw new Error('whole operation fails');
    }), /whole operation fails/);
    assert.equal((await database.pool.query('SELECT quantity FROM fixture WHERE id=1')).rows[0].quantity, '1');
  } finally { owner.release(); competitor.release(); await database.cleanup(); }
});

test('project migrations apply from empty database and replay safely', async () => {
  const database = await createTestDatabase();
  try {
    assert.deepEqual(await migrate(database.pool), []);
    const tracked = await database.pool.query('SELECT name FROM schema_migrations ORDER BY name');
    assert.ok(Array.isArray(tracked.rows));
  } finally { await database.cleanup(); }
});
