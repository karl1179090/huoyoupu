import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parseSchema} from '@huoyoupu/contracts';
import {apiFixture, origin, password, writeHeaders} from './helpers.js';
import {createTestDatabase} from '@huoyoupu/database/testing';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {initializeAdministrator} from '../src/modules/auth/service.js';

test('anonymous challenge, credential validation, secure cookie rotation, and immediate session state', async t => {
  const fixture = await apiFixture();
  const {app, pool} = fixture;
  try {
    await t.test('anonymous only obtains CSRF challenge; protected API rejects before body validation', async () => {
      const response = await app.inject({url: '/api/v1/auth/session'});
      assert.equal(response.statusCode, 200);
      assert.equal(parseSchema('Session', response.json()).user, null);
      assert.match(String(response.headers['set-cookie']), /__Host-huoyoupu_session=.*; Path=\/; HttpOnly; Secure; SameSite=Strict/);
      assert.equal((await app.inject({url: '/api/v1/users'})).statusCode, 401);
      assert.equal((await app.inject({method: 'POST', url: '/api/v1/users', payload: {unknown: true}})).statusCode, 401);
    });
    await t.test('unknown user, wrong password and inactive account return the same credential failure', async () => {
      for (const loginName of ['admin', 'does-not-exist']) {
        const challenge = await app.inject({url: '/api/v1/auth/session'});
        const response = await app.inject({method: 'POST', url: '/api/v1/auth/login', headers: {cookie: String(challenge.headers['set-cookie']).split(';')[0]!, origin, 'x-csrf-token': challenge.json().csrfToken}, payload: {loginName, password: 'incorrect'}});
        assert.equal(response.statusCode, 401);
        assert.equal(response.json().message, '账号或密码错误');
        assert.ok(!response.body.includes('password_hash'));
      }
    });
    const admin = await fixture.login();
    await t.test('login rotates anonymous session and secrets are stored only as hashes', async () => {
      assert.notEqual(admin.cookie, admin.anonymousCookie);
      assert.notEqual(admin.csrf, admin.anonymousCsrf);
      assert.equal((await app.inject({url: '/api/v1/users', headers: {cookie: admin.anonymousCookie}})).statusCode, 401);
      assert.deepEqual(Object.keys(admin.user).sort(), ['active', 'id', 'loginName', 'role', 'version']);
      const rows = await pool.query('SELECT token_hash,csrf_token_hash FROM sessions');
      for (const row of rows.rows) {
        assert.match(row.token_hash, /^[a-f0-9]{64}$/);
        assert.match(row.csrf_token_hash, /^[a-f0-9]{64}$/);
        assert.notEqual(row.csrf_token_hash, admin.csrf);
      }
      assert.ok(!(await pool.query('SELECT password_hash FROM users')).rows[0].password_hash.includes(password));
    });
    await t.test('origin and CSRF are mandatory even with an authenticated Cookie', async () => {
      for (const headers of [{cookie: admin.cookie, origin}, {...writeHeaders(admin), origin: 'https://attacker.invalid'}, {...writeHeaders(admin), 'x-csrf-token': 'invalid'}]) {
        const response = await app.inject({method: 'POST', url: '/api/v1/users', headers, payload: {loginName: 'blocked', password, role: 'employee'}});
        assert.equal(response.statusCode, 403);
        assert.equal(response.json().code, 'CSRF_INVALID');
      }
      assert.equal((await pool.query("SELECT count(*) FROM users WHERE login_name='blocked'")).rows[0].count, '0');
    });
    await t.test('last active administrator cannot deactivate or downgrade itself', async () => {
      for (const patch of [{active: false}, {role: 'employee'}]) {
        const response = await app.inject({method: 'PATCH', url: `/api/v1/users/${admin.user.id}`, headers: writeHeaders(admin), payload: {expectedVersion: 1, ...patch}});
        assert.equal(response.statusCode, 409);
        assert.equal(response.json().code, 'RELATED_RECORD_CONFLICT');
      }
      assert.equal((await pool.query("SELECT count(*) FROM users WHERE active AND role='admin'")).rows[0].count, '1');
      await assert.rejects(initializeAdministrator(pool, {loginName: 'second-initialization', password}), /已有账号/);
    });
    const created = await app.inject({method: 'POST', url: '/api/v1/users', headers: writeHeaders(admin), payload: {loginName: 'worker', password, role: 'employee'}});
    assert.equal(created.statusCode, 201);
    const workerUser = parseSchema('User', created.json());
    const worker = await fixture.login('worker');
    await t.test('employees cannot access management routes or cost data', async () => {
      for (const url of ['/api/v1/users', '/api/v1/products', '/api/v1/customers']) assert.equal((await app.inject({url, headers: {cookie: worker.cookie}})).statusCode, 403);
      const response = await app.inject({method: 'POST', url: '/api/v1/warehouses', headers: writeHeaders(worker), payload: {code: 'NO', name: 'not permitted'}});
      assert.equal(response.statusCode, 403);
      assert.ok(!/cost|profit|password|token_hash/i.test(response.body));
    });
    await t.test('role change is effective without issuing a new session; deactivation revokes it', async () => {
      const promoted = await app.inject({method: 'PATCH', url: `/api/v1/users/${workerUser.id}`, headers: writeHeaders(admin), payload: {expectedVersion: 1, role: 'admin'}});
      assert.equal(promoted.statusCode, 200);
      assert.equal((await app.inject({url: '/api/v1/users', headers: {cookie: worker.cookie}})).statusCode, 200);
      const disabled = await app.inject({method: 'PATCH', url: `/api/v1/users/${workerUser.id}`, headers: writeHeaders(admin), payload: {expectedVersion: 2, active: false}});
      assert.equal(disabled.statusCode, 200);
      assert.equal((await app.inject({url: '/api/v1/users', headers: {cookie: worker.cookie}})).statusCode, 401);
      const challenge = await app.inject({url: '/api/v1/auth/session'});
      const inactiveLogin = await app.inject({method: 'POST', url: '/api/v1/auth/login', headers: {cookie: String(challenge.headers['set-cookie']).split(';')[0]!, origin, 'x-csrf-token': challenge.json().csrfToken}, payload: {loginName: 'worker', password}});
      assert.equal(inactiveLogin.statusCode, 401);
      assert.equal(inactiveLogin.json().message, '账号或密码错误');
    });
    await t.test('expired session and logout cannot reuse the original identity', async () => {
      const other = await fixture.login();
      const response = await app.inject({method: 'POST', url: '/api/v1/auth/logout', headers: writeHeaders(other)});
      assert.equal(response.statusCode, 204);
      assert.match(String(response.headers['set-cookie']), /Max-Age=0/);
      assert.equal((await app.inject({url: '/api/v1/users', headers: {cookie: other.cookie}})).statusCode, 401);
      await pool.query('UPDATE sessions SET expires_at=now()-interval \'1 second\' WHERE user_id=$1', [admin.user.id]);
      assert.equal((await app.inject({url: '/api/v1/users', headers: {cookie: admin.cookie}})).statusCode, 401);
    });
    await t.test('audits are append-only and contain public user projections', async () => {
      const audits = await pool.query('SELECT * FROM audit_events');
      assert.ok(audits.rows.length > 0);
      assert.ok(!JSON.stringify(audits.rows).includes(password));
      assert.ok(!JSON.stringify(audits.rows).includes('password_hash'));
      await assert.rejects(pool.query('UPDATE audit_events SET entity_type=\'changed\' WHERE id=$1', [audits.rows[0].id]), {code: '23514'});
    });
  } finally {await fixture.cleanup();}
});

