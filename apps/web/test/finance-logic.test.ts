import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMoney,
  validateAllocations,
  formatShanghaiPeriod,
  isStaleStatement,
  parseLedgerKind,
  formatShanghaiDisplay,
  moneyToCentsBigInt,
  centsBigIntToMoney,
  formatSourceVersionTag,
  locateTargetAcrossPages,
  resolveStatementCustomer,
} from '../src/pages/finance/financeLogic.js';

describe('Finance Domain Pure Logic & Settlement Validation Tests (12.6)', () => {

  test('1. Money validation: Accepts valid positive money, normalizes to 2 decimals, rejects malformed', () => {
    const validCases = [
      { input: '100', expected: '100.00' },
      { input: '99.5', expected: '99.50' },
      { input: '123.45', expected: '123.45' },
      { input: '0.01', expected: '0.01' },
    ];

    for (const c of validCases) {
      const res = validateMoney(c.input);
      assert.equal(res.valid, true, `Input "${c.input}" should be valid`);
      assert.equal(res.value, c.expected);
    }

    // Invalid: 0 or negative when allowNegative = false
    assert.equal(validateMoney('0').valid, false);
    assert.equal(validateMoney('-50.00').valid, false);

    // Invalid: more than 2 decimal places, text, empty
    assert.equal(validateMoney('10.123').valid, false);
    assert.equal(validateMoney('abc').valid, false);
    assert.equal(validateMoney('').valid, false);
  });

  test('2. Opening balance money: Allows negative values to represent customer credit/prepayment', () => {
    // Negative opening balance: customer prepayment / credit
    const negRes = validateMoney('-500.00', true);
    assert.equal(negRes.valid, true);
    assert.equal(negRes.value, '-500.00');

    // Positive opening balance: customer receivable debt
    const posRes = validateMoney('1200.50', true);
    assert.equal(posRes.valid, true);
    assert.equal(posRes.value, '1200.50');
  });

  test('3. Manual multi-order allocations: Validates sum <= cash amount, calculates unallocated remainder', () => {
    const allocations = [
      { orderId: 'order-1', amount: '40.00' },
      { orderId: 'order-2', amount: '35.50' },
    ];
    const totalCash = '100.00';

    const res = validateAllocations(allocations, totalCash);
    assert.equal(res.valid, true);
    assert.equal(res.totalAllocated, '75.50');
    assert.equal(res.remainingUnallocated, '24.50'); // 100 - 75.50
  });

  test('4. Manual allocations: Over-allocation is strictly blocked and returns informative error', () => {
    const allocations = [
      { orderId: 'order-1', amount: '60.00' },
      { orderId: 'order-2', amount: '50.00' },
    ];
    const totalCash = '100.00'; // Sum is 110 > 100

    const res = validateAllocations(allocations, totalCash);
    assert.equal(res.valid, false);
    assert.match(res.error || '', /超出可用金额/);
  });

  test('5. Manual allocations: Duplicate orderId is rejected', () => {
    const duplicate = [
      { orderId: 'order-1', amount: '20.00' },
      { orderId: 'order-1', amount: '30.00' },
    ];
    const res = validateAllocations(duplicate, '100.00');
    assert.equal(res.valid, false);
    assert.match(res.error || '', /未通过校验/);
    assert.ok(res.lineErrors && res.lineErrors[1]);
  });

  test('6. Shanghai statement period: Strictly enforces [start 00:00, end 00:00) right-open interval', () => {
    const period = formatShanghaiPeriod('2026-02-01', '2026-03-01');
    assert.equal(period.valid, true);
    assert.equal(period.periodStart, '2026-02-01T00:00:00+08:00');
    assert.equal(period.periodEnd, '2026-03-01T00:00:00+08:00');

    // Inverted or equal dates must fail
    const equalPeriod = formatShanghaiPeriod('2026-02-01', '2026-02-01');
    assert.equal(equalPeriod.valid, false);
    assert.match(equalPeriod.error || '', /早于截止日期/);

    const invertedPeriod = formatShanghaiPeriod('2026-05-01', '2026-04-01');
    assert.equal(invertedPeriod.valid, false);
  });

  test('7. Stale statement detection: Correctly flags stale snapshot when underlying records changed', () => {
    assert.equal(isStaleStatement({ stale: true }), true);
    assert.equal(isStaleStatement({ stale: false }), false);
  });

  test('8. parseLedgerKind: Accurately maps financial ledger kinds to business definitions', () => {
    // Real backend database customer_ledger_entries kinds
    const realKinds = [
      { kind: 'sale', label: '销售应收增加', isCredit: false },
      { kind: 'return', label: '退货信用冲减', isCredit: true },
      { kind: 'receipt', label: '实际收款入账', isCredit: true },
      { kind: 'refund', label: '实际现金退款', isCredit: false },
      { kind: 'opening', label: '期初往来账款', isCredit: false },
      { kind: 'reversal', label: '收退款红字冲正', isCredit: false },
      { kind: 'reclassification', label: '往来调账重分类', isCredit: false },
      { kind: 'balance_application', label: '余额核销订单', isCredit: true },
    ];

    for (const r of realKinds) {
      const parsed = parseLedgerKind(r.kind);
      assert.equal(parsed.label, r.label, `Kind ${r.kind} label mismatch`);
      assert.equal(parsed.isCredit, r.isCredit, `Kind ${r.kind} isCredit mismatch`);
    }
  });

  test('9. BigInt Money calculations: Prevents IEEE-754 precision loss and handles 18-digit Money strings', () => {
    const hugeMoney = '9999999999999999.50';
    const cents = moneyToCentsBigInt(hugeMoney);
    assert.equal(cents, 999999999999999950n);
    const converted = centsBigIntToMoney(cents);
    assert.equal(converted, hugeMoney);

    // Negative money
    const negMoney = '-123456789.99';
    const negCents = moneyToCentsBigInt(negMoney);
    assert.equal(negCents, -12345678999n);
    assert.equal(centsBigIntToMoney(negCents), negMoney);
  });

  test('10. formatSourceVersionTag: Accurately formats version, returns empty string when null/undefined (never "(v)")', () => {
    assert.equal(formatSourceVersionTag(1), '(v1)');
    assert.equal(formatSourceVersionTag(42), '(v42)');
    assert.equal(formatSourceVersionTag(null), '');
    assert.equal(formatSourceVersionTag(undefined), '');
  });

  test('11. B6 P2: locateTargetAcrossPages locates target on page 3, accumulating items without premature cancellation', async () => {
    const pageData: Record<string, { items: Array<{ id: string; name: string }>; nextCursor: string | null }> = {
      'cursor-page-1': {
        items: [{ id: 'item-1', name: 'Item 1' }, { id: 'item-2', name: 'Item 2' }],
        nextCursor: 'cursor-page-2',
      },
      'cursor-page-2': {
        items: [{ id: 'item-3', name: 'Item 3' }, { id: 'item-4', name: 'Item 4' }],
        nextCursor: 'cursor-page-3',
      },
      'cursor-page-3': {
        items: [{ id: 'item-5', name: 'Item 5' }, { id: 'target-item-6', name: 'Target Item 6' }],
        nextCursor: 'cursor-page-4',
      },
    };

    let pagesQueried = 0;
    const streamedItems: Array<{ id: string; name: string }> = [];

    const result = await locateTargetAcrossPages({
      targetId: 'target-item-6',
      initialCursor: 'cursor-page-1',
      fetchPage: async (cursor) => {
        pagesQueried++;
        return pageData[cursor || ''] || { items: [], nextCursor: null };
      },
      matchesTarget: (item, tid) => item.id === tid,
      maxPages: 10,
      isCancelled: () => false,
      onPageFetched: (items) => {
        streamedItems.push(...items);
      },
    });

    assert.equal(result.found, true);
    assert.equal(result.targetItem?.id, 'target-item-6');
    assert.equal(result.pagesFetched, 3);
    assert.equal(pagesQueried, 3);
    assert.equal(result.accumulatedItems.length, 6);
    assert.equal(streamedItems.length, 6);
    assert.equal(result.finalNextCursor, 'cursor-page-4');
  });

  test('12. B6 P2: locateTargetAcrossPages aborts immediately when isCancelled returns true', async () => {
    let pagesQueried = 0;
    let shouldCancel = false;

    const result = await locateTargetAcrossPages({
      targetId: 'target-deep',
      initialCursor: 'cursor-1',
      fetchPage: async () => {
        pagesQueried++;
        if (pagesQueried === 1) {
          shouldCancel = true; // Component unmounted or scope changed after page 1
        }
        return {
          items: [{ id: `item-${pagesQueried}` }],
          nextCursor: `cursor-${pagesQueried + 1}`,
        };
      },
      matchesTarget: (item, tid) => item.id === tid,
      maxPages: 10,
      isCancelled: () => shouldCancel,
    });

    assert.equal(result.found, false);
    assert.equal(pagesQueried, 1, 'Must abort immediately and not fetch page 2');
  });

  test('13. B6 P2: locateTargetAcrossPages handles non-existent item across exhausted cursor', async () => {
    const result = await locateTargetAcrossPages({
      targetId: 'non-existent',
      initialCursor: 'cursor-1',
      fetchPage: async (cursor) => {
        if (cursor === 'cursor-1') {
          return { items: [{ id: 'a' }], nextCursor: 'cursor-2' };
        }
        return { items: [{ id: 'b' }], nextCursor: null };
      },
      matchesTarget: (item, tid) => item.id === tid,
      maxPages: 10,
      isCancelled: () => false,
    });

    assert.equal(result.found, false);
    assert.equal(result.finalNextCursor, null);
    assert.equal(result.pagesFetched, 2);
    assert.equal(result.accumulatedItems.length, 2);
  });

  test('14. B6 P2: resolveStatementCustomer correctly coordinates customer resolution without overwriting target statement customer', () => {
    const customers = [
      { id: 'cust-default-A', name: 'Customer A' },
      { id: 'cust-target-B', name: 'Customer B' },
      { id: 'cust-target-C', name: 'Customer C' },
    ];

    // Case 1: Statement detail returned first with customer B, customer list finishes later -> preserves Customer B!
    const resolvedCase1 = resolveStatementCustomer({
      currentSelected: 'cust-target-B',
      statementCustomerId: 'cust-target-B',
      availableCustomers: customers,
      isTargetingStatement: true,
      statementFailed: false,
    });
    assert.equal(resolvedCase1, 'cust-target-B', 'Must not overwrite existing customer B with default customer A');

    // Case 2: Customer list finishes first while statement detail is in-flight -> returns empty string (waits for statement)
    const resolvedCase2 = resolveStatementCustomer({
      currentSelected: '',
      statementCustomerId: '',
      availableCustomers: customers,
      isTargetingStatement: true,
      statementFailed: false,
    });
    assert.equal(resolvedCase2, '', 'Must wait for target statement instead of defaulting to customer A');

    // Case 3: Statement detail failed (e.g. 404) -> falls back to first available customer
    const resolvedCase3 = resolveStatementCustomer({
      currentSelected: '',
      statementCustomerId: '',
      availableCustomers: customers,
      isTargetingStatement: true,
      statementFailed: true,
    });
    assert.equal(resolvedCase3, 'cust-default-A', 'Falls back to default customer A when statement fetch failed');

    // Case 4: Normal entry without statement targeting -> defaults to first customer
    const resolvedCase4 = resolveStatementCustomer({
      currentSelected: '',
      statementCustomerId: '',
      availableCustomers: customers,
      isTargetingStatement: false,
    });
    assert.equal(resolvedCase4, 'cust-default-A', 'Defaults to first customer when no target statement');

    // Case 5: Entry with initialCustomerId -> preserves initialCustomerId
    const resolvedCase5 = resolveStatementCustomer({
      currentSelected: '',
      initialCustomerId: 'cust-target-C',
      availableCustomers: customers,
      isTargetingStatement: false,
    });
    assert.equal(resolvedCase5, 'cust-target-C', 'Preserves initialCustomerId');
  });
});
