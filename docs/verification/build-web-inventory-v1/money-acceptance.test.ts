import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateDiscount, allocateFromSource, amountForBaseQuantity, formatMoney, parseMoney, parseUnitPrice, returnFromSource, toBaseQuantity, MAX_CENTS, MAX_PRICE_MICROS, MAX_SAFE_QUANTITY, type AmountSource} from '../../../packages/money/src/index.js';

const original = (quantity: bigint, amount: bigint): AmountSource => ({quantity, amount, allocatedQuantity: 0n, allocatedAmount: 0n});

test('independent acceptance: every possible split point of 10 yuan / 24 bottles conserves original cost and returns', () => {
  for (let firstCount = 1n; firstCount < 24n; firstCount++) {
    const first = allocateFromSource(original(24n, 1000n), firstCount);
    const second = allocateFromSource(first.source, 24n - firstCount);
    assert.equal(first.amount + second.amount, 1000n);
    let totalReturned = 0n;
    for (const issued of [{quantity: firstCount, amount: first.amount}, {quantity: 24n - firstCount, amount: second.amount}]) {
      let source = original(issued.quantity, issued.amount);
      for (let i = 0n; i < issued.quantity; i++) {
        const credit = returnFromSource(source, 1n);
        source = credit.source;
        totalReturned += credit.amount;
      }
      assert.equal(source.allocatedAmount, issued.amount);
      assert.throws(() => returnFromSource(source, 1n));
    }
    assert.equal(totalReturned, 1000n);
    assert.equal(second.source.allocatedQuantity, 24n);
  }
});

test('independent acceptance: all small multi-line discount totals remain within capacity with stable tails', () => {
  for (let a = 0n; a <= 12n; a++) for (let b = 0n; b <= 12n; b++) for (let c = 0n; c <= 5n; c++) {
    const lines = [a, b, c];
    const total = a + b + c;
    for (let discount = 0n; discount <= total; discount++) {
      const allocated = allocateDiscount(lines, discount);
      assert.equal(allocated.reduce((sum, amount) => sum + amount, 0n), discount);
      allocated.forEach((amount, index) => assert.ok(amount >= 0n && amount <= lines[index]!));
    }
  }
  assert.deepEqual(allocateDiscount([1n, 1n, 1n, 1n], 1n), [1n, 0n, 0n, 0n]);
  assert.throws(() => allocateDiscount([0n, 0n], 1n));
});

test('independent acceptance: exact monetary and quantity boundaries reject derived overflow', () => {
  assert.equal(formatMoney(parseMoney('999999999999999999.99')), '999999999999999999.99');
  assert.equal(parseUnitPrice('99999999999999.999999'), MAX_PRICE_MICROS);
  assert.equal(amountForBaseQuantity(parseUnitPrice('0.004999'), 1n, 1n), 0n);
  assert.equal(amountForBaseQuantity(parseUnitPrice('0.005000'), 1n, 1n), 1n);
  assert.equal(amountForBaseQuantity(0n, 24n, MAX_SAFE_QUANTITY), 0n);
  assert.equal(toBaseQuantity(MAX_SAFE_QUANTITY, 1n), MAX_SAFE_QUANTITY);
  assert.throws(() => toBaseQuantity(MAX_SAFE_QUANTITY, 2n));
  assert.throws(() => amountForBaseQuantity(MAX_PRICE_MICROS, 1n, MAX_SAFE_QUANTITY));
  assert.throws(() => formatMoney(MAX_CENTS + 1n));
  assert.throws(() => allocateFromSource({...original(24n, 1000n), allocatedQuantity: 1n, allocatedAmount: 41n}, 1n));
});
