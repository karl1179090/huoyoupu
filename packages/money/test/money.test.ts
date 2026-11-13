import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {allocateDiscount, allocateFromSource, returnFromSource, parseMoney, parseUnitPrice, formatMoney, toBaseQuantity, amountForBaseQuantity, MAX_CENTS, MAX_PRICE_MICROS, quantity, sumQuantities, type AmountSource} from '../src/index.js';

const sum = (values: readonly bigint[]) => values.reduce((a, b) => a + b, 0n);
function source(q: bigint, amount: bigint): AmountSource { return {quantity: q, amount, allocatedQuantity: 0n, allocatedAmount: 0n}; }

test('decimal/database boundaries and safe integer conversion are exact', () => {
  assert.equal(parseMoney('999999999999999999.99'), MAX_CENTS);
  assert.equal(parseUnitPrice('99999999999999.999999'), MAX_PRICE_MICROS);
  assert.equal(parseUnitPrice('0.000001'), 1n);
  assert.equal(formatMoney(-1001n), '-10.01');
  for (const value of ['1000000000000000000.00', '0.001', '-1.00', '1e2', '01.00', '1', 'NaN']) assert.throws(() => parseMoney(value));
  for (const value of ['100000000000000', '0.0000001', '-1']) assert.throws(() => parseUnitPrice(value));
  assert.equal(toBaseQuantity(3, 12) + toBaseQuantity(2, 1), 38n);
  assert.throws(() => toBaseQuantity(Number.MAX_SAFE_INTEGER, 2));
  assert.throws(() => sumQuantities([Number.MAX_SAFE_INTEGER, 1]));
  assert.equal(sumQuantities([12, 3]), 15n);
  for (const value of [1.5, -1, 0, Number.MAX_SAFE_INTEGER + 1, Infinity]) assert.throws(() => quantity(value));
  assert.equal(amountForBaseQuantity(parseUnitPrice('0.005'), 1n, 1n), 1n);
  assert.equal(amountForBaseQuantity(parseUnitPrice('10'), 24n, 24n), 1000n);
});

test('10 yuan / 24 bottles, every bottle sold and every source fully returned', () => {
  let batch = source(24n, 1000n);
  const issued: bigint[] = [];
  const returned: bigint[] = [];
  for (let i = 0; i < 24; i++) {
    const sale = allocateFromSource(batch, 1n); batch = sale.source; issued.push(sale.amount);
    returned.push(returnFromSource(source(1n, sale.amount), 1n).amount);
  }
  assert.equal(sum(issued), 1000n);
  assert.equal(sum(returned), 1000n);
  assert.ok(issued.every(value => value === 41n || value === 42n));
  assert.equal(batch.allocatedQuantity, 24n);
  assert.equal(batch.allocatedAmount, 1000n);
  assert.throws(() => allocateFromSource(batch, 1n));
  let aggregateReturn = source(24n, 1000n);
  const credits: bigint[] = [];
  for (let i = 0; i < 24; i++) { const credit = returnFromSource(aggregateReturn, 1n); aggregateReturn = credit.source; credits.push(credit.amount); }
  assert.equal(sum(credits), 1000n);
});

test('discount maximum remainder and tie order', () => {
  assert.deepEqual(allocateDiscount([6000n, 4000n], 1000n), [600n, 400n]);
  assert.deepEqual(allocateDiscount([1n, 1n, 1n], 2n), [1n, 1n, 0n]);
  assert.deepEqual(allocateDiscount([0n, 0n], 0n), [0n, 0n]);
  assert.throws(() => allocateDiscount([1n], 2n));
  assert.throws(() => allocateDiscount([-1n], 0n));
  assert.throws(() => allocateFromSource({...source(24n, 1000n), allocatedQuantity: 1n, allocatedAmount: 0n}, 1n));
});

test('property: arbitrary split sales and returns conserve source quantity and cents', () => {
  fc.assert(fc.property(fc.array(fc.integer({min: 1, max: 500}), {minLength: 1, maxLength: 40}), fc.bigInt({min: 0n, max: MAX_CENTS}), (parts, amount) => {
    const totalQuantity = sum(parts.map(BigInt));
    let state = source(totalQuantity, amount);
    const sales: bigint[] = [];
    for (const part of parts) {
      const result = allocateFromSource(state, BigInt(part));
      state = result.source; sales.push(result.amount);
      let returnState = source(BigInt(part), result.amount);
      let credited = 0n;
      for (let i = 0; i < part; i++) { const credit = returnFromSource(returnState, 1n); returnState = credit.source; credited += credit.amount; }
      assert.equal(credited, result.amount);
    }
    assert.equal(sum(sales), amount);
    assert.equal(state.allocatedQuantity, totalQuantity);
    assert.equal(state.allocatedAmount, amount);
  }), {numRuns: 200, seed: 4724});
});

test('property: discounts sum exactly, respect line capacity and stable input order', () => {
  fc.assert(fc.property(fc.array(fc.bigInt({min: 0n, max: 100_000_000_000n}), {minLength: 1, maxLength: 100}), fc.nat(), (lines, seed) => {
    const total = sum(lines);
    const discount = total === 0n ? 0n : BigInt(seed) % (total + 1n);
    const allocated = allocateDiscount(lines, discount);
    assert.equal(sum(allocated), discount);
    allocated.forEach((value, index) => assert.ok(value >= 0n && value <= lines[index]!));
    assert.deepEqual(allocateDiscount(lines, discount), allocated);
  }), {numRuns: 1000, seed: 1010});
});
