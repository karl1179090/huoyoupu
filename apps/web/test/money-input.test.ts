import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMoneyInput,
  MONEY_INPUT_ERROR,
} from '../src/pages/sales/components/moneyInput.js';

describe('normalizeMoneyInput: strict Money padding for discount / round-off inputs', () => {
  test('empty input keeps the existing zero semantics', () => {
    assert.deepEqual(normalizeMoneyInput(''), { value: '0.00', valid: true, error: null });
    assert.deepEqual(normalizeMoneyInput('   '), { value: '0.00', valid: true, error: null });
  });

  test('zero and integer input are padded to two decimals', () => {
    assert.equal(normalizeMoneyInput('0').value, '0.00');
    assert.equal(normalizeMoneyInput('1').value, '1.00');
    assert.equal(normalizeMoneyInput('123').value, '123.00');
  });

  test('one decimal is completed without rounding', () => {
    assert.equal(normalizeMoneyInput('1.0').value, '1.00');
    assert.equal(normalizeMoneyInput('0.5').value, '0.50');
  });

  test('already canonical two-decimal values are untouched', () => {
    assert.equal(normalizeMoneyInput('1.00').value, '1.00');
    assert.equal(normalizeMoneyInput('0.05').value, '0.05');
    assert.equal(normalizeMoneyInput('9.99').value, '9.99');
  });

  test('large legal amounts keep exact precision (no float math)', () => {
    const big = '123456789012345678.00';
    const result = normalizeMoneyInput('123456789012345678');
    assert.equal(result.valid, true);
    assert.equal(result.value, big);
    assert.equal(normalizeMoneyInput('999999999999999999.99').value, '999999999999999999.99');
  });

  test('three decimals are rejected, never rounded or truncated', () => {
    for (const raw of ['1.005', '0.999', '2.501']) {
      const result = normalizeMoneyInput(raw);
      assert.equal(result.valid, false, `${raw} must be invalid`);
      assert.equal(result.value, '');
      assert.equal(result.error, MONEY_INPUT_ERROR);
    }
  });

  test('negative amounts are rejected', () => {
    for (const raw of ['-1', '-1.00', '-0.01']) {
      const result = normalizeMoneyInput(raw);
      assert.equal(result.valid, false, `${raw} must be invalid`);
      assert.equal(result.value, '');
      assert.equal(result.error, MONEY_INPUT_ERROR);
    }
  });

  test('non-numeric / malformed input is rejected, not coerced to zero', () => {
    for (const raw of ['abc', '1,00', '1.2.3', '.5', '1.', '1e3', ' 1 . 00 ']) {
      const result = normalizeMoneyInput(raw);
      assert.equal(result.valid, false, `${JSON.stringify(raw)} must be invalid`);
      assert.equal(result.value, '');
      assert.equal(result.error, MONEY_INPUT_ERROR);
    }
  });

  test('leading zeros / plus sign are not silently accepted as a different amount', () => {
    for (const raw of ['01', '+1', '00.50']) {
      assert.equal(normalizeMoneyInput(raw).valid, false, `${raw} must be invalid`);
    }
  });
});
