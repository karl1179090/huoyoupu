import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ContractValidationError, getSchemaValidator, openapiDocument, operationIds, parseOperationRequest, parseOperationResponse, parseOrderResponse, parseSchema, projectOrderResponse, schemaNames, validateSchema, type SchemaName } from '../src/index.js';
import { fixture, schemas, witness } from './fixtures.js';

test('every baseline schema compiles, accepts a structural witness, and rejects undefined', () => {
  assert.equal(schemaNames.length, 153);
  for (const name of schemaNames) {
    const validator = getSchemaValidator(name);
    assert.ok(validator(fixture(name)), `${name}: ${JSON.stringify(validator.errors)}`);
    assert.equal(validator(undefined), false, name);
  }
});

test('runtime OpenAPI is semantically identical to the planning baseline', async () => {
  const baseline = JSON.parse(await readFile(new URL('../../../docs/contracts/api-contract.openapi.json', import.meta.url), 'utf8'));
  assert.deepEqual(openapiDocument, baseline);
});

test('all machine schema examples and API guide JSON request examples validate', async () => {
  for (const name of schemaNames) {
    for (const example of schemas[name].examples ?? []) assert.ok(validateSchema(name, example), name);
  }
  const guide = await readFile(new URL('../../../docs/contracts/api-contract.md', import.meta.url), 'utf8');
  const examples = [...guide.matchAll(/```json\n([\s\S]*?)\n```/g)];
  const names = ['OrderDraftInput', 'VersionInput', 'OrderReviseInput', 'AiInput'] as const;
  assert.equal(examples.length, names.length);
  examples.forEach((match, index) => assert.ok(validateSchema(names[index]!, JSON.parse(match[1]!)), names[index]!));
});

test('all object schemas and nested objects reject additional fields without mutating input', () => {
  function visit(value: any, name: SchemaName): void {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value)) {
      value.__unknown = 'forbidden';
      assert.equal(validateSchema(name, current), false, name);
      assert.equal(value.__unknown, 'forbidden');
      delete value.__unknown;
    }
    for (const child of Object.values(value)) visit(child, name);
  }
  let current: any;
  for (const name of schemaNames) { current = fixture(name); visit(current, name); }
});

test('decimal strings retain precision and enforce numeric(20,2)/numeric(20,6) boundaries', () => {
  for (const value of ['0.00', '999999999999999999.99']) assert.ok(validateSchema('Money', value));
  for (const value of [0, 0.1, '1', '01.00', '-1.00', '1.001', '1000000000000000000.00', '1e2', 'NaN']) assert.equal(validateSchema('Money', value), false);
  assert.ok(validateSchema('SignedMoney', '-999999999999999999.99'));
  assert.equal(validateSchema('PositiveMoney', '0.00'), false);
  assert.ok(validateSchema('PositiveMoney', '0.01'));
  for (const value of ['0', '1.123456', '99999999999999.999999']) assert.ok(validateSchema('UnitPrice', value));
  for (const value of ['-1', '1.1234567', '100000000000000', 1.5, '1e3']) assert.equal(validateSchema('UnitPrice', value), false);
});

test('quantities and versions reject decimals, overflow, nonfinite numbers, and coercion', () => {
  for (const name of ['Quantity', 'PositiveQuantity', 'SignedQuantity', 'Version'] as const) {
    assert.ok(validateSchema(name, Number.MAX_SAFE_INTEGER));
    for (const value of [Number.MAX_SAFE_INTEGER + 1, 1.5, NaN, Infinity, '1', null]) assert.equal(validateSchema(name, value), false, `${name} ${String(value)}`);
  }
  assert.equal(validateSchema('PositiveQuantity', 0), false);
  assert.equal(validateSchema('Version', 0), false);
  assert.ok(validateSchema('Quantity', 0));
  assert.ok(validateSchema('SignedQuantity', -Number.MAX_SAFE_INTEGER));
  assert.equal(validateSchema('SignedQuantity', -Number.MAX_SAFE_INTEGER - 1), false);
});

