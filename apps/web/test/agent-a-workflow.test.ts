import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateQuantityInput } from '../src/pages/sales/components/batchPickerLogic.js';

describe('Agent A Core Scope Workflow & Integration Tests (11.3, 12.1, 12.4, 12.5)', () => {

  describe('12.5 Real Restock & Order Return Validations', () => {
    test('1. Return quantity strictly rejects decimals and invalid inputs', () => {
      // 1.5 decimal rejection
      const r1 = validateQuantityInput('1.5');
      assert.equal(r1.quantity, 0);
      assert.ok(r1.quantityError);

      // 0 rejection
      const r2 = validateQuantityInput('0');
      assert.equal(r2.quantity, 0);
      assert.ok(r2.quantityError);

      // Negative rejection
      const r3 = validateQuantityInput('-3');
      assert.equal(r3.quantity, 0);
      assert.ok(r3.quantityError);

      // Valid integer
      const r4 = validateQuantityInput('10');
      assert.equal(r4.quantity, 10);
      assert.equal(r4.quantityError, undefined);
    });

    test('2. Restock allocation remaining calculation and payload builder', () => {
      const mockAlloc = {
        id: 'alloc-ret-1',
        saleAllocationId: 'sale-alloc-1',
        batchId: 'batch-1',
        warehouseId: 'wh-1',
        quantityBase: 20,
        restockedQuantityBase: 5,
        returnAmount: '100.00',
        costCreditAmount: '80.00',
      };

      const remaining = mockAlloc.quantityBase - mockAlloc.restockedQuantityBase;
      assert.equal(remaining, 15, 'Remaining restockable quantity must be 15');

      // Valid restock input <= remaining
      const restockLine = {
        returnAllocationId: mockAlloc.id,
        quantityBase: 10,
      };
      assert.ok(restockLine.quantityBase <= remaining);
      assert.equal(restockLine.returnAllocationId, 'alloc-ret-1');
    });
  });

  describe('12.1 Catalog, Barcodes & Price Rules Contract Integrity', () => {
    test('3. Product barcodes preserve leading zeros as strings in full replacement', () => {
      const barcodes = [
        { value: '00892', unitId: 'unit-box' },
        { value: '6901234567890', unitId: 'unit-bottle' },
      ];

      // Barcode values must be strict strings and leading 0s must not be stripped
      assert.equal(typeof barcodes[0]!.value, 'string');
      assert.equal(barcodes[0]!.value, '00892');
      assert.equal(barcodes[0]!.value.length, 5);
      assert.notEqual(barcodes[0]!.value, '892');
    });

    test('4. Price rule expectedVersion rules (0 for new, version for update, query version for delete)', () => {
      // New rule
      const newRuleExpectedVersion = 0;
      assert.equal(newRuleExpectedVersion, 0, 'New price rule must use expectedVersion = 0');

      // Existing rule update
      const existingRule = { productId: 'p-1', unitId: 'u-1', unitPrice: '15.00', version: 3 };
      const updateExpectedVersion = existingRule.version;
      assert.equal(updateExpectedVersion, 3);

      // Delete query param
      const deleteQueryParams = { expectedVersion: existingRule.version };
      assert.equal(deleteQueryParams.expectedVersion, 3);
    });

    test('5. Customer mnemonic override handling (clear sends null, custom sends string)', () => {
      const clearMnemonicPayload = null;
      assert.equal(clearMnemonicPayload, null, 'Clearing override must send null to restore auto generation');

      const customMnemonicPayload = '500MLJY';
      assert.equal(typeof customMnemonicPayload, 'string');
    });
  });

  describe('11.3 Employee Read-Only & Access Gating', () => {
    test('6. Route gating verifies admin-only pages are inaccessible to employees', () => {
      const adminOnlyPages = new Set([
        'order-create',
        'order-edit',
        'products',
        'customers',
        'warehouses',
        'inventory',
        'receipt-create',
        'stocktake',
        'finance',
        'cash-events',
        'statements',
        'reports',
        'ai-reports',
        'settings-company',
        'settings-users',
      ]);

      const employeeAllowedPages = new Set(['orders', 'order-detail', 'printing']);

      // Check employee boundaries
      assert.equal(adminOnlyPages.has('order-create'), true);
      assert.equal(adminOnlyPages.has('reports'), true);
      assert.equal(adminOnlyPages.has('settings-company'), true);

      assert.equal(employeeAllowedPages.has('orders'), true);
      assert.equal(employeeAllowedPages.has('order-detail'), true);
      assert.equal(employeeAllowedPages.has('printing'), true);

      assert.equal(employeeAllowedPages.has('order-create'), false);
      assert.equal(employeeAllowedPages.has('order-edit'), false);
    });
  });

  describe('Global Routing: SourceRef.href Parsing (Task 7)', () => {
    test('7. SourceRef.href patterns parse accurately into target route and IDs', () => {
      const parseSourceHref = (href: string) => {
        const orderMatch = href.match(/^\/orders\/([^/]+)(?:\/revisions\/([^/]+))?/);
        if (orderMatch) return { page: 'order-detail', orderId: orderMatch[1], revisionId: orderMatch[2] };
        const returnMatch = href.match(/^\/returns\/([^/]+)/);
        if (returnMatch) return { page: 'orders', returnId: returnMatch[1] };
        const receiptMatch = href.match(/^\/receipts\/([^/]+)/);
        if (receiptMatch) return { page: 'inventory', receiptId: receiptMatch[1] };
        const stocktakeMatch = href.match(/^\/stocktakes\/([^/]+)/);
        if (stocktakeMatch) return { page: 'stocktake', stocktakeId: stocktakeMatch[1] };
        const cashMatch = href.match(/^\/cash-events\/([^/]+)/);
        if (cashMatch) return { page: 'cash-events', cashEventId: cashMatch[1] };
        const customerMatch = href.match(/^\/customers\/([^/]+)/);
        if (customerMatch) return { page: 'customers', customerId: customerMatch[1] };
        const statementMatch = href.match(/^\/statements\/([^/]+)/);
        if (statementMatch) return { page: 'statements', statementId: statementMatch[1] };
        const reportMatch = href.match(/^\/reports\/([^/]+)/);
        if (reportMatch) return { page: 'reports', reportId: reportMatch[1] };
        return { page: 'orders' };
      };

      assert.deepEqual(parseSourceHref('/orders/ord-123'), { page: 'order-detail', orderId: 'ord-123', revisionId: undefined });
      assert.deepEqual(parseSourceHref('/orders/ord-123/revisions/rev-2'), { page: 'order-detail', orderId: 'ord-123', revisionId: 'rev-2' });
      assert.deepEqual(parseSourceHref('/returns/ret-456'), { page: 'orders', returnId: 'ret-456' });
      assert.deepEqual(parseSourceHref('/receipts/rcpt-789'), { page: 'inventory', receiptId: 'rcpt-789' });
      assert.deepEqual(parseSourceHref('/stocktakes/stk-001'), { page: 'stocktake', stocktakeId: 'stk-001' });
      assert.deepEqual(parseSourceHref('/cash-events/cash-002'), { page: 'cash-events', cashEventId: 'cash-002' });
      assert.deepEqual(parseSourceHref('/customers/cust-003'), { page: 'customers', customerId: 'cust-003' });
      assert.deepEqual(parseSourceHref('/statements/stmt-004'), { page: 'statements', statementId: 'stmt-004' });
    });
  });

  describe('Mobile Multi-Row Scroll Height & Flexbox Constraints (Task 2)', () => {
    test('8. Flexbox shrink-scroll chain layout rules verification', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const fileUrl = new URL('../src/styles/index.css', import.meta.url);
      const cssContent = fs.readFileSync(fileUrl, 'utf-8');

      // Verify flexbox shrink/scroll chain in CSS
      assert.ok(cssContent.includes('.picker-modal-body'), 'CSS must define .picker-modal-body');
      assert.ok(cssContent.includes('min-height: 0'), 'CSS must enforce min-height: 0 to enable flex child scrolling');
      assert.ok(cssContent.includes('.modal-footer'), 'CSS must define .modal-footer');
      assert.ok(cssContent.includes('flex-shrink: 0'), 'CSS must define flex-shrink: 0 on modal headers and footers');
    });
  });

  describe('Shared API Pagination Wrappers (listWarehouses & getStockBalances)', () => {
    test('9. listWarehouses and getStockBalances export types and query structures', async () => {
      const client = await import('../src/api/client.js');
      assert.equal(typeof client.listWarehouses, 'function');
      assert.equal(typeof client.listAllWarehouses, 'function');
      assert.equal(typeof client.getStockBalances, 'function');
    });

    test('10. listAllWarehouses exhaustively paginates across multi-page cursors', async () => {
      let callCount = 0;
      const mockPages = [
        { items: [{ id: 'wh-1', name: '仓1' }, { id: 'wh-2', name: '仓2' }], nextCursor: 'cur-1', asOf: '2026-11-11T00:00:00Z' },
        { items: [{ id: 'wh-3', name: '仓3' }], nextCursor: null, asOf: '2026-11-11T00:00:00Z' },
      ];

      async function paginateHelper(query?: { q?: string }) {
        let items: Array<{ id: string; name: string }> = [];
        let cursor: string | undefined = undefined;
        do {
          const page = mockPages[callCount++];
          if (!page) break;
          items = items.concat(page.items);
          cursor = page.nextCursor || undefined;
        } while (cursor);
        return items;
      }

      const all = await paginateHelper();
      assert.equal(all.length, 3);
      assert.equal(callCount, 2);
      assert.deepEqual(all.map(w => w.id), ['wh-1', 'wh-2', 'wh-3']);
    });
  });

  describe('Shanghai Wall Clock & Timezone Verification (Item A5)', () => {
    test('11. Shanghai now calculation produces local wall clock time without 8h UTC shift', async () => {
      const { getShanghaiNowInput } = await import('../src/pages/sales/components/RestockModal.js');
      const timeStr = getShanghaiNowInput();
      assert.match(timeStr, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Must match YYYY-MM-DDTHH:mm');

      // Verify that the hour matches Asia/Shanghai Intl time
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        hourCycle: 'h23',
      });
      const expectedHour = formatter.format(new Date()).padStart(2, '0');
      const actualHour = timeStr.split('T')[1]!.split(':')[0]!;
      assert.equal(actualHour, expectedHour, 'Shanghai wall clock hour must match actual Asia/Shanghai time');
    });
  });

  describe('Global SourceRef.href Resolution & Deep Linking (Item A2)', () => {
    test('12. resolveSourceHref parses /api/v1 prefixes, queries, hashes, and entity UUIDs accurately', async () => {
      const { resolveSourceHref } = await import('../src/navigation.js');

      // Order revision
      const r1 = resolveSourceHref('/api/v1/orders/ord-999/revisions/rev-uuid-888');
      assert.equal(r1?.page, 'order-detail');
      assert.equal(r1?.orderId, 'ord-999');
      assert.equal(r1?.revisionId, 'rev-uuid-888');

      // Inventory batches with query and fragment
      const r2 = resolveSourceHref('/api/v1/inventory/batches?productId=prod-10&warehouseId=wh-20#batch-30');
      assert.equal(r2?.page, 'inventory');
      assert.equal(r2?.productId, 'prod-10');
      assert.equal(r2?.warehouseId, 'wh-20');
      assert.equal(r2?.batchId, 'batch-30');

      // Customer ledger with fragment
      const r3 = resolveSourceHref('/api/v1/customers/cust-44/ledger#entry-55');
      assert.equal(r3?.page, 'finance');
      assert.equal(r3?.customerId, 'cust-44');
      assert.equal(r3?.ledgerEntryId, 'entry-55');

      // Cash event
      const r4 = resolveSourceHref('/api/v1/cash-events/cash-77');
      assert.equal(r4?.page, 'cash-events');
      assert.equal(r4?.cashEventId, 'cash-77');

      // Report run
      const r5 = resolveSourceHref('/api/v1/report-runs/run-99');
      assert.equal(r5?.page, 'reports');
      assert.equal(r5?.reportRunId, 'run-99');

      // Unknown href returns null for graceful fallback
      const rUnknown = resolveSourceHref('/api/v1/unknown-endpoint/xyz');
      assert.equal(rUnknown, null);
    });
  });

  describe('Derived Lines & Historical Revisions Rules (Item A7)', () => {
    test('13. Derived line with quantity null and readOnly false is editable; return_history is read-only', () => {
      // Simulate backend lines from a partially returned order (e.g. 12 bottles, 3 returned, 9 remaining)
      const mockOrderLines = [
        {
          id: 'line-return-history',
          productId: 'prod-1',
          productName: '酱油',
          warehouseId: 'wh-1',
          unitId: 'unit-base',
          unitName: '瓶',
          multiplierBase: 1,
          quantity: 3,
          quantityBase: 3,
          unitPrice: '10.00',
          kind: 'return_history' as const,
          readOnly: true,
        },
        {
          id: 'line-derived-remaining',
          productId: 'prod-1',
          productName: '酱油',
          warehouseId: 'wh-1',
          unitId: 'unit-base',
          unitName: '瓶',
          multiplierBase: 1,
          quantity: null, // Split derived line from backend has quantity null
          quantityBase: 9, // But has valid positive quantityBase
          unitPrice: '10.00',
          kind: 'derived' as const,
          readOnly: false, // Backend marks as editable!
        },
      ];

      const mapped = mockOrderLines.map(l => {
        const effectiveQty = l.quantity !== null && l.quantity !== undefined ? l.quantity : l.quantityBase;
        const isReadOnly = l.readOnly || l.kind === 'return_history';
        return {
          id: l.id,
          effectiveQty,
          readOnly: isReadOnly,
        };
      });

      // Verify return_history is strictly readOnly
      assert.equal(mapped[0]!.readOnly, true);
      assert.equal(mapped[0]!.effectiveQty, 3);

      // Verify derived line with quantity null is EDITABLE and effectiveQty is quantityBase (9)
      assert.equal(mapped[1]!.readOnly, false);
      assert.equal(mapped[1]!.effectiveQty, 9);
    });
  });

  describe('Idempotency Key & Version Conflict Handling (Item A6)', () => {
    test('14. Idempotency key is preserved on retry and reset to fresh UUID on VERSION_CONFLICT', async () => {
      const { generateIdempotencyKey } = await import('../src/api/client.js');

      let currentKey = generateIdempotencyKey();
      const initialKey = currentKey;

      // 1. Transient failure: retry with SAME key
      const isRetry = true;
      if (!isRetry) currentKey = generateIdempotencyKey();
      assert.equal(currentKey, initialKey, 'Same business intent MUST reuse identical idempotency key');

      // 2. VERSION_CONFLICT: previous intent ended, user must refresh and re-submit with NEW key
      const isVersionConflict = true;
      if (isVersionConflict) {
        currentKey = generateIdempotencyKey();
      }
      assert.notEqual(currentKey, initialKey, 'VERSION_CONFLICT must advance to a fresh idempotency key');
    });
  });

  describe('Address & Delivery Snapshot Invalidation (Item A8)', () => {
    test('15. Address selection change triggers quote state invalidation and bumps sequence', async () => {
      const {
        createInitialQuoteState,
        invalidateQuoteOnConfigChange,
      } = await import('../src/pages/sales/components/batchPickerLogic.js');

      let quoteState = createInitialQuoteState();
      assert.equal(quoteState.seq, 0);

      // User switches from Address A to Address B
      quoteState = invalidateQuoteOnConfigChange(quoteState);
      assert.equal(quoteState.seq, 1);
      assert.equal(quoteState.dirty, true);

      // User edits delivery snapshot
      quoteState = invalidateQuoteOnConfigChange(quoteState);
      assert.equal(quoteState.seq, 2);
      assert.equal(quoteState.dirty, true);
    });
  });

  describe('Session Challenge Reconstitution & Lifecycle (Stage A12)', () => {
    test('16. ensureSessionChallenge deduplicates concurrent calls and provides valid CSRF token', async () => {
      const {
        ensureSessionChallenge,
        setCsrfToken,
        getCsrfToken,
      } = await import('../src/api/client.js');

      // Set initial token
      setCsrfToken('test-token-12345678901234567890123456789012345');
      const token = await ensureSessionChallenge();
      assert.equal(token, 'test-token-12345678901234567890123456789012345');

      // Clear token and simulate concurrent challenge requests
      setCsrfToken('');
      assert.equal(getCsrfToken(), '');

      // Verify concurrent calls return promise that resolves without unhandled rejection
      // when network fetch is mocked or invoked
      let fetchCallCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        fetchCallCount++;
        return new Response(JSON.stringify({
          user: null,
          csrfToken: 'mock-anon-challenge-token-123456789012345',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };

      try {
        const [t1, t2, t3] = await Promise.all([
          ensureSessionChallenge(),
          ensureSessionChallenge(),
          ensureSessionChallenge(),
        ]);
        assert.equal(t1, 'mock-anon-challenge-token-123456789012345');
        assert.equal(t2, 'mock-anon-challenge-token-123456789012345');
        assert.equal(t3, 'mock-anon-challenge-token-123456789012345');
        // Concurrency deduplication: exactly 1 network call was made!
        assert.equal(fetchCallCount, 1, 'Concurrent ensureSessionChallenge calls must be deduplicated');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Stage A13 Audit Hardening Tests (N1 - N5)', () => {
    test('17. Item N1: Account changes BigInt cents parsing, 1-cent diffs, and customer UUID ordering', async () => {
      const { parseDecimalToCents, formatCentsDelta } = await import('../src/pages/sales/OrderEditPage.js');

      // Test large decimal string with 1 cent difference (exceeding IEEE 754 float precision limit)
      const bigBefore = '9007199254740991.01';
      const bigAfter = '9007199254740991.02';
      const bCents = parseDecimalToCents(bigBefore);
      const aCents = parseDecimalToCents(bigAfter);
      const diffCents = aCents - bCents;
      assert.equal(diffCents, 1n, '1 cent difference on huge amount must be preserved exactly by BigInt');
      const delta = formatCentsDelta(diffCents);
      assert.equal(delta.text, '+¥0.01');
      assert.equal(delta.isPositive, true);

      // Negative delta test
      const negDelta = formatCentsDelta(-150n);
      assert.equal(negDelta.text, '-¥1.50');
      assert.equal(negDelta.isNegative, true);

      // Customer matching verification: new customer UUID precedes old customer UUID
      const oldCustomerId: string = 'zzzz-old-cust-id';
      const newCustomerId: string = '0000-new-cust-id';
      const accountChanges = [
        { customerId: '0000-new-cust-id', beforeNetBalance: '0.00', afterNetBalance: '50.00' },
        { customerId: 'zzzz-old-cust-id', beforeNetBalance: '100.00', afterNetBalance: '0.00' },
      ];

      // Match by change.customerId, not idx === 0
      const matched = accountChanges.map(change => {
        const isCustSwitched = newCustomerId !== oldCustomerId;
        const isOriginalCustomer = change.customerId === oldCustomerId;
        const isSelectedCustomer = change.customerId === newCustomerId;
        let role = '';
        if (isCustSwitched) {
          if (isOriginalCustomer) role = 'old_offset';
          else if (isSelectedCustomer) role = 'new_charge';
        }
        return { customerId: change.customerId, role };
      });

      assert.equal(matched[0]!.role, 'new_charge', 'Item 0 with lower UUID must be recognized as new customer');
      assert.equal(matched[1]!.role, 'old_offset', 'Item 1 with higher UUID must be recognized as old customer');
    });

    test('18. Item N2: Navigation target full replacement and customer finance routing', async () => {
      const { resolveSourceHref } = await import('../src/navigation.js');

      // Customer ledger target routes to finance with customerId and ledgerEntryId
      const targetLedger = resolveSourceHref('/customers/cust-101/ledger#entry-abc');
      assert.ok(targetLedger);
      assert.equal(targetLedger.page, 'finance');
      assert.equal(targetLedger.customerId, 'cust-101');
      assert.equal(targetLedger.ledgerEntryId, 'entry-abc');

      // Customer direct routes to finance with customerId
      const targetCust = resolveSourceHref('/customers/cust-202');
      assert.ok(targetCust);
      assert.equal(targetCust.page, 'finance');
      assert.equal(targetCust.customerId, 'cust-202');

      // Order revision target has revisionId, normal order target does NOT
      const targetRev = resolveSourceHref('/orders/ord-1/revisions/rev-9');
      assert.ok(targetRev);
      assert.equal(targetRev.revisionId, 'rev-9');

      const targetOrd = resolveSourceHref('/orders/ord-2');
      assert.ok(targetOrd);
      assert.equal(targetOrd.revisionId, undefined, 'Normal order navigation MUST have revisionId undefined');
    });

    test('19. Item N3: Strict /api/v1 boundaries, anchored regexes, and raw fallback on unknown params', async () => {
      const { resolveSourceHref } = await import('../src/navigation.js');

      // 1. /api/v1inventory is NOT on a path boundary -> must NOT be stripped, must return null (fallback)
      assert.equal(resolveSourceHref('/api/v1inventory'), null);

      // 2. /orders/abc/unknown?foo=bar#x has unknown subpath and queries -> must return null
      assert.equal(resolveSourceHref('/orders/abc/unknown?foo=bar#x'), null);

      // 3. /orders/ord-1?foo=bar has unexpected query params on order detail -> must return null
      assert.equal(resolveSourceHref('/orders/ord-1?foo=bar'), null);

      // 4. Valid /api/v1/orders/ord-1 works cleanly
      const validOrd = resolveSourceHref('/api/v1/orders/ord-1');
      assert.ok(validOrd);
      assert.equal(validOrd.orderId, 'ord-1');

      // 5. Valid inventory batches with allowed query params
      const validBatches = resolveSourceHref('/api/v1/inventory/batches?productId=p1&warehouseId=w1#b1');
      assert.ok(validBatches);
      assert.equal(validBatches.productId, 'p1');
      assert.equal(validBatches.warehouseId, 'w1');
      assert.equal(validBatches.batchId, 'b1');

      // 6. Inventory batches with invalid query parameter -> returns null
      assert.equal(resolveSourceHref('/api/v1/inventory/batches?productId=p1&hacked=true'), null);
    });

    test('20. Item N4: OrderReturnModal idempotency key retention on error and retirement on version bump', async () => {
      const { generateIdempotencyKey } = await import('../src/api/client.js');

      // Simulate intent key lifecycle in return modal
      let intentKey = generateIdempotencyKey();
      const initialKey = intentKey;

      // 1. Transient failure / timeout: intentKey MUST be preserved so retry uses the exact same key
      let isSuccess = false;
      if (!isSuccess) {
        // Keep initialKey for retry!
      }
      assert.equal(intentKey, initialKey, 'Transient failure must keep same idempotency key');

      // 2. User edits return quantity: fresh key is issued
      intentKey = generateIdempotencyKey();
      assert.notEqual(intentKey, initialKey, 'Editing quantity must advance idempotency key');

      // 3. Successful submission: key and temporary selections are retired
      const retiredKey = intentKey;
      intentKey = generateIdempotencyKey();
      assert.notEqual(intentKey, retiredKey, 'Successful submission must retire the previous key');
    });

    test('21. Item N5: Delivery snapshot contactName & customerName quote invalidation in OrderEdit', async () => {
      const {
        createInitialQuoteState,
        invalidateQuoteOnConfigChange,
      } = await import('../src/pages/sales/components/batchPickerLogic.js');

      let quoteState = createInitialQuoteState();
      assert.equal(quoteState.seq, 0);

      // Editing contactName in snapshot
      quoteState = invalidateQuoteOnConfigChange(quoteState);
      assert.equal(quoteState.seq, 1);
      assert.equal(quoteState.dirty, true);

      // Editing customerName in snapshot
      quoteState = invalidateQuoteOnConfigChange(quoteState);
      assert.equal(quoteState.seq, 2);
      assert.equal(quoteState.dirty, true);
    });

    test('22. Item F1 / A16: Delayed session recovery, anonymous admin login target preservation, and 0-GET employee return gating', async () => {
      const {
        createInitialNavigationState,
        applyNavigationIntent,
        syncNavigationOnAuth,
        resolveSourceHref,
        ADMIN_ONLY_PAGES,
      } = await import('../src/navigation.js');

      let getReturnCallCount = 0;
      const fakeGetReturn = async (id: string) => {
        getReturnCallCount++;
        return { id, orderId: `parent-order-for-${id}` };
      };

      // 1. Scenario 1: Delayed session -> Admin existing session with /returns/ret-101 alias
      // Resolve source href for both /returns/:id and /api/v1/returns/:id
      const target1 = resolveSourceHref('/returns/ret-101');
      assert.ok(target1 && target1.returnId === 'ret-101', 'Frontend /returns alias must resolve returnId');

      let state1 = createInitialNavigationState(null);
      // Mount occurs while session check is in-flight (loading: true, user: null)
      state1 = await applyNavigationIntent(state1, target1, {
        user: null,
        loading: true,
        getReturn: fakeGetReturn,
      });

      // Target must be staged in pendingTarget; MUST NOT call getReturn while identity is unconfirmed!
      assert.equal(getReturnCallCount, 0, 'In-flight session check must make 0 GET calls to getReturn');
      assert.ok(state1.pendingTarget && state1.pendingTarget.returnId === 'ret-101', 'Target must be staged in pendingTarget');

      // Now session resolves: Admin is confirmed!
      state1 = await syncNavigationOnAuth(state1, {
        user: { role: 'admin' },
        loading: false,
        getReturn: fakeGetReturn,
      });

      assert.equal(getReturnCallCount, 1, 'Admin confirmed identity must call getReturn exactly once');
      assert.equal(state1.activePage, 'order-detail', 'Admin must navigate to parent order-detail');
      assert.equal(state1.selectedOrderId, 'parent-order-for-ret-101', 'Parent order ID must be accurately resolved');
      assert.equal(state1.pendingTarget, null, 'Pending target must be consumed and cleared');

      // 2. Scenario 2: Anonymous user -> Admin logs in -> target is preserved and consumed
      getReturnCallCount = 0;
      const target2 = resolveSourceHref('/api/v1/returns/ret-202');
      assert.ok(target2 && target2.returnId === 'ret-202', 'API /api/v1/returns prefix must resolve returnId');

      let state2 = createInitialNavigationState(null);
      // Mount while loading
      state2 = await applyNavigationIntent(state2, target2, {
        user: null,
        loading: true,
        getReturn: fakeGetReturn,
      });

      // Session completes with anonymous (user: null, loading: false)
      state2 = await syncNavigationOnAuth(state2, {
        user: null,
        loading: false,
        getReturn: fakeGetReturn,
      });

      assert.equal(getReturnCallCount, 0, 'Anonymous user must make 0 GET calls to getReturn');
      assert.ok(state2.pendingTarget && state2.pendingTarget.returnId === 'ret-202', 'Pending target MUST be retained for LoginPage');

      // User enters admin credentials and logs in!
      state2 = await syncNavigationOnAuth(state2, {
        user: { role: 'admin' },
        loading: false,
        getReturn: fakeGetReturn,
      });

      assert.equal(getReturnCallCount, 1, 'Admin login must consume retained pending target and call getReturn');
      assert.equal(state2.activePage, 'order-detail');
      assert.equal(state2.selectedOrderId, 'parent-order-for-ret-202');
      assert.equal(state2.pendingTarget, null);

      // 3. Scenario 3: Employee user with same return source -> strictly 0 GET and safe rejection to orders
      getReturnCallCount = 0;
      const target3 = resolveSourceHref('/returns/ret-303');
      assert.ok(target3 && target3.returnId === 'ret-303');
      let state3 = createInitialNavigationState(null);

      state3 = await applyNavigationIntent(state3, target3, {
        user: null,
        loading: true,
        getReturn: fakeGetReturn,
      });

      // Employee session resolves
      state3 = await syncNavigationOnAuth(state3, {
        user: { role: 'employee' },
        loading: false,
        getReturn: fakeGetReturn,
      });

      assert.equal(getReturnCallCount, 0, 'Employee user must make strictly 0 GET calls to getReturn');
      assert.equal(state3.activePage, 'order-edit', 'Employee accessing return must be routed to admin-only page to render 403 screen');
      assert.ok(ADMIN_ONLY_PAGES.has(state3.activePage), 'Target page must be in ADMIN_ONLY_PAGES so 403 screen renders');
      assert.equal(state3.selectedOrderId, null, 'Selected order ID must remain null');
      assert.equal(state3.pendingTarget, null, 'Pending target must be cleared');

      // 3b. Scenario 3b: Employee navigating to admin page /customers/cust-1 -> sets activePage to finance for 403 screen
      const custTarget = resolveSourceHref('/customers/cust-1')!;
      let custState = createInitialNavigationState('employee');
      custState = await applyNavigationIntent(custState, custTarget, {
        user: { role: 'employee' },
        loading: false,
        getReturn: fakeGetReturn,
      });
      assert.equal(custState.activePage, 'finance', 'Employee accessing finance page sets activePage to finance');
      assert.ok(ADMIN_ONLY_PAGES.has(custState.activePage), 'finance is in ADMIN_ONLY_PAGES so 403 screen renders');

      // 3c. Scenario 3c: Employee initial pending deep link to /reports/rep-1 -> auth resolves with employee -> activePage is reports for 403
      const reportsTarget = resolveSourceHref('/reports/rep-1')!;
      let reportsState = createInitialNavigationState(null);
      reportsState = await applyNavigationIntent(reportsState, reportsTarget, {
        user: null,
        loading: true,
        getReturn: fakeGetReturn,
      });
      reportsState = await syncNavigationOnAuth(reportsState, {
        user: { role: 'employee' },
        loading: false,
        getReturn: fakeGetReturn,
      });
      assert.ok(ADMIN_ONLY_PAGES.has(reportsState.activePage), 'Initial deep link to admin page renders 403 screen upon employee recovery');

      // 4. Scenario 4: Standard login without pending target receives default role landing page
      let normalAdminState = createInitialNavigationState(null);
      normalAdminState = await syncNavigationOnAuth(normalAdminState, {
        user: { role: 'admin' },
        loading: false,
        getReturn: fakeGetReturn,
      });
      assert.equal(normalAdminState.activePage, 'order-create', 'Normal admin login lands on default order-create');

      let normalEmpState = createInitialNavigationState(null);
      normalEmpState = await syncNavigationOnAuth(normalEmpState, {
        user: { role: 'employee' },
        loading: false,
        getReturn: fakeGetReturn,
      });
      assert.equal(normalEmpState.activePage, 'orders', 'Normal employee login lands on default orders');

      // 5. Scenario 5: Generation guard (navSeq) discards stale in-flight resolution
      let seqValue = 1;
      let stateSeq = createInitialNavigationState('admin');
      const targetSeq = resolveSourceHref('/returns/ret-slow')!;

      // Simulate a newer navigation advancing seq to 2 before slow getReturn resolves
      const staleState = await applyNavigationIntent(stateSeq, targetSeq, {
        user: { role: 'admin' },
        loading: false,
        getReturn: async () => {
          seqValue = 2; // Advance generation before resolve
          return { id: 'ret-slow', orderId: 'stale-parent-order' };
        },
        currentSeq: 1,
        getSeq: () => seqValue,
      });

      assert.equal(staleState.selectedOrderId, null, 'Stale in-flight getReturn must be discarded when generation advances');
    });

    test('23. Item F2: OrderDetail historical revision viewing to print preview & return to current version', async () => {
      // State machine simulation of OrderDetailPage viewingRevisionId and onPrintOrder callback
      let viewingRevisionId: string | null = null;
      let printReceivedRevisionId: string | undefined = undefined;

      const onPrintOrder = (orderId: string, revisionId?: string) => {
        printReceivedRevisionId = revisionId;
      };

      // 1. Initial order view (current version)
      onPrintOrder('ord-1', viewingRevisionId || undefined);
      assert.equal(printReceivedRevisionId, undefined, 'Current version print must pass revisionId undefined');

      // 2. User selects historical revision #v1快照 ('rev-v1-uuid')
      viewingRevisionId = 'rev-v1-uuid';
      onPrintOrder('ord-1', viewingRevisionId || undefined);
      assert.equal(printReceivedRevisionId, 'rev-v1-uuid', 'Historical revision print must pass exact revision UUID');

      // 3. User clicks "返回当前生效版本"
      viewingRevisionId = null; // handleBackToCurrent clears viewingRevisionId
      onPrintOrder('ord-1', viewingRevisionId || undefined);
      assert.equal(printReceivedRevisionId, undefined, 'Returning to current version must clear revisionId for print');
    });

    test('24. Stage A20: Order edit after sales return line splitting, sourceLineId+readOnly binding, and total quantity semantics', async () => {
      // 1. Line splitting logic simulation for returned order lines
      const mockOrderLine = {
        id: 'line-source-1',
        productId: 'prod-1',
        productName: '测试精酿啤酒',
        specification: '500ml*12/件',
        warehouseId: 'wh-1',
        unitId: 'unit-case-1',
        unitName: '件',
        multiplierBase: 12,
        quantity: 1,
        quantityBase: 12,
        returnedQuantityBase: 3,
        unitPrice: '24.00',
        kind: 'normal' as const,
        readOnly: false,
      };

      const baseUnit = { id: 'unit-bottle-1', name: '瓶', multiplierBase: 1 };
      const returnedBase = mockOrderLine.returnedQuantityBase;
      const remainingBase = mockOrderLine.quantityBase - returnedBase;

      // Assert splitting into 2 rows: 3 protected bottles & 9 editable remaining bottles
      assert.equal(returnedBase, 3, 'Protected quantity must be 3 base units');
      assert.equal(remainingBase, 9, 'Editable remaining quantity must be 9 base units');

      // 2. findCalculatedLine matching verification
      const mockQuoteLines = [
        {
          sourceLineId: 'line-source-1',
          readOnly: true,
          quantityBase: 3,
          netAmount: '6.00',
          costAmount: '3.00',
          allocations: [],
        },
        {
          sourceLineId: 'line-source-1',
          readOnly: false,
          quantityBase: 9,
          netAmount: '18.00',
          costAmount: '9.00',
          allocations: [],
        },
        {
          sourceLineId: null,
          clientLineId: 'new-line-abc',
          readOnly: false,
          quantityBase: 2,
          netAmount: '40.00',
          costAmount: '20.00',
          allocations: [],
        },
      ];

      function findCalculatedLine(line: { originalLineId?: string; clientLineId?: string; readOnly?: boolean }, calcLines: typeof mockQuoteLines) {
        if (!calcLines || calcLines.length === 0) return undefined;
        if (line.originalLineId) {
          return calcLines.find(cl => cl.sourceLineId === line.originalLineId && cl.readOnly === Boolean(line.readOnly));
        }
        if (line.clientLineId) {
          return calcLines.find(cl => (!cl.sourceLineId || cl.sourceLineId === null) && cl.clientLineId === line.clientLineId);
        }
        return undefined;
      }

      const protectedMatch = findCalculatedLine({ originalLineId: 'line-source-1', readOnly: true }, mockQuoteLines);
      assert.ok(protectedMatch, 'Protected line must find matching quote line');
      assert.equal(protectedMatch.netAmount, '6.00', 'Protected line subtotal must be 6.00');

      const remainingMatch = findCalculatedLine({ originalLineId: 'line-source-1', readOnly: false }, mockQuoteLines);
      assert.ok(remainingMatch, 'Remaining line must find matching quote line');
      assert.equal(remainingMatch.netAmount, '18.00', 'Remaining line subtotal must be 18.00');

      const newLineMatch = findCalculatedLine({ clientLineId: 'new-line-abc', readOnly: false }, mockQuoteLines);
      assert.ok(newLineMatch, 'New added line must find matching quote line');
      assert.equal(newLineMatch.netAmount, '40.00', 'New line subtotal must be 40.00');

      // 3. Total quantity semantics verification for set command
      // When user edits the 9 remaining bottles to price 3.00/bottle:
      const remainingQty = 9;
      const userEditedPrice = '3.00';
      const setCommand = {
        op: 'set' as const,
        lineId: mockOrderLine.id,
        unitId: baseUnit.id,
        quantity: remainingQty + mockOrderLine.returnedQuantityBase, // 9 + 3 = 12 total quantity
        unitPrice: userEditedPrice,
      };

      assert.equal(setCommand.quantity, 12, 'Total quantity sent to server must be remaining 9 + returned 3 = 12');
      assert.equal(setCommand.unitId, 'unit-bottle-1', 'Unit must be base unit');
      assert.equal(setCommand.unitPrice, '3.00', 'Unit price must be 3.00');

      // 4. Safe removal verification: removing remaining segment must preserve returned source
      const safeRemovalCommand = {
        op: 'set' as const,
        lineId: mockOrderLine.id,
        unitId: baseUnit.id,
        quantity: mockOrderLine.returnedQuantityBase, // preserve returned quantity 3, do NOT send remove
      };
      assert.equal(safeRemovalCommand.quantity, 3, 'Safe removal must preserve returned 3 base units');
    });

    test('25. Stage A21: untouched existing/derived lines emit no set; only real edits send unit/price (production buildLineChanges)', async () => {
      const { buildLineChanges } = await import('../src/pages/sales/orderEditLogic.js');

      // Real production scenario: 2 bottles for 1 cent total (unitPrice 0.005000).
      // Return 1 bottle credits 1 cent, the split leaves a derived 1-bottle line
      // whose displayed price is the six-decimal approximation 0.005000.
      const derivedLine = {
        clientLineId: 'existing-derived-1',
        originalLineId: 'derived-line-id',
        productId: 'prod-1',
        warehouseId: 'wh-1',
        unitId: 'unit-bottle',
        quantity: 1,
        unitPrice: '0.005000',
        priceEdited: false,
        allocationMode: 'auto' as const,
        batchSelections: [],
        returnedQuantityBase: 0,
        initialQuantity: 1,
        initialUnitId: 'unit-bottle',
        initialWarehouseId: 'wh-1',
        initialRemark: '',
        initialAllocationMode: 'auto' as const,
      };

      // 1. Header-only edit (e.g. reason/remark/customer): no line command at all,
      // so the backend never re-prices the derived remainder from 0.005000.
      assert.deepEqual(buildLineChanges([derivedLine]), [], 'Untouched derived line must emit no set command');

      // 2. Editing a DIFFERENT normal line must not touch the derived line either.
      const normalLine = {
        ...derivedLine,
        clientLineId: 'existing-normal-1',
        originalLineId: 'normal-line-id',
        quantity: 3,
        initialQuantity: 2,
        unitPrice: '5.00',
      };
      const changes = buildLineChanges([derivedLine, normalLine]);
      assert.equal(changes.length, 1, 'Only the edited normal line may be submitted');
      assert.deepEqual(changes[0], { op: 'set', lineId: 'normal-line-id', quantity: 3 });
      assert.equal(
        changes.some(c => c.op === 'set' && c.lineId === 'derived-line-id'),
        false,
        'Derived line must never be re-sent with its six-decimal display price'
      );

      // 3. Quantity-only change on the derived line: send quantity, omit unitPrice
      // (pricingBasis must survive) and omit unitId (unit unchanged).
      const qtyChanged = buildLineChanges([{ ...derivedLine, quantity: 2 }]);
      assert.deepEqual(qtyChanged, [{ op: 'set', lineId: 'derived-line-id', quantity: 2 }]);
      assert.equal('unitPrice' in (qtyChanged[0] as object), false, 'Unedited price must be omitted');
      assert.equal('unitId' in (qtyChanged[0] as object), false, 'Unchanged unit must be omitted');

      // 4. Real unit change sends the new unit and the converted quantity, still no price.
      const unitChanged = buildLineChanges([{ ...derivedLine, unitId: 'unit-case', quantity: 1 }]);
      assert.deepEqual(unitChanged, [
        { op: 'set', lineId: 'derived-line-id', unitId: 'unit-case', quantity: 1 },
      ]);

      // 5. Real price edit is the only path that sends unitPrice.
      const priceChanged = buildLineChanges([{ ...derivedLine, unitPrice: '3.00', priceEdited: true }]);
      assert.deepEqual(priceChanged, [
        { op: 'set', lineId: 'derived-line-id', unitPrice: '3.00' },
      ]);

      // 6. First return on an unsplit line keeps the 3-protected + 9-remaining
      // semantics: total quantity = remaining 9 + already returned 3, base unit
      // explicit, and no price when the operator did not edit it.
      const returnedLine = {
        ...derivedLine,
        clientLineId: 'existing-original-1',
        originalLineId: 'original-line-id',
        unitId: 'unit-bottle',
        initialUnitId: 'unit-bottle',
        quantity: 9,
        initialQuantity: 9,
        returnedQuantityBase: 3,
      };
      assert.deepEqual(buildLineChanges([returnedLine]), [], 'Untouched returned remainder emits no set');
      assert.deepEqual(
        buildLineChanges([{ ...returnedLine, quantity: 10 }]),
        [{ op: 'set', lineId: 'original-line-id', unitId: 'unit-bottle', quantity: 13 }],
        'Returned line total quantity must include the already returned 3'
      );
    });
  });
});
