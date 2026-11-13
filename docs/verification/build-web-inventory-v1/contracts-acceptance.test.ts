import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openapiDocument, operationIds, parseOrderResponse, projectOrderResponse, schemaNames} from '../../../packages/contracts/src/index.js';
import {fixture} from '../../../packages/contracts/test/fixtures.js';

test('independent acceptance: complete planning baseline remains semantically unchanged', async () => {
  const baseline = await readFile(new URL('../../../docs/contracts/api-contract.openapi.json', import.meta.url));
  const generated = await readFile(new URL('../../../packages/contracts/src/generated/openapi.json', import.meta.url));
  assert.deepEqual(JSON.parse(generated.toString()), JSON.parse(baseline.toString()));
  assert.equal(schemaNames.length, 153);
  assert.equal(operationIds.length, 79);
  assert.deepEqual(openapiDocument, JSON.parse(baseline.toString()));
});

test('independent acceptance: employee projection strips injected sensitive properties at every nested object', () => {
  const source = fixture('OrderAdmin');
  source.lines = [fixture('OrderLineAdmin')];
  const inject = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(inject);
    Object.values(value).forEach(inject);
    Object.assign(value, {costAmount: '1.00', grossProfit: '2.00', inputUnitCost: '3.00', passwordHash: 'must-not-leak'});
  };
  inject(source);
  const original = structuredClone(source);
  const projected = projectOrderResponse('employee', 'detail', source);
  assert.doesNotThrow(() => parseOrderResponse('employee', 'detail', projected));
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.doesNotMatch(key, /cost|profit|password|token|accountChanges/i);
      walk(child);
    }
  };
  walk(projected);
  assert.deepEqual(source, original, 'projection must not mutate the administrator source');
  assert.equal(projected.lines.length, 1);
  assert.equal(projected.lines[0]?.productId, source.lines[0]?.productId);
});
