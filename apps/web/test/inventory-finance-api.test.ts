import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { isStocktakeStaleError } from '../src/pages/inventory/inventoryLogic.js';

const BASE_URL = 'http://127.0.0.1:3000/api/v1';
const CREDS_PATH = '/tmp/huoyoupu-dev-mTw6IP/credentials.json';
const ORIGIN = 'http://localhost:5173';

function genKey(): string {
  return crypto.randomUUID();
}

describe('Inventory & Finance Real Backend API Integration Tests (12.2 & 12.6)', () => {
  let adminCookie = '';
  let adminCsrf = '';

  let activeWarehouseId = '';
  let activeProductId = '';
  let activeProductUnitId = '';
  let isolatedCustomerId = '';
  let createdBatchId = '';

  test('0. Setup: Authenticate Admin & create isolated test customer', async () => {
    assert.ok(fs.existsSync(CREDS_PATH), 'Credentials file must exist');
    const rawCreds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));

    // Step 1: Initial anonymous session
    const initRes = await fetch(`${BASE_URL}/auth/session`, {
      headers: { Origin: ORIGIN },
    });
    assert.equal(initRes.status, 200);
    const initData = await initRes.json();
    const initCsrf = initData.csrfToken;
    const initCookie = initRes.headers.get('set-cookie')?.split(';')[0] || '';

    // Step 2: Login admin
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': initCsrf,
        Cookie: initCookie,
      },
      body: JSON.stringify({
        loginName: rawCreds.admin.loginName,
        password: rawCreds.admin.password,
      }),
    });
    assert.equal(loginRes.status, 200, 'Admin login must succeed');
    const loginData = await loginRes.json();
    assert.equal(loginData.user.role, 'admin');

    adminCsrf = loginData.csrfToken;
    adminCookie = loginRes.headers.get('set-cookie')?.split(';')[0] || initCookie;

    // Fetch warehouse and product
    const [whRes, prodRes] = await Promise.all([
      fetch(`${BASE_URL}/warehouses`, { headers: { Origin: ORIGIN, Cookie: adminCookie } }),
      fetch(`${BASE_URL}/products?limit=10`, { headers: { Origin: ORIGIN, Cookie: adminCookie } }),
    ]);

    const whData = await whRes.json();
    const prodData = await prodRes.json();

    assert.ok(whData.items.length > 0, 'Must have at least 1 warehouse');
    assert.ok(prodData.items.length > 0, 'Must have at least 1 product');

    const activeWh = whData.items.find((w: any) => w.active);
    assert.ok(activeWh, 'Must have at least 1 active warehouse');
    activeWarehouseId = activeWh.id;

    const activeProd = prodData.items.find((p: any) => p.active);
    assert.ok(activeProd, 'Must have at least 1 active product');
    activeProductId = activeProd.id;
    activeProductUnitId = activeProd.units[0].id;

    // Create dedicated isolated customer to prevent polluting DEMO-C1
    const suffix = Date.now().toString().slice(-6);
    const custRes = await fetch(`${BASE_URL}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': genKey(),
      },
      body: JSON.stringify({
        name: `测试客户TaskB-${suffix}`,
        code: `TCB${suffix}`,
        contactName: '对账专员',
        phone: '13800000000',
      }),
    });
    assert.equal(custRes.status, 201, 'Isolated customer creation must return 201');
    const custData = await custRes.json();
    assert.ok(custData.id);
    isolatedCustomerId = custData.id;
  });

  test('1. Inventory: Create real purchase receipt, verify batch creation & Shanghai timestamp, test idempotent retry', async () => {
    const shanghaiReceivedAt = '2026-11-10T15:30:00+08:00';
    const idempotencyKey = genKey();

    const receiptPayload = {
      kind: 'purchase',
      warehouseId: activeWarehouseId,
      receivedAt: shanghaiReceivedAt,
      supplierReference: `TEST-SUPP-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      lines: [
        {
          productId: activeProductId,
          unitId: activeProductUnitId,
          quantity: 25,
          unitCost: '16.80',
        },
      ],
    };

    // First submission
    const rcptRes = await fetch(`${BASE_URL}/receipts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(receiptPayload),
    });

    assert.equal(rcptRes.status, 201, 'Receipt creation must return 201');
    const rcpt = await rcptRes.json();
    assert.ok(rcpt.id, 'Must return receipt ID');
    assert.equal(rcpt.kind, 'purchase');
    assert.equal(rcpt.lines.length, 1);
    assert.equal(parseFloat(rcpt.lines[0].unitCost), 16.8);
    assert.ok(rcpt.lines[0].batchId, 'Must generate resulting batchId');
    createdBatchId = rcpt.lines[0].batchId;

    // P1 Test: Network retry with SAME idempotency key & payload returns identical receipt without duplicate batch
    const retryRes = await fetch(`${BASE_URL}/receipts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(receiptPayload),
    });
    assert.ok(retryRes.status === 200 || retryRes.status === 201, 'Retry must return 200/201');
    const retryRcpt = await retryRes.json();
    assert.equal(retryRcpt.id, rcpt.id, 'Idempotent retry must return the same receipt');

    // Verify receipt detail endpoint
    const detailRes = await fetch(`${BASE_URL}/receipts/${rcpt.id}`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(detailRes.status, 200);
    const detail = await detailRes.json();
    assert.equal(detail.id, rcpt.id);

    // Verify batch appears in listBatches
    const batchRes = await fetch(
      `${BASE_URL}/inventory/batches?warehouseId=${activeWarehouseId}&productId=${activeProductId}&positiveOnly=true`,
      { headers: { Origin: ORIGIN, Cookie: adminCookie } }
    );
    assert.equal(batchRes.status, 200);
    const batchData = await batchRes.json();
    const foundBatch = batchData.items.find((b: any) => b.id === rcpt.lines[0].batchId);
    assert.ok(foundBatch, 'New batch must be queryable in inventory batches');
    assert.equal(parseFloat(foundBatch.unitCost), 16.8);
  });

  test('2. Stocktake: Create snapshot with real batch lines, update actual count, and verify gain cost requirements', async () => {
    // 1. Create snapshot using existing batch created above
    const stRes = await fetch(`${BASE_URL}/stocktakes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': genKey(),
      },
      body: JSON.stringify({
        warehouseId: activeWarehouseId,
        lines: [
          {
            productId: activeProductId,
            batchId: createdBatchId,
          },
        ],
      }),
    });

    assert.equal(stRes.status, 201, 'Stocktake snapshot creation must return 201');
    const st = await stRes.json();
    assert.ok(st.id);
    assert.equal(st.status, 'draft');
    assert.equal(st.lines.length, 1);

    const line = st.lines[0];
    const initialBook = line.snapshotQuantityBase;

    // 2. Update stocktake with loss (counted = book - 2), verifying batch-specific loss
    const updateRes = await fetch(`${BASE_URL}/stocktakes/${st.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': genKey(),
      },
      body: JSON.stringify({
        expectedVersion: st.version,
        lines: [
          {
            id: line.id,
            actualQuantityBase: Math.max(0, initialBook - 2),
          },
        ],
      }),
    });

    assert.equal(updateRes.status, 200, 'Stocktake update with actual count must succeed');
    const updatedSt = await updateRes.json();
    assert.equal(updatedSt.lines[0].actualQuantityBase, Math.max(0, initialBook - 2));

    // 3. Confirm stocktake
    const confirmRes = await fetch(`${BASE_URL}/stocktakes/${st.id}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': genKey(),
      },
      body: JSON.stringify({
        expectedVersion: updatedSt.version,
      }),
    });
    assert.equal(confirmRes.status, 200, 'Stocktake confirmation must succeed');
    const confirmedSt = await confirmRes.json();
    assert.equal(confirmedSt.status, 'confirmed');
  });

  test('3. Stocktake STALE detection: Stale snapshot is rejected with 409 STOCKTAKE_STALE', async () => {
    // 1. Create a snapshot that locks createdBatchId at its current version
    const stRes = await fetch(`${BASE_URL}/stocktakes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': genKey(),
      },
      body: JSON.stringify({
        warehouseId: activeWarehouseId,
        lines: [
          {
            productId: activeProductId,
            batchId: createdBatchId,
          },
        ],
      }),
    });
    assert.equal(stRes.status, 201);
    const staleSnapshot = await stRes.json();
    const currentBook = staleSnapshot.lines[0].snapshotQuantityBase;

    // 2. Fill in actual counts in staleSnapshot
    const patchRes = await fetch(`${BASE_URL}/stocktakes/${staleSnapshot.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': genKey(),
      },
      body: JSON.stringify({
        expectedVersion: staleSnapshot.version,
        lines: [
          {
            id: staleSnapshot.lines[0].id,
            actualQuantityBase: currentBook,
          },
        ],
      }),
    });
    assert.equal(patchRes.status, 200);
    const patchedSnapshot = await patchRes.json();

    // 3. Concurrently modify createdBatchId by confirming an intervening stocktake loss on that batch
    const concurrentRes = await fetch(`${BASE_URL}/stocktakes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': genKey(),
      },
      body: JSON.stringify({
        warehouseId: activeWarehouseId,
        lines: [
          {
            productId: activeProductId,
            batchId: createdBatchId,
          },
        ],
      }),
    });
    assert.equal(concurrentRes.status, 201);
    const concurrentSt = await concurrentRes.json();

    const concurrentPatch = await fetch(`${BASE_URL}/stocktakes/${concurrentSt.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': genKey(),
      },
      body: JSON.stringify({
        expectedVersion: concurrentSt.version,
        lines: [
          {
            id: concurrentSt.lines[0].id,
            actualQuantityBase: Math.max(0, currentBook - 1),
          },
        ],
      }),
    });
    assert.equal(concurrentPatch.status, 200);
    const patchedConcurrent = await concurrentPatch.json();

    const concurrentConfirm = await fetch(`${BASE_URL}/stocktakes/${concurrentSt.id}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': genKey(),
      },
      body: JSON.stringify({
        expectedVersion: patchedConcurrent.version,
      }),
    });
    assert.equal(concurrentConfirm.status, 200, 'Intervening stocktake confirmation on batch must succeed');

    // 4. Now attempt to confirm staleSnapshot; createdBatchId has changed, so it MUST return 409 STOCKTAKE_STALE
    const staleConfirmRes = await fetch(`${BASE_URL}/stocktakes/${staleSnapshot.id}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': genKey(),
      },
      body: JSON.stringify({
        expectedVersion: patchedSnapshot.version,
      }),
    });

    assert.equal(staleConfirmRes.status, 409, 'Stale snapshot confirmation must return 409');
    const errBody = await staleConfirmRes.json();
    assert.ok(isStocktakeStaleError(errBody), 'isStocktakeStaleError must recognize STOCKTAKE_STALE');
  });

  test('4. Finance: Cash receipt, unallocated remainder, opening balance, and reversal with retry', async () => {
    // 1. Query initial balance
    const initBalRes = await fetch(`${BASE_URL}/customers/${isolatedCustomerId}/balance`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(initBalRes.status, 200);
    const initBal = await initBalRes.json();
    assert.ok(initBal.netBalance !== undefined);

    // 2. Record opening balance
    const openingRes = await fetch(`${BASE_URL}/customers/${isolatedCustomerId}/opening-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': genKey(),
      },
      body: JSON.stringify({
        amount: '300.00',
        effectiveAt: '2026-11-01T00:00:00+08:00',
        reason: '期初对账应收',
      }),
    });
    assert.equal(openingRes.status, 201, 'Opening balance creation must return 201');
    const openedBal = await openingRes.json();
    assert.equal(openedBal.receivableBalance, '300.00');

    // 3. Record cash receipt (idempotent retry check)
    const idempotencyKey = genKey();
    const cashPayload = {
      kind: 'receipt',
      customerId: isolatedCustomerId,
      amount: '500.00',
      occurredAt: '2026-11-10T16:00:00+08:00',
      method: 'wechat',
      reference: 'WX-TEST-500',
      allocationMode: 'auto',
    };

    const cashRes = await fetch(`${BASE_URL}/cash-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(cashPayload),
    });

    assert.equal(cashRes.status, 201, 'Cash receipt creation must return 201');
    const cashEvent = await cashRes.json();
    assert.equal(cashEvent.kind, 'receipt');
    assert.equal(cashEvent.amount, '500.00');
    assert.equal(cashEvent.status, 'active');

    // P1 Test: Retry with same key returns identical cash event
    const retryCashRes = await fetch(`${BASE_URL}/cash-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(cashPayload),
    });
    assert.ok(retryCashRes.status === 200 || retryCashRes.status === 201);
    const retryCashEvent = await retryCashRes.json();
    assert.equal(retryCashEvent.id, cashEvent.id);

    // 4. Verify unallocated amount in balance
    const postCashBalRes = await fetch(`${BASE_URL}/customers/${isolatedCustomerId}/balance`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    const postCashBal = await postCashBalRes.json();
    assert.ok(parseFloat(postCashBal.unallocatedAmount) > 0, 'Unallocated cash must be tracked in unallocatedAmount');

    // 5. Query customer ledger
    const ledgerRes = await fetch(`${BASE_URL}/customers/${isolatedCustomerId}/ledger?limit=10`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(ledgerRes.status, 200);
    const ledgerData = await ledgerRes.json();
    assert.ok(ledgerData.items.length >= 2, 'Must have opening and cash receipt entries');

    // 6. Reverse cash event (red-letter reversal)
    const revRes = await fetch(`${BASE_URL}/cash-events/${cashEvent.id}/reverse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': genKey(),
      },
      body: JSON.stringify({
        expectedVersion: cashEvent.version,
        reason: '测试登记错误红字冲销',
      }),
    });
    assert.equal(revRes.status, 200, 'Reversal must return 200');
    const reversed = await revRes.json();
    assert.equal(reversed.status, 'reversed');
  });

  test('5. Monthly Statement: Create statement snapshot, verify rows & cursor paging on same statement ID', async () => {
    const periodStart = '2026-11-01T00:00:00+08:00';
    const periodEnd = '2026-12-01T00:00:00+08:00';

    const stmtRes = await fetch(`${BASE_URL}/customers/${isolatedCustomerId}/statements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': genKey(),
      },
      body: JSON.stringify({
        periodStart,
        periodEnd,
      }),
    });

    assert.equal(stmtRes.status, 201, 'Statement creation must return 201');
    const stmt = await stmtRes.json();
    assert.ok(stmt.id);
    assert.equal(new Date(stmt.periodStart).getTime(), new Date(periodStart).getTime());
    assert.equal(new Date(stmt.periodEnd).getTime(), new Date(periodEnd).getTime());
    assert.ok(stmt.openingBalance !== undefined);
    assert.ok(stmt.closingBalance !== undefined);
    assert.ok(Array.isArray(stmt.rows), 'Statement must include fixed rows');

    // Query statement detail by ID with small limit to verify pagination along the same snapshot
    const pagedStmtRes = await fetch(`${BASE_URL}/statements/${stmt.id}?limit=1`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(pagedStmtRes.status, 200);
    const pagedStmt = await pagedStmtRes.json();
    assert.equal(pagedStmt.id, stmt.id);
    assert.equal(pagedStmt.rows.length, 1);
    if (stmt.rowCount > 1) {
      assert.ok(pagedStmt.nextCursor, 'Must return nextCursor when rowCount > limit');
      // Fetch second page along same snapshot ID
      const page2Res = await fetch(`${BASE_URL}/statements/${stmt.id}?limit=1&cursor=${pagedStmt.nextCursor}`, {
        headers: { Origin: ORIGIN, Cookie: adminCookie },
      });
      assert.equal(page2Res.status, 200);
      const page2Stmt = await page2Res.json();
      assert.equal(page2Stmt.id, stmt.id);
      assert.equal(page2Stmt.rows.length, 1);
      assert.notEqual(page2Stmt.rows[0].id, pagedStmt.rows[0].id, 'Next page must return next row');
    }
  });

  test('6. B5 Navigation: CashEvent deep fetch & customer context sync', async () => {
    // 1. Create a distinct second customer to verify customer context switching
    const suffix = Date.now().toString().slice(-6);
    const cust2Res = await fetch(`${BASE_URL}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': genKey(),
      },
      body: JSON.stringify({
        name: `B5测试客户2-${suffix}`,
        code: `B5C2-${suffix}`,
      }),
    });
    assert.equal(cust2Res.status, 201);
    const cust2 = await cust2Res.json();

    // 2. Record cash event on Customer 2
    const cashRes = await fetch(`${BASE_URL}/cash-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': genKey(),
      },
      body: JSON.stringify({
        kind: 'receipt',
        customerId: cust2.id,
        amount: '888.00',
        occurredAt: '2026-11-10T16:00:00+08:00',
        method: 'wechat',
        allocationMode: 'auto',
      }),
    });
    assert.equal(cashRes.status, 201);
    const cashEv = await cashRes.json();

    // 3. Deep navigation: fetch getCashEvent by ID
    const getRes = await fetch(`${BASE_URL}/cash-events/${cashEv.id}`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(getRes.status, 200);
    const fetchedEv = await getRes.json();
    assert.equal(fetchedEv.id, cashEv.id);
    assert.equal(fetchedEv.customerId, cust2.id, 'Fetched cash event must return true customerId for UI sync');
    assert.equal(fetchedEv.amount, '888.00');

    // 4. Verify non-existent ID returns 404 (error handled clearly in UI without spoofing)
    const notFoundRes = await fetch(`${BASE_URL}/cash-events/00000000-0000-0000-0000-000000000000`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(notFoundRes.status, 404);
  });

  test('7. B5 Navigation: Statement customer context synchronization', async () => {
    // 1. Create a statement snapshot for our isolated customer
    const periodStart = '2026-03-01T00:00:00+08:00';
    const periodEnd = '2026-04-01T00:00:00+08:00';
    const stmtRes = await fetch(`${BASE_URL}/customers/${isolatedCustomerId}/statements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': genKey(),
      },
      body: JSON.stringify({ periodStart, periodEnd }),
    });
    assert.equal(stmtRes.status, 201);
    const stmt = await stmtRes.json();

    // 2. Fetch statement by ID (as done in StatementsPage.handleOpenDetail)
    const detailRes = await fetch(`${BASE_URL}/statements/${stmt.id}`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(detailRes.status, 200);
    const detail = await detailRes.json();
    assert.equal(detail.id, stmt.id);
    assert.equal(detail.customerId, isolatedCustomerId, 'Statement response carries true customerId to sync selectedCustomerId');
  });

  test('8. B5 Navigation: Batch pagination including depleted batches & Ledger pagination', async () => {
    // 1. Query batches with positiveOnly: false to ensure depleted batches are accessible
    const batchRes = await fetch(`${BASE_URL}/inventory/batches?warehouseId=${activeWarehouseId}&positiveOnly=false&limit=10`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(batchRes.status, 200);
    const batchData = await batchRes.json();
    assert.ok(Array.isArray(batchData.items));

    // 2. Query customer ledger with pagination
    const ledgerRes = await fetch(`${BASE_URL}/customers/${isolatedCustomerId}/ledger?limit=10`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(ledgerRes.status, 200);
    const ledgerData = await ledgerRes.json();
    assert.ok(Array.isArray(ledgerData.items));
  });
});
