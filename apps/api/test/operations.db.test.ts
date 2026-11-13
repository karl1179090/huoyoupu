import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parseSchema} from '@huoyoupu/contracts';
import {apiFixture, origin, writeHeaders} from './helpers.js';
import {createSecurity} from '../src/modules/auth/service.js';
import {AppError} from '../src/lib/errors.js';

test('HTTP idempotency preserves success, failed validation, path targets, and authorization before replay', async t => {
  const fixture = await apiFixture();
  const {app, pool} = fixture;
  try {
    const admin = await fixture.login();
    const key = randomUUID();
    const payload = {code: 'W-A', name: '测试仓库'};
    const first = await app.inject({method: 'POST', url: '/api/v1/warehouses', headers: writeHeaders(admin, key), payload});
    assert.equal(first.statusCode, 201, first.body);
    const warehouse = parseSchema('Warehouse', first.json());
    await t.test('same key and semantically identical reordered JSON produce exactly one business result', async () => {
      const repeated = await app.inject({method: 'POST', url: '/api/v1/warehouses', headers: writeHeaders(admin, key), payload: {name: payload.name, code: payload.code}});
      assert.equal(repeated.statusCode, 201);
      assert.equal(repeated.headers['idempotency-replayed'], 'true');
      assert.deepEqual(repeated.json(), first.json());
      assert.equal((await pool.query('SELECT count(*) FROM warehouses')).rows[0].count, '1');
      assert.equal((await pool.query("SELECT count(*) FROM business_operations WHERE kind <> 'initializeAdministrator'")).rows[0].count, '1');
      assert.equal((await pool.query("SELECT count(*) FROM audit_events WHERE entity_type='warehouse'")).rows[0].count, '1');
      const conflict = await app.inject({method: 'POST', url: '/api/v1/warehouses', headers: writeHeaders(admin, key), payload: {...payload, name: 'different'}});
      assert.equal(conflict.statusCode, 409);
      assert.equal(conflict.json().code, 'IDEMPOTENCY_CONFLICT');
    });
    await t.test('structure and database constraint failures are durably cached without raw SQL leakage', async () => {
      const invalidKey = randomUUID();
      const bad = {code: 'BAD', name: 'bad', unknown: 'must reject'};
      const firstBad = await app.inject({method: 'POST', url: '/api/v1/warehouses', headers: writeHeaders(admin, invalidKey), payload: bad});
      assert.equal(firstBad.statusCode, 400, firstBad.body);
      const replayBad = await app.inject({method: 'POST', url: '/api/v1/warehouses', headers: writeHeaders(admin, invalidKey), payload: bad});
      assert.equal(replayBad.statusCode, 400);
      assert.deepEqual(replayBad.json(), firstBad.json());
      assert.equal(replayBad.headers['idempotency-replayed'], 'true');
      assert.equal((await pool.query('SELECT state,http_status FROM idempotency_records WHERE request_key=$1', [invalidKey])).rows[0].state, 'failed');
      const duplicate = await app.inject({method: 'POST', url: '/api/v1/warehouses', headers: writeHeaders(admin), payload});
      assert.equal(duplicate.statusCode, 422, duplicate.body);
      parseSchema('ApiError', duplicate.json());
      assert.ok(!/SQL|constraint|warehouses_code|stack|password/i.test(duplicate.body));
      assert.equal((await pool.query("SELECT count(*) FROM business_operations WHERE kind <> 'initializeAdministrator'")).rows[0].count, '1');
    });
    await t.test('path identity participates in request fingerprint', async () => {
      const other = await app.inject({method: 'POST', url: '/api/v1/warehouses', headers: writeHeaders(admin), payload: {code: 'W-B', name: 'second'}});
      const otherWarehouse = parseSchema('Warehouse', other.json());
      const sharedKey = randomUUID();
      const body = {expectedVersion: 1, name: 'renamed'};
      const changed = await app.inject({method: 'PATCH', url: `/api/v1/warehouses/${warehouse.id}`, headers: writeHeaders(admin, sharedKey), payload: body});
      assert.equal(changed.statusCode, 200);
      const crossTarget = await app.inject({method: 'PATCH', url: `/api/v1/warehouses/${otherWarehouse.id}`, headers: writeHeaders(admin, sharedKey), payload: body});
      assert.equal(crossTarget.statusCode, 409);
      assert.equal(crossTarget.json().code, 'IDEMPOTENCY_CONFLICT');
      assert.equal((await pool.query('SELECT name FROM warehouses WHERE id=$1', [otherWarehouse.id])).rows[0].name, 'second');
    });
    await t.test('concurrent same-key requests create one effect and converge to one result', async () => {
      const concurrentKey = randomUUID();
      const payload = {code: 'CONCURRENT', name: 'one warehouse'};
      const responses = await Promise.all(Array.from({length: 8}, () => app.inject({method: 'POST', url: '/api/v1/warehouses', headers: writeHeaders(admin, concurrentKey), payload})));
      assert.ok(responses.some(response => response.statusCode === 201));
      assert.ok(responses.every(response => response.statusCode === 201 || (response.statusCode === 409 && response.json().code === 'OPERATION_IN_PROGRESS')));
      const final = await app.inject({method: 'POST', url: '/api/v1/warehouses', headers: writeHeaders(admin, concurrentKey), payload});
      assert.equal(final.statusCode, 201);
      for (const response of responses.filter(response => response.statusCode === 201)) assert.deepEqual(response.json(), final.json());
      assert.equal((await pool.query("SELECT count(*) FROM warehouses WHERE code='CONCURRENT'")).rows[0].count, '1');
      assert.equal((await pool.query('SELECT count(*) FROM idempotency_records WHERE request_key=$1', [concurrentKey])).rows[0].count, '1');
    });
    await t.test('role downgrade and deactivation cannot retrieve previously cached admin results', async () => {
      await pool.query("UPDATE users SET role='employee',version=version+1 WHERE id=$1", [admin.user.id]);
      const downgraded = await app.inject({method: 'POST', url: '/api/v1/warehouses', headers: writeHeaders(admin, key), payload});
      assert.equal(downgraded.statusCode, 403);
      assert.equal(downgraded.headers['idempotency-replayed'], undefined);
      await pool.query('UPDATE users SET active=false WHERE id=$1', [admin.user.id]);
      const disabled = await app.inject({method: 'POST', url: '/api/v1/warehouses', headers: writeHeaders(admin, key), payload});
      assert.equal(disabled.statusCode, 401);
    });
  } finally {await fixture.cleanup();}
});