test('two administrators concurrently deactivate each other and still retain one active administrator', async () => {
  const fixture = await apiFixture();
  try {
    const first = await fixture.login();
    const created = await fixture.app.inject({method: 'POST', url: '/api/v1/users', headers: writeHeaders(first), payload: {loginName: 'admin-two', password, role: 'admin'}});
    const secondUser = parseSchema('User', created.json());
    const second = await fixture.login('admin-two');
    const responses = await Promise.all([
      fixture.app.inject({method: 'PATCH', url: `/api/v1/users/${secondUser.id}`, headers: writeHeaders(first, randomUUID()), payload: {expectedVersion: 1, active: false}}),
      fixture.app.inject({method: 'PATCH', url: `/api/v1/users/${first.user.id}`, headers: writeHeaders(second, randomUUID()), payload: {expectedVersion: 1, active: false}})
    ]);
    assert.equal(responses.filter(response => response.statusCode === 200).length, 1);
    assert.ok(responses.some(response => response.statusCode === 403 || response.statusCode === 409 || response.statusCode === 401));
    assert.equal((await fixture.pool.query("SELECT count(*) FROM users WHERE active AND role='admin'")).rows[0].count, '1');
  } finally {await fixture.cleanup();}
});

test('initial administrator CLI reads a private password file and refuses a second initialization', async () => {
  const database = await createTestDatabase();
  const directory = await mkdtemp(join(tmpdir(), 'huoyoupu-init-'));
  const passwordFile = join(directory, 'password');
  await writeFile(passwordFile, password, {mode: 0o600});
  try {
    const environment = {...process.env, DATABASE_URL: database.url, HYP_ADMIN_LOGIN: 'initial-admin', HYP_ADMIN_PASSWORD_FILE: passwordFile};
    const first = spawnSync('npm', ['run', 'admin:init'], {env: environment, encoding: 'utf8'});
    assert.equal(first.status, 0, first.stderr);
    assert.ok(!first.stdout.includes(password));
    assert.ok(!first.stderr.includes(password));
    const repeated = spawnSync('npm', ['run', 'admin:init'], {env: environment, encoding: 'utf8'});
    assert.equal(repeated.status, 1);
    assert.ok(repeated.stderr.includes('已有账号'));
    assert.equal((await database.pool.query('SELECT count(*) FROM users')).rows[0].count, '1');
    assert.equal((await database.pool.query("SELECT count(*) FROM audit_events WHERE entity_type='user'")).rows[0].count, '1');
  } finally {await database.cleanup(); await rm(directory, {recursive: true, force: true});}
});
