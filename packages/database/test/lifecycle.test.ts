import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestDatabase} from '../src/testing.js';

test('fixture cleanup waits for physical socket shutdown before dropping its database', async () => {
  const database = await createTestDatabase({migrate: false});
  let connected = 0, physicallyClosed = 0;
  database.pool.on('connect', client => {
    connected++;
    const originalEnd = client.end.bind(client);
    // Amplify real scheduling latency between pg-pool end() and client.end().
    (client as unknown as {end: (callback?: () => void) => void}).end = callback => {
      setTimeout(() => {void originalEnd(() => {physicallyClosed++; callback?.();});}, 50);
    };
  });
  await Promise.all(Array.from({length: 8}, () => database.pool.query('SELECT pg_backend_pid()')));
  await database.cleanup();
  assert.equal(connected, 8);
  assert.equal(physicallyClosed, connected);
  await database.cleanup(); // Repeat finalization is safe.
});