test('role validation rejects admin DTOs for employees in detail, history, list, and nested lines', () => {
  for (const kind of ['detail', 'revision'] as const) {
    const admin = fixture('OrderAdmin');
    admin.lines = [fixture('OrderLineAdmin')];
    assert.doesNotThrow(() => parseOrderResponse('admin', kind, admin));
    assert.throws(() => parseOrderResponse('employee', kind, admin), ContractValidationError);
    const publicDto = projectOrderResponse('employee', kind, admin);
    assert.ok(validateSchema('OrderPublic', publicDto));
    assert.ok(!Object.hasOwn(publicDto, 'costAmount'));
    assert.ok(!Object.hasOwn(publicDto.lines[0]!, 'costAmount'));
    assert.ok(Object.hasOwn(admin, 'costAmount'));
    const nestedLeak = structuredClone(publicDto) as any;
    nestedLeak.lines[0].grossProfit = '1.00';
    assert.throws(() => parseOrderResponse('employee', kind, nestedLeak), ContractValidationError);
  }
  const page = fixture('OrderPageAdmin'); page.items = [fixture('OrderSummaryAdmin')];
  assert.throws(() => parseOrderResponse('employee', 'page', page), ContractValidationError);
  assert.doesNotThrow(() => projectOrderResponse('employee', 'page', page));
  const revisions = fixture('OrderRevisionPage'); revisions.items = [fixture('OrderRevisionSummary')];
  assert.doesNotThrow(() => parseOrderResponse('employee', 'revisions', revisions));
  revisions.items[0].costAmount = '1.00';
  assert.throws(() => parseOrderResponse('employee', 'revisions', revisions), ContractValidationError);
});

test('printing and error details reject sensitive extra fields for either role', () => {
  for (const name of ['PrintData', 'ApiError'] as const) {
    const dto = fixture(name); dto.costAmount = '10.00';
    assert.throws(() => parseSchema(name, dto), ContractValidationError);
  }
  const error = fixture('ApiError'); error.details = { costAmount: '10.00' };
  assert.equal(validateSchema('ApiError', error), false);
});

test('formats, required fields, unions, and constraints are enforced at runtime', () => {
  assert.equal(validateSchema('Id', 'not-a-uuid'), false);
  assert.equal(validateSchema('Instant', '2026-02-30T00:00:00Z'), false);
  assert.equal(validateSchema('Instant', '2026-11-10'), false);
  assert.equal(validateSchema('LoginInput', { loginName: 'x' }), false);
  assert.equal(validateSchema('CashInput', { ...fixture('ReceiptCashInput'), kind: 'unknown' }), false);
  assert.equal(validateSchema('ReceiptInput', { ...fixture('ReceiptInput'), lines: [] }), false);
  assert.equal(validateSchema('LoginInput', { loginName: 'x', password: 'x', role: 'admin' }), false);
});

test('every enum and const branch of the planning schemas is exercised', () => {
  // Witness every union branch; this catches schemas hidden behind a valid first branch.
  for (const name of schemaNames) {
    const schema = schemas[name];
    for (const branch of schema.oneOf ?? schema.anyOf ?? []) {
      const value = witness(branch);
      assert.ok(validateSchema(name, value), `${name}: ${JSON.stringify(getSchemaValidator(name).errors)}`);
    }
    for (const value of schema.enum ?? []) assert.ok(validateSchema(name, value), name);
  }
});

