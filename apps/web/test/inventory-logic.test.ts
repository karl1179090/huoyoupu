import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateReceiptQuantity,
  validateStocktakeCount,
  validateUnitCost,
  validateStocktakeGainRequirements,
  validateAllStocktakeLines,
  formatShanghaiDateTime,
  getCurrentShanghaiDateTime,
  isStocktakeStaleError,
  locateTargetAcrossPages,
} from '../src/pages/inventory/inventoryLogic.js';

describe('Inventory Domain Pure Logic & Validation Tests (12.2)', () => {

  test('1. Receipt quantity: Decimal numbers (1.5, 2.3, 0.5) are strictly rejected and never truncated', () => {
    const decimals = ['1.5', '2.35', '0.5', '10.0', '99.99'];
    for (const val of decimals) {
      const res = validateReceiptQuantity(val);
      assert.equal(res.valid, false, `Decimal ${val} must be rejected`);
      assert.match(res.error || '', /不支持小数/);
    }
  });

  test('2. Receipt quantity: Zero, negative numbers, empty strings, and non-digits are strictly rejected', () => {
    const invalidInputs = ['0', '-1', '-100', '', '  ', 'abc', '1e5', 'NaN'];
    for (const val of invalidInputs) {
      const res = validateReceiptQuantity(val);
      assert.equal(res.valid, false, `Input "${val}" must be rejected`);
    }
  });

  test('3. Receipt quantity: Numbers exceeding safe integer are rejected; valid safe integers pass', () => {
    const huge = '9007199254740992'; // Number.MAX_SAFE_INTEGER + 1
    const resHuge = validateReceiptQuantity(huge);
    assert.equal(resHuge.valid, false);
    assert.match(resHuge.error || '', /最大安全整数/);

    const validSafe = ['1', '50', '9999', '9007199254740991'];
    for (const val of validSafe) {
      const res = validateReceiptQuantity(val);
      assert.equal(res.valid, true, `Safe integer ${val} must pass`);
      assert.equal(res.value, Number(val));
    }
  });

  test('4. Stocktake count: Allows 0 and positive safe integers, strictly rejects decimals and negatives', () => {
    // 0 is valid for stocktake (e.g. inventory completely depleted)
    const zeroRes = validateStocktakeCount('0');
    assert.equal(zeroRes.valid, true);
    assert.equal(zeroRes.value, 0);

    const positiveRes = validateStocktakeCount('15');
    assert.equal(positiveRes.valid, true);
    assert.equal(positiveRes.value, 15);

    // Rejects decimals
    const decRes = validateStocktakeCount('3.5');
    assert.equal(decRes.valid, false);
    assert.match(decRes.error || '', /不支持小数/);

    // Rejects negatives
    const negRes = validateStocktakeCount('-5');
    assert.equal(negRes.valid, false);
    assert.match(negRes.error || '', /不能为负数/);
  });

  test('5. Unit cost: Explicitly required, accepts up to 6 decimal places, rejects empty or invalid strings', () => {
    // Empty cost rejected
    const emptyRes = validateUnitCost('');
    assert.equal(emptyRes.valid, false);
    assert.match(emptyRes.error || '', /不能为空/);

    // Valid unit costs
    const validCosts = ['10', '10.5', '12.3456', '0.000001', '0'];
    for (const c of validCosts) {
      const res = validateUnitCost(c);
      assert.equal(res.valid, true, `Valid cost ${c} should pass`);
    }

    // Too many decimals (> 6) or negative
    const tooMany = validateUnitCost('10.1234567');
    assert.equal(tooMany.valid, false);

    const neg = validateUnitCost('-10.50');
    assert.equal(neg.valid, false);
  });

  test('6. Stocktake gain requirements: Gain lines require gainCostUnitId and gainUnitCost; loss lines do not', () => {
    // Line 0: equal (book 10, counted 10)
    // Line 1: loss (book 10, counted 7) -> specified batch deduction
    // Line 2: gain (book 5, counted 8) -> missing gainCostUnitId and gainUnitCost
    const linesMissingGain = [
      { actualQuantityBase: 10, snapshotQuantityBase: 10 },
      { actualQuantityBase: 7, snapshotQuantityBase: 10 },
      { actualQuantityBase: 8, snapshotQuantityBase: 5, gainCostUnitId: '', gainUnitCost: '' },
    ];

    const checkMissing = validateStocktakeGainRequirements(linesMissingGain);
    assert.equal(checkMissing.valid, false);
    assert.ok(checkMissing.gainErrors[2], 'Line 2 must have gain error');

    // Line 2 with valid unit and cost
    const linesValidGain = [
      { actualQuantityBase: 10, snapshotQuantityBase: 10 },
      { actualQuantityBase: 7, snapshotQuantityBase: 10 },
      { actualQuantityBase: 8, snapshotQuantityBase: 5, gainCostUnitId: 'unit-box', gainUnitCost: '15.50' },
    ];

    const checkValid = validateStocktakeGainRequirements(linesValidGain);
    assert.equal(checkValid.valid, true);
    assert.equal(Object.keys(checkValid.gainErrors).length, 0);
  });

  test('7. Shanghai datetime: Correctly formats with +08:00 offset and preserves specified hour and minute', () => {
    const formatted = formatShanghaiDateTime('2026-11-11', '14:35');
    assert.equal(formatted, '2026-11-11T14:35:00+08:00');

    const defaultTime = formatShanghaiDateTime('2026-05-01');
    assert.equal(defaultTime, '2026-05-01T00:00:00+08:00');

    const current = getCurrentShanghaiDateTime();
    assert.ok(current.date.length === 10);
    assert.ok(current.time.length === 5);
    assert.ok(current.iso.endsWith('+08:00'));
  });

  test('8. STOCKTAKE_STALE detection: Correctly identifies 409 and stale errors to prevent silent overwriting', () => {
    assert.equal(isStocktakeStaleError(new Error('STOCKTAKE_STALE: snapshot is outdated')), true);
    assert.equal(isStocktakeStaleError({ status: 409, code: 'STOCKTAKE_STALE', message: '盘点后相关库存已变更，请重新建立快照' }), true);
    assert.equal(isStocktakeStaleError(new Error('盘点后相关库存已变更，请重新建立快照')), true);
    assert.equal(isStocktakeStaleError({ code: 'STOCKTAKE_STALE', message: 'stale' }), true);

    // Strictly differentiate from normal VERSION_CONFLICT
    assert.equal(isStocktakeStaleError({ status: 409, code: 'VERSION_CONFLICT', message: 'version mismatch' }), false);
    assert.equal(isStocktakeStaleError(new Error('VERSION_CONFLICT: expectedVersion mismatch')), false);
    assert.equal(isStocktakeStaleError(new Error('Network error 500')), false);
  });

  test('9. P1: User inputs 18 (valid) then modifies to 18.5 (invalid): validateAllStocktakeLines strictly flags line error and blocks confirmation', () => {
    // Initial valid state: 18
    const linesValid = [
      {
        id: 'line-1',
        snapshotQuantityBase: 20,
        actualQuantityBase: 18,
        actualQuantityRaw: '18',
      },
    ];
    const check1 = validateAllStocktakeLines(linesValid);
    assert.equal(check1.valid, true);
    assert.equal(check1.hasInvalidQuantity, false);

    // User edits to 18.5 (e.g. invalid decimal)
    const linesWithDecimal = [
      {
        id: 'line-1',
        snapshotQuantityBase: 20,
        actualQuantityBase: 18, // Old numeric value
        actualQuantityRaw: '18.5', // New invalid raw input
      },
    ];
    const check2 = validateAllStocktakeLines(linesWithDecimal);
    assert.equal(check2.valid, false, 'Invalid raw input must reject line and prevent confirmation');
    assert.equal(check2.hasInvalidQuantity, true);
    assert.match(check2.lineErrors['line-1'] || '', /不支持小数/);
    assert.match(check2.error || '', /不支持小数或负数/);
  });

  test('10. P1: Gain line with missing cost blocks validateAllStocktakeLines', () => {
    const linesGainMissingCost = [
      {
        id: 'line-gain',
        snapshotQuantityBase: 10,
        actualQuantityBase: 15,
        actualQuantityRaw: '15',
        gainCostUnitId: '',
        gainUnitCost: '',
      },
    ];
    const check = validateAllStocktakeLines(linesGainMissingCost);
    assert.equal(check.valid, false);
    assert.equal(check.hasInvalidGain, true);
    assert.match(check.lineErrors['line-gain'] || '', /盘盈行必须指定核算单位/);
  });

  test('11. B6 P2: Locates depleted historical batch (quantity 0) across paginated batches', async () => {
    const batchStore: Record<string, { items: Array<{ id: string; batchNumber: string; remainingQuantityBase: number }>; nextCursor: string | null }> = {
      'c-1': {
        items: [{ id: 'b-1', batchNumber: 'BAT-001', remainingQuantityBase: 100 }],
        nextCursor: 'c-2',
      },
      'c-2': {
        items: [
          { id: 'b-2', batchNumber: 'BAT-002', remainingQuantityBase: 50 },
          { id: 'b-target-depleted', batchNumber: 'BAT-003', remainingQuantityBase: 0 },
        ],
        nextCursor: 'c-3',
      },
    };

    const result = await locateTargetAcrossPages({
      targetId: 'b-target-depleted',
      initialCursor: 'c-1',
      fetchPage: async (cursor) => batchStore[cursor || ''] || { items: [], nextCursor: null },
      matchesTarget: (item, tid) => item.id === tid,
      maxPages: 10,
      isCancelled: () => false,
    });

    assert.equal(result.found, true);
    assert.equal(result.targetItem?.batchNumber, 'BAT-003');
    assert.equal(result.targetItem?.remainingQuantityBase, 0, 'Depleted batch must be located with positiveOnly=false');
    assert.equal(result.pagesFetched, 2);
    assert.equal(result.accumulatedItems.length, 3);
  });

  test('12. B6 P2: Streams intermediate batches on each page fetched without waiting for full completion', async () => {
    const streamedPageBatchCounts: number[] = [];

    await locateTargetAcrossPages({
      targetId: 'target-item',
      initialCursor: 'p1',
      fetchPage: async (cursor) => {
        if (cursor === 'p1') return { items: [{ id: '1' }, { id: '2' }], nextCursor: 'p2' };
        if (cursor === 'p2') return { items: [{ id: '3' }, { id: 'target-item' }], nextCursor: 'p3' };
        return { items: [], nextCursor: null };
      },
      matchesTarget: (item, tid) => item.id === tid,
      maxPages: 5,
      isCancelled: () => false,
      onPageFetched: (items) => {
        streamedPageBatchCounts.push(items.length);
      },
    });

    assert.deepEqual(streamedPageBatchCounts, [2, 2]);
  });
});