test('real PostgreSQL lease recovery, rollback, and limited serialization retry never duplicate effects', async t => {
  const fixture = await apiFixture();
  const {app, pool} = fixture;
  await pool.query('CREATE TABLE test_effects (operation_id uuid PRIMARY KEY REFERENCES business_operations(id), value integer NOT NULL)');
  const security = createSecurity(pool, {origin});
  let attempts = 0;
  app.post('/test/operations', async (request, reply) => {
    const result = await security.withOperation(request, {kind: 'testOperation', routeKey: 'POST:/test/operations'}, async context => {
      attempts++;
      const body = request.body as {mode: string; value: number};
      await context.client.query('INSERT INTO test_effects VALUES ($1,$2)', [context.operationId, body.value]);
      if (body.mode === 'fail') throw new AppError('RELATED_RECORD_CONFLICT', 409, '虚构业务校验失败');
      if (body.mode === 'retry' && attempts < 3) throw Object.assign(new Error('simulated serialization victim'), {code: '40001'});
      return {status: 201, body: {operationId: context.operationId, value: body.value}};
    });
    if (result.replayed) reply.header('Idempotency-Replayed', 'true');
    return reply.code(result.status).send(result.body);
  });
  try {
    const admin = await fixture.login();
    const originalKey = randomUUID();
    const body = {mode: 'success', value: 7};
    const original = await app.inject({method: 'POST', url: '/test/operations', headers: writeHeaders(admin, originalKey), payload: body});
    assert.equal(original.statusCode, 201);
    await t.test('unexpired registration rejects another worker; expired crash lease is recovered', async () => {
      const crashKey = randomUUID();
      await pool.query(`INSERT INTO idempotency_records(actor_id,route_key,request_key,body_hash,state,lease_token,lease_until)
        SELECT actor_id,route_key,$2,body_hash,'in_progress',$3,now()+interval '10 minutes' FROM idempotency_records WHERE request_key=$1`, [originalKey, crashKey, randomUUID()]);
      const running = await app.inject({method: 'POST', url: '/test/operations', headers: writeHeaders(admin, crashKey), payload: body});
      assert.equal(running.statusCode, 409);
      assert.equal(running.json().code, 'OPERATION_IN_PROGRESS');
      await pool.query("UPDATE idempotency_records SET lease_until=now()-interval '1 second' WHERE request_key=$1", [crashKey]);
      const recovered = await app.inject({method: 'POST', url: '/test/operations', headers: writeHeaders(admin, crashKey), payload: body});
      assert.equal(recovered.statusCode, 201);
      const repeated = await app.inject({method: 'POST', url: '/test/operations', headers: writeHeaders(admin, crashKey), payload: body});
      assert.deepEqual(repeated.json(), recovered.json());
      assert.equal((await pool.query('SELECT count(*) FROM test_effects')).rows[0].count, '2');
    });
    await t.test('completed outcome wins even when its lease time is expired', async () => {
      await pool.query("UPDATE idempotency_records SET lease_until=now()-interval '1 day' WHERE request_key=$1", [originalKey]);
      const repeated = await app.inject({method: 'POST', url: '/test/operations', headers: writeHeaders(admin, originalKey), payload: body});
      assert.deepEqual(repeated.json(), original.json());
      assert.equal((await pool.query('SELECT count(*) FROM test_effects')).rows[0].count, '2');
    });
    await t.test('failed operation rolls back effects and persists the exact failure for retry', async () => {
      const failureKey = randomUUID();
      const payload = {mode: 'fail', value: 999};
      const failed = await app.inject({method: 'POST', url: '/test/operations', headers: writeHeaders(admin, failureKey), payload});
      assert.equal(failed.statusCode, 409);
      const failedReplay = await app.inject({method: 'POST', url: '/test/operations', headers: writeHeaders(admin, failureKey), payload});
      assert.deepEqual(failedReplay.json(), failed.json());
      assert.equal(failedReplay.headers['idempotency-replayed'], 'true');
      assert.equal((await pool.query('SELECT count(*) FROM test_effects WHERE value=999')).rows[0].count, '0');
      assert.equal((await pool.query("SELECT count(*) FROM business_operations WHERE kind <> 'initializeAdministrator'")).rows[0].count, '2');
    });
    await t.test('serialization failures retry the same semantic operation at most three times', async () => {
      attempts = 0;
      const response = await app.inject({method: 'POST', url: '/test/operations', headers: writeHeaders(admin), payload: {mode: 'retry', value: 33}});
      assert.equal(response.statusCode, 201, response.body);
      assert.equal(attempts, 3);
      assert.equal((await pool.query('SELECT count(*) FROM test_effects WHERE value=33')).rows[0].count, '1');
    });
  } finally {await fixture.cleanup();}
});
