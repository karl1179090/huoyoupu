import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOperationResponse, parseSchema, type SchemaValue, type components } from '../src/index.js';

// tsc checks these assignments without executing invalid examples.
function typeProofs(value: unknown): void {
  const order = parseOperationResponse('getOrder', 200, 'employee', value);
  const total: string = order.totalAmount;
  // @ts-expect-error employee DTO has no cost field
  order.costAmount;
  // @ts-expect-error employee line DTO has no profit field
  order.lines[0]!.grossProfit;
  const admin = parseOperationResponse('getOrder', 200, 'admin', value);
  const cost: string = admin.costAmount;
  const product: components['schemas']['Product'] = parseSchema('Product', value);
  const report: SchemaValue<'ReportQuery'> = { kind: 'cash_flow' };
  void report;
  const quantity: SchemaValue<'PositiveQuantity'> = 1;
  // @ts-expect-error amounts are strings, never binary floats
  const money: SchemaValue<'Money'> = 1.5;
  // @ts-expect-error roles are a closed set
  parseOperationResponse('getOrder', 200, 'visitor', value);
  void [total, cost, product, quantity, money];
}
test('static type proof module loads', () => assert.equal(typeof typeProofs, 'function'));