test('operation input validation covers path/query/header constraints and rejects unknown input', () => {
  assert.equal(operationIds.length, 79);
  assert.doesNotThrow(() => parseOperationRequest('listOrders', { query: { limit: 200 } }));
  assert.throws(() => parseOperationRequest('listOrders', { query: { limit: '50' } }), ContractValidationError);
  assert.throws(() => parseOperationRequest('listOrders', { query: { limit: 201 } }), ContractValidationError);
  assert.throws(() => parseOperationRequest('listOrders', { query: { sql: 'select *' } }), ContractValidationError);
  assert.throws(() => parseOperationRequest('getOrder', { path: { orderId: 'invalid' } }), ContractValidationError);
  const request = { path: { orderId: fixture('Id') }, headers: { 'X-CSRF-Token': 'challenge', 'Idempotency-Key': '1234567890123456' }, body: { expectedVersion: 1 } };
  assert.doesNotThrow(() => parseOperationRequest('confirmOrder', request));
  assert.throws(() => parseOperationRequest('confirmOrder', { ...request, headers: {} }), ContractValidationError);
  assert.throws(() => parseOperationRequest('confirmOrder', { ...request, body: { expectedVersion: 1, costAmount: '1.00' } }), ContractValidationError);
});

test('operation output picks role schemas rather than permitting admin union alternatives', () => {
  assert.throws(() => parseOperationResponse('getOrder', 200, 'employee', fixture('OrderAdmin')), ContractValidationError);
  assert.doesNotThrow(() => parseOperationResponse('getOrder', 200, 'employee', fixture('OrderPublic')));
  assert.throws(() => parseOperationResponse('listOrders', 200, 'employee', fixture('OrderPageAdmin')), ContractValidationError);
  assert.throws(() => parseOperationResponse('getOrderRevision', 200, 'employee', fixture('OrderAdmin')), ContractValidationError);
  assert.throws(() => parseOperationResponse('getProduct', 200, 'employee', fixture('Product')), /Role cannot access/);
  assert.doesNotThrow(() => parseOperationResponse('getProduct', 403, 'employee', fixture('ApiError')));
  assert.doesNotThrow(() => parseOperationResponse('logout', 204, 'admin', undefined));
  assert.throws(() => parseOperationResponse('logout', 204, 'admin', {}), ContractValidationError);
  assert.throws(() => parseOperationResponse('getOrder', 299, 'admin', {}), /Undocumented status/);
});

test('all documented operations accept typed structural inputs and every response/status schema', () => {
  let operationsChecked = 0;
  let responsesChecked = 0;
  const document: any = openapiDocument;
  for (const pathItem of Object.values(document.paths) as any[]) {
    for (const operation of Object.values(pathItem) as any[]) {
      if (!operation.operationId) continue;
      const input: any = { path: {}, query: {}, headers: {} };
      for (let parameter of operation.parameters ?? []) {
        if (parameter.$ref) parameter = document.components.parameters[parameter.$ref.split('/').at(-1)];
        input[parameter.in === 'header' ? 'headers' : parameter.in][parameter.name] = witness(parameter.schema);
      }
      if (operation.requestBody) input.body = witness(operation.requestBody.content['application/json'].schema);
      assert.doesNotThrow(() => parseOperationRequest(operation.operationId, input), operation.operationId);
      operationsChecked++;
      for (const [status, definition] of Object.entries(operation.responses) as [string, any][]) {
        const response = definition.$ref ? document.components.responses[definition.$ref.split('/').at(-1)] : definition;
        for (const role of ['admin', 'employee', 'public'] as const) {
          if (Number(status) < 300 && !operation['x-roles'].includes('public') && !operation['x-roles'].includes(role)) continue;
          const ref = Number(status) < 300 ? operation['x-response-schema-by-role']?.[role] : undefined;
          const schema = ref ? { $ref: ref } : response.content?.['application/json']?.schema;
          assert.doesNotThrow(() => parseOperationResponse(operation.operationId, Number(status), role, schema ? witness(schema) : undefined), `${operation.operationId}:${status}:${role}`);
          responsesChecked++;
        }
      }
    }
  }
  assert.equal(operationsChecked, operationIds.length);
  assert.ok(responsesChecked > 1000);
});
