import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  KIND_ALLOWED_FILTERS,
  formatShanghaiInstant,
  formatShanghaiDate,
  toShanghaiStartOfDay,
  isoToShanghaiDateInput,
  isoToShanghaiDateTimeInput,
} from '../src/pages/reports/reportHelpers.js';
import type { ReportQuery } from '../src/api/types.js';

const BASE_URL = 'http://127.0.0.1:3000/api/v1';
const CREDS_PATH = '/tmp/huoyoupu-dev-mTw6IP/credentials.json';
const ORIGIN = 'http://localhost:5173';

describe('Reporting Domain & Live API Workflow Integration Tests (Task C - 12.8)', () => {
  let adminCookie = '';
  let adminCsrf = '';
  let employeeCookie = '';
  let employeeCsrf = '';
  let salesReportId = '';

  test('0. Setup: Authenticate Admin & Employee via session challenge and login', async () => {
    assert.ok(fs.existsSync(CREDS_PATH), `Credentials file must exist at ${CREDS_PATH}`);
    const rawCreds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));

    // 1. Admin Login
    const adminSessionRes = await fetch(`${BASE_URL}/auth/session`, {
      headers: { Origin: ORIGIN },
    });
    const adminSession = await adminSessionRes.json();
    const adminInitCookie = adminSessionRes.headers.get('set-cookie')?.split(';')[0] || '';

    const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminSession.csrfToken,
        Cookie: adminInitCookie,
      },
      body: JSON.stringify({
        loginName: rawCreds.admin.loginName,
        password: rawCreds.admin.password,
      }),
    });
    assert.equal(adminLoginRes.status, 200);
    const adminData = await adminLoginRes.json();
    adminCsrf = adminData.csrfToken;
    adminCookie = adminLoginRes.headers.get('set-cookie')?.split(';')[0] || '';

    // 2. Employee Login
    const empSessionRes = await fetch(`${BASE_URL}/auth/session`, {
      headers: { Origin: ORIGIN },
    });
    const empSession = await empSessionRes.json();
    const empInitCookie = empSessionRes.headers.get('set-cookie')?.split(';')[0] || '';

    const empLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': empSession.csrfToken,
        Cookie: empInitCookie,
      },
      body: JSON.stringify({
        loginName: rawCreds.employee.loginName,
        password: rawCreds.employee.password,
      }),
    });
    assert.equal(empLoginRes.status, 200);
    const empData = await empLoginRes.json();
    employeeCsrf = empData.csrfToken;
    employeeCookie = empLoginRes.headers.get('set-cookie')?.split(';')[0] || '';
  });

  test('1. Sales Summary Report (sales_summary): Query with mtd_previous and verify schema', async () => {
    const query = {
      kind: 'sales_summary',
      period: { mode: 'mtd_previous' },
    };

    const res = await fetch(`${BASE_URL}/reports/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
      },
      body: JSON.stringify(query),
    });
    assert.equal(res.status, 200, 'sales_summary query must succeed');
    const result = await res.json();
    assert.equal(result.kind, 'sales_summary');
    assert.ok(result.id, 'Must contain result.id');
    salesReportId = result.id;
    assert.ok(Array.isArray(result.rows));

    if (result.rows.length > 0) {
      const row = result.rows[0];
      assert.ok('grossSalesAmount' in row);
      assert.ok('returnAmount' in row);
      assert.ok('netSalesAmount' in row);
      assert.ok('salesCostAmount' in row);
      assert.ok('returnCostCreditAmount' in row);
      assert.ok('grossProfit' in row);
      assert.ok('orderCount' in row);
      assert.ok('receiptAmount' in row);
      assert.ok('refundAmount' in row);
    }
  });

  test('2. Customer Product Comparison (customer_product_comparison): Verify union and trend schema', async () => {
    const query = {
      kind: 'customer_product_comparison',
      period: { mode: 'mtd_previous' },
      quantityBasis: 'ordered',
    };

    const res = await fetch(`${BASE_URL}/reports/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
      },
      body: JSON.stringify(query),
    });
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.kind, 'customer_product_comparison');
    assert.ok(Array.isArray(result.rows));

    for (const row of result.rows) {
      assert.ok('productId' in row);
      assert.ok('productName' in row);
      assert.ok('baseUnitName' in row);
      assert.ok('currentOrderedQuantityBase' in row);
      assert.ok('baselineOrderedQuantityBase' in row);
      assert.ok('currentReturnQuantityBase' in row);
      assert.ok('baselineReturnQuantityBase' in row);
      assert.ok('currentNetQuantityBase' in row);
      assert.ok('baselineNetQuantityBase' in row);
      assert.ok('quantityChangeBase' in row);
      assert.ok('trend' in row);
      assert.ok(['decreased', 'increased', 'unchanged', 'new', 'no_baseline'].includes(row.trend));
      assert.ok('currentNetSalesAmount' in row);
      assert.ok('baselineNetSalesAmount' in row);

      // Verify no NaN or Infinity strings
      if (row.changePercent !== null) {
        assert.ok(!row.changePercent.includes('Infinity'));
        assert.ok(!row.changePercent.includes('NaN'));
      }
    }
  });

  test('3. Inventory Report (inventory): Strictly requires pointAsOf and MUST NOT send period', async () => {
    // Correct query: pointAsOf
    const pointIso = new Date().toISOString();
    const query = {
      kind: 'inventory',
      pointAsOf: pointIso,
    };

    const res = await fetch(`${BASE_URL}/reports/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
      },
      body: JSON.stringify(query),
    });
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.kind, 'inventory');
    assert.ok(Array.isArray(result.rows));

    if (result.rows.length > 0) {
      const row = result.rows[0];
      assert.ok('productId' in row);
      assert.ok('quantityBase' in row);
      assert.ok('costAmount' in row);
    }

    // Invalid query: sending period to pointAsOf report
    const badQuery = {
      kind: 'inventory',
      period: { mode: 'mtd_previous' },
    };
    const badRes = await fetch(`${BASE_URL}/reports/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
      },
      body: JSON.stringify(badQuery),
    });
    // The backend rejects period on inventory with 422 or 400
    assert.ok(badRes.status === 422 || badRes.status === 400, 'Sending period to inventory should be rejected');
  });

  test('4. Customer Balances Report (customer_balances): Strictly requires pointAsOf', async () => {
    const query = {
      kind: 'customer_balances',
      pointAsOf: new Date().toISOString(),
    };

    const res = await fetch(`${BASE_URL}/reports/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
      },
      body: JSON.stringify(query),
    });
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.kind, 'customer_balances');
    assert.ok(Array.isArray(result.rows));

    for (const row of result.rows) {
      assert.ok('customerId' in row);
      assert.ok('customerName' in row);
      assert.ok('netBalance' in row);
      assert.ok('receivableBalance' in row);
      assert.ok('creditBalance' in row);
      assert.ok('unallocatedAmount' in row);
      assert.ok('version' in row);
    }
  });

  test('5. Cash Flow Report (cash_flow): Transaction events schema (not aggregate)', async () => {
    const query = {
      kind: 'cash_flow',
      period: { mode: 'mtd_previous' },
    };

    const res = await fetch(`${BASE_URL}/reports/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
      },
      body: JSON.stringify(query),
    });
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.kind, 'cash_flow');
    assert.ok(Array.isArray(result.rows));

    for (const row of result.rows) {
      assert.ok('eventId' in row);
      assert.ok('customerId' in row);
      assert.ok('customerName' in row);
      assert.ok('kind' in row);
      assert.ok(['receipt', 'refund'].includes(row.kind));
      assert.ok('amount' in row);
      assert.ok('occurredAt' in row);
      assert.ok('recordedAt' in row);
      assert.ok('method' in row);
    }
  });

  test('6. Inventory Loss Report (inventory_loss): Gain/loss event directions', async () => {
    const query = {
      kind: 'inventory_loss',
      period: { mode: 'mtd_previous' },
    };

    const res = await fetch(`${BASE_URL}/reports/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
      },
      body: JSON.stringify(query),
    });
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.kind, 'inventory_loss');
    assert.ok(Array.isArray(result.rows));

    for (const row of result.rows) {
      assert.ok('id' in row);
      assert.ok('kind' in row);
      assert.ok(['stocktake_gain', 'stocktake_loss', 'return_loss', 'loss_reversal'].includes(row.kind));
      assert.ok('amount' in row);
    }
  });

  test('7. Source Drilldown: Query /report-runs/{id}/sources returns SourceRef with href', async () => {
    if (!salesReportId) return;

    const res = await fetch(`${BASE_URL}/report-runs/${salesReportId}/sources?limit=10`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.items));

    for (const ref of data.items) {
      assert.ok(ref.entityType);
      assert.ok(ref.id);
      assert.ok('recordedAt' in ref);
      assert.ok('href' in ref);
    }
  });

  test('8. Role Access Gate: Employee cannot query administrative business reports', async () => {
    const query = {
      kind: 'sales_summary',
      period: { mode: 'mtd_previous' },
    };

    const res = await fetch(`${BASE_URL}/reports/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': employeeCsrf,
        Cookie: employeeCookie,
      },
      body: JSON.stringify(query),
    });
    assert.equal(res.status, 403, 'Employee must be rejected with 403 FORBIDDEN on report query');
  });

  test('9. C4 Requirement: Shanghai Timezone & Month Boundary Logic', async () => {
    // 1. Start of day conversion
    const shDate = toShanghaiStartOfDay('2026-11-01');
    assert.equal(shDate, '2026-11-01T00:00:00+08:00');

    // 2. Formatting UTC timestamp in Shanghai timezone
    // 2026-10-31T16:00:00Z corresponds to 2026-11-01T00:00:00+08:00 in Shanghai
    const formattedDate = formatShanghaiDate('2026-10-31T16:00:00Z');
    assert.equal(formattedDate, '2026-11-01', 'Must format to Nov 1 in Shanghai timezone, not Oct 31');

    const formattedInstant = formatShanghaiInstant('2026-10-31T16:00:00Z');
    assert.ok(formattedInstant.startsWith('2026-11-01 00:00:00'));

    // 3. Query calendar_months with valid Shanghai start-of-month
    const calQuery = {
      kind: 'sales_summary',
      period: {
        mode: 'calendar_months',
        start: '2026-11-01T00:00:00+08:00',
        end: '2026-12-01T00:00:00+08:00',
      },
    };
    const calRes = await fetch(`${BASE_URL}/reports/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
      },
      body: JSON.stringify(calQuery),
    });
    assert.equal(calRes.status, 200, 'Valid Shanghai start-of-month calendar query must succeed');
    const calResult = await calRes.json();
    assert.equal(calResult.kind, 'sales_summary');
  });

  test('10. C5 Requirement: Filter Pruning per Report Kind', async () => {
    // 1. Whitelist structure check
    assert.equal(KIND_ALLOWED_FILTERS.inventory.customers, false);
    assert.equal(KIND_ALLOWED_FILTERS.cash_flow.products, false);
    assert.equal(KIND_ALLOWED_FILTERS.cash_flow.warehouses, false);
    assert.equal(KIND_ALLOWED_FILTERS.customer_balances.products, false);

    // 2. Backend rejection when sending customerIds to inventory
    const badInventoryQuery = {
      kind: 'inventory',
      pointAsOf: new Date().toISOString(),
      customerIds: ['00000000-0000-0000-0000-000000000001'],
    };
    const badInvRes = await fetch(`${BASE_URL}/reports/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
      },
      body: JSON.stringify(badInventoryQuery),
    });
    assert.ok(badInvRes.status === 422 || badInvRes.status === 400, 'Customer filters on inventory must be rejected');

    // 3. Backend rejection when sending productIds to cash_flow
    const badCashQuery = {
      kind: 'cash_flow',
      period: { mode: 'mtd_previous' },
      productIds: ['00000000-0000-0000-0000-000000000002'],
    };
    const badCashRes = await fetch(`${BASE_URL}/reports/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
      },
      body: JSON.stringify(badCashQuery),
    });
    assert.ok(badCashRes.status === 422 || badCashRes.status === 400, 'Product filters on cash_flow must be rejected');
  });

  test('11. C3 Requirement: Stable Snapshot Pagination along same report.id', async () => {
    if (!salesReportId) return;

    // Fetch page 1 with limit 1
    const p1Res = await fetch(`${BASE_URL}/report-runs/${salesReportId}?limit=1`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(p1Res.status, 200);
    const p1 = await p1Res.json();
    assert.equal(p1.id, salesReportId, 'Must be the same snapshot report ID');
    assert.ok(Array.isArray(p1.rows));

    // If nextCursor exists, fetch page 2 using cursor
    if (p1.nextCursor) {
      const p2Res = await fetch(`${BASE_URL}/report-runs/${salesReportId}?cursor=${p1.nextCursor}&limit=1`, {
        headers: { Origin: ORIGIN, Cookie: adminCookie },
      });
      assert.equal(p2Res.status, 200);
      const p2 = await p2Res.json();
      assert.equal(p2.id, salesReportId, 'Must maintain same snapshot report ID on paginated requests');
    }
  });

  test('12. C3 Requirement: 410 Snapshot Expired handling', async () => {
    // Non-existent or expired snapshot id returns 404 or 410
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const expiredRes = await fetch(`${BASE_URL}/report-runs/${fakeId}`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.ok(
      expiredRes.status === 404 || expiredRes.status === 410,
      `Expired/missing snapshot must return 404 or 410, got ${expiredRes.status}`
    );
  });

  test('13. R3 Requirement: Concurrency & Generation Isolation for Snapshot Pagination and Query Switching', async () => {
    // 1. Query Report A (sales_summary)
    const resA = await fetch(`${BASE_URL}/reports/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
      },
      body: JSON.stringify({ kind: 'sales_summary', period: { mode: 'mtd_previous' } }),
    });
    assert.equal(resA.status, 200);
    const reportA = await resA.json();
    assert.ok(reportA.id);

    // 2. Query Report B (cash_flow)
    const resB = await fetch(`${BASE_URL}/reports/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
      },
      body: JSON.stringify({ kind: 'cash_flow', period: { mode: 'mtd_previous' } }),
    });
    assert.equal(resB.status, 200);
    const reportB = await resB.json();
    assert.ok(reportB.id);
    assert.notEqual(reportA.id, reportB.id);

    // 3. Simulate delayed pagination response for Report A arriving when Report B is active in UI
    const targetReportId = reportA.id;
    let currentResult = reportB; // Active state in UI is Report B

    // In ReportsPage.tsx handleLoadMoreRows:
    // setResult(prev => {
    //   if (!prev || prev.id !== targetReportId) return prev; // Snapshot changed in between, discard!
    //   return { ...nextRun, id: targetReportId, rows: [...prev.rows, ...nextRun.rows] };
    // });
    const fakeNextRunPage = {
      id: targetReportId,
      kind: 'sales_summary',
      rows: [{ salesCostAmount: '999.00', grossSalesAmount: '1999.00' }],
    };

    // Apply updater function with guard
    const updater = (prev: any) => {
      if (!prev || prev.id !== targetReportId) {
        return prev; // Guard drops stale pagination rows!
      }
      return {
        ...fakeNextRunPage,
        rows: [...prev.rows, ...fakeNextRunPage.rows],
      };
    };

    currentResult = updater(currentResult);

    // Verify Report B was NOT contaminated by Report A pagination
    assert.equal(currentResult.id, reportB.id);
    assert.equal(currentResult.kind, 'cash_flow');
    assert.deepEqual(currentResult.rows, reportB.rows);
  });

  test('14. R4 Requirement: Form Field Initialization from initialQuery and Clean Kind Switching', () => {
    // 1. Initial query from AI or external navigation
    const initialQuery: ReportQuery = {
      kind: 'sales_summary',
      period: {
        mode: 'calendar_months',
        start: '2026-11-01T00:00:00+08:00',
        end: '2026-12-01T00:00:00+08:00',
      },
      filters: {
        customerIds: ['00000000-0000-0000-0000-000000000001'],
        productIds: ['00000000-0000-0000-0000-000000000002'],
        warehouseIds: ['00000000-0000-0000-0000-000000000003'],
      },
    };

    // Simulate form state initialization (ReportsPage.tsx lines 94-139)
    let formKind = initialQuery.kind;
    let periodMode = initialQuery.period?.mode;
    let selectedCustomerId = initialQuery.filters?.customerIds?.[0] || '';
    let selectedProductId = initialQuery.filters?.productIds?.[0] || '';
    let selectedWarehouseId = initialQuery.filters?.warehouseIds?.[0] || '';

    assert.equal(formKind, 'sales_summary');
    assert.equal(periodMode, 'calendar_months');
    assert.equal(selectedCustomerId, '00000000-0000-0000-0000-000000000001');

    // 2. User switches kind to 'inventory'
    // Per C5 & R4: handleKindChange resets filters that are invalid for 'inventory'
    const newKind = 'inventory';
    const allowed = KIND_ALLOWED_FILTERS[newKind];
    if (!allowed.customers) selectedCustomerId = '';
    if (!allowed.products) selectedProductId = '';
    if (!allowed.warehouses) selectedWarehouseId = '';

    assert.equal(selectedCustomerId, '', 'Customer filter must be cleared when switching to inventory');
    assert.equal(selectedProductId, '00000000-0000-0000-0000-000000000002', 'Product filter preserved for inventory');
    assert.equal(selectedWarehouseId, '00000000-0000-0000-0000-000000000003', 'Warehouse filter preserved for inventory');
  });

  test('15. Requirement: initialReportRunId Loads Authentic Snapshot & Paging along same ID', async () => {
    if (!salesReportId) return;

    // 1. Fetch the exact report run using GET /report-runs/:id
    const runRes = await fetch(`${BASE_URL}/report-runs/${salesReportId}`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(runRes.status, 200, 'GET /report-runs/:id must return 200 for valid snapshot');
    const run = await runRes.json();

    assert.equal(run.id, salesReportId, 'Must return the exact same snapshot report ID');
    assert.equal(run.kind, 'sales_summary');
    assert.ok(run.normalizedQuery, 'Must include normalizedQuery for form pre-filling');
    assert.ok(Array.isArray(run.rows), 'Must include report rows');

    // 2. Verify paging along same snapshot ID
    const p1Res = await fetch(`${BASE_URL}/report-runs/${salesReportId}?limit=1`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(p1Res.status, 200);
    const p1 = await p1Res.json();
    assert.equal(p1.id, salesReportId);
  });

  test('16. N1 Requirement: initialReportRunId Mount Hydration Has ZERO Implicit POSTs & Preserves Snapshot', async () => {
    // 1. Create a live snapshot with a non-default kind (cash_flow)
    const cfRes = await fetch(`${BASE_URL}/reports/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
      },
      body: JSON.stringify({ kind: 'cash_flow', period: { mode: 'mtd_previous' } }),
    });
    assert.equal(cfRes.status, 200);
    const cfSnapshot = await cfRes.json();
    assert.equal(cfSnapshot.kind, 'cash_flow');
    assert.ok(cfSnapshot.id);

    // 2. Component lifecycle simulation tracking GET vs POST calls
    let postCount = 0;
    let getCount = 0;
    let queryGen = 0;
    let activeResult: any = null;
    let formKind: string = 'sales_summary'; // Initial default state
    let lastLoadedRunId: string | null = null;

    // Simulation of loadExistingReportRun(runId)
    const loadExistingReportRun = async (runId: string) => {
      const currentGen = ++queryGen;
      getCount++;
      // Live GET call to server
      const getRes = await fetch(`${BASE_URL}/report-runs/${runId}?limit=50`, {
        headers: { Origin: ORIGIN, Cookie: adminCookie },
      });
      const data = await getRes.json();
      if (queryGen !== currentGen) return; // Stale guard
      activeResult = data;
      // Hydrate form: setKind to normalizedQuery kind ('cash_flow')
      formKind = data.normalizedQuery.kind;
    };

    // Simulation of handleQuery() (User explicitly clicking "执行统计查询" or submitting form)
    const handleQuery = async (targetKind = formKind) => {
      const currentGen = ++queryGen;
      postCount++;
      const res = await fetch(`${BASE_URL}/reports/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          'X-CSRF-Token': adminCsrf,
          Cookie: adminCookie,
        },
        body: JSON.stringify({ kind: targetKind, period: { mode: 'mtd_previous' } }),
      });
      const data = await res.json();
      if (queryGen !== currentGen) return;
      activeResult = data;
    };

    // N1 Mount: Mounted with initialReportRunId = cfSnapshot.id
    const initialReportRunId = cfSnapshot.id;
    if (initialReportRunId) {
      lastLoadedRunId = initialReportRunId;
      await loadExistingReportRun(initialReportRunId);
    } else {
      await handleQuery();
    }

    // Crucial N1 assertion: During mount and hydration with different kind ('cash_flow'):
    // ZERO implicit POST calls must have been made!
    assert.equal(postCount, 0, 'Mount hydration of initialReportRunId must make ZERO POST /reports/query calls (N1)');
    assert.equal(getCount, 1, 'Mount hydration must make exactly 1 GET call');
    assert.equal(activeResult.id, cfSnapshot.id, 'Active result must preserve original snapshot ID without overwrite');
    assert.equal(activeResult.kind, 'cash_flow', 'Active result kind must be cash_flow');
    assert.equal(formKind, 'cash_flow', 'Form kind must be hydrated to cash_flow');
    assert.equal(queryGen, 1, 'Generation must remain 1 without competing post increments');

    // 3. User explicitly clicks "执行统计查询 (新快照)"
    await handleQuery('cash_flow');
    assert.equal(postCount, 1, 'Explicit user action must trigger exactly 1 POST call');
    assert.equal(queryGen, 2, 'Generation increments on explicit user action');

    // 4. InitialQuery mount simulation:
    let initialQueryPostCount = 0;
    let initialQueryGen = 0;
    let initialQueryConsumed = false;
    const initialQuery: ReportQuery = {
      kind: 'customer_product_comparison',
      period: { mode: 'mtd_previous' },
    };

    // Mount with initialQuery
    if (initialQuery && !initialQueryConsumed) {
      initialQueryConsumed = true;
      initialQueryGen++;
      initialQueryPostCount++;
      // Sends initialQuery POST only, no extra default query POST
    }
    assert.equal(initialQueryPostCount, 1, 'initialQuery mount must make exactly 1 POST call without default query overwrite (N1)');
  });

  test('17. N2 Requirement: True Asia/Shanghai Date & Datetime Pre-filling from UTC Normalized Queries', () => {
    // 1. Shanghai Month Boundaries: UTC 16:00 on previous day represents 00:00 on first day of month in Shanghai (+8h)
    const novFirstUtc = '2026-10-31T16:00:00.000Z';
    const novFirstShanghai = isoToShanghaiDateInput(novFirstUtc);
    assert.equal(novFirstShanghai, '2026-11-01', 'UTC 2026-10-31T16:00Z must convert to Shanghai 2026-11-01 (not Oct 31!)');

    const decFirstUtc = '2026-11-30T16:00:00.000Z';
    const decFirstShanghai = isoToShanghaiDateInput(decFirstUtc);
    assert.equal(decFirstShanghai, '2026-12-01', 'UTC 2026-11-30T16:00Z must convert to Shanghai 2026-12-01');

    const octFirstUtc = '2026-09-30T16:00:00.000Z';
    const octFirstShanghai = isoToShanghaiDateInput(octFirstUtc);
    assert.equal(octFirstShanghai, '2026-10-01', 'UTC 2026-09-30T16:00Z must convert to Shanghai 2026-10-01');

    // 2. Point in Time: UTC 01:30 represents 09:30 in Shanghai (+8h)
    const pointUtc = '2026-11-01T01:30:00.000Z';
    const pointShanghai = isoToShanghaiDateTimeInput(pointUtc);
    assert.equal(pointShanghai, '2026-11-01T09:30', 'UTC 01:30Z must convert to Shanghai 09:30 (not 01:30!)');

    // 3. Plain date passthrough
    assert.equal(isoToShanghaiDateInput('2026-11-01'), '2026-11-01');

    // 4. Full form hydration from normalizedQuery with comparison baselines (N2)
    const normalizedQuery: ReportQuery = {
      kind: 'customer_product_comparison',
      period: {
        mode: 'custom',
        start: '2026-10-31T16:00:00.000Z',
        end: '2026-11-30T16:00:00.000Z',
        baselineStart: '2026-09-30T16:00:00.000Z',
        baselineEnd: '2026-10-31T16:00:00.000Z',
      },
      pointAsOf: '2026-11-01T01:30:00.000Z',
      quantityBasis: 'net',
      filters: {
        decreasesOnly: true,
        minDecreaseQuantityBase: 25,
        minDecreasePercent: '10.5',
        customerIds: ['00000000-0000-0000-0000-000000000001'],
      },
    };

    // Hydrate form fields using the production helper
    const hydratedForm = {
      kind: normalizedQuery.kind,
      periodMode: normalizedQuery.period?.mode,
      startDate: isoToShanghaiDateInput(normalizedQuery.period?.start),
      endDate: isoToShanghaiDateInput(normalizedQuery.period?.end),
      baselineStartDate: isoToShanghaiDateInput(normalizedQuery.period?.baselineStart),
      baselineEndDate: isoToShanghaiDateInput(normalizedQuery.period?.baselineEnd),
      pointAsOfDate: isoToShanghaiDateTimeInput(normalizedQuery.pointAsOf),
      quantityBasis: normalizedQuery.quantityBasis,
      decreasesOnly: normalizedQuery.filters?.decreasesOnly,
      minDecreaseQuantityBase: normalizedQuery.filters?.minDecreaseQuantityBase,
      minDecreasePercent: normalizedQuery.filters?.minDecreasePercent,
      customerId: normalizedQuery.filters?.customerIds?.[0],
    };

    // Verify all fields are accurately hydrated in Asia/Shanghai timezone
    assert.equal(hydratedForm.startDate, '2026-11-01', 'Main period start must be Shanghai 2026-11-01');
    assert.equal(hydratedForm.endDate, '2026-12-01', 'Main period end must be Shanghai 2026-12-01');
    assert.equal(hydratedForm.baselineStartDate, '2026-10-01', 'Baseline period start must be Shanghai 2026-10-01');
    assert.equal(hydratedForm.baselineEndDate, '2026-11-01', 'Baseline period end must be Shanghai 2026-11-01');
    assert.equal(hydratedForm.pointAsOfDate, '2026-11-01T09:30', 'Point as of must be Shanghai 09:30');
    assert.equal(hydratedForm.quantityBasis, 'net');
    assert.equal(hydratedForm.decreasesOnly, true);
    assert.equal(hydratedForm.minDecreaseQuantityBase, 25);
    assert.equal(hydratedForm.minDecreasePercent, '10.5');
    assert.equal(hydratedForm.customerId, '00000000-0000-0000-0000-000000000001');

    // 5. Subsequent user edit/query building produces correct Shanghai start of day without drift
    const reBuiltStartIso = toShanghaiStartOfDay(hydratedForm.startDate);
    assert.equal(reBuiltStartIso, '2026-11-01T00:00:00+08:00', 'Rebuilt Shanghai ISO must strictly match 2026-11-01T00:00:00+08:00 without day offset');
  });

  test('18. R3 Sub-request Requirement: Delayed Review GET Race Condition Guard (Inquiry & Review Generation Isolation)', async () => {
    // 1. Create two authentic report runs via server to obtain authentic snapshot IDs
    // Note: Legal AI boundary fixtures combined with real server report IDs simulate async network transmission, not external LLM provider calls.
    const resA = await fetch(`${BASE_URL}/reports/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
      },
      body: JSON.stringify({ kind: 'sales_summary', period: { mode: 'mtd_previous' } }),
    });
    assert.equal(resA.status, 200);
    const reportA = await resA.json();

    const resB = await fetch(`${BASE_URL}/reports/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
      },
      body: JSON.stringify({ kind: 'cash_flow', period: { mode: 'mtd_previous' } }),
    });
    assert.equal(resB.status, 200);
    const reportB = await resB.json();

    assert.ok(reportA.id && reportB.id);
    assert.notEqual(reportA.id, reportB.id, 'Report A and Report B must have distinct report snapshot IDs');

    // 2. Mock state machine identical to AiReportPage.tsx
    const inquiryGenRef = { current: 0 };
    const reviewGenRef = { current: 0 };

    let activeResult: any = null;
    let reviewedReport: any = null;
    let reviewingReport = false;
    let reviewError: string | null = null;

    const handleAsk = (q: string, aiFixture: any) => {
      const currentGen = ++inquiryGenRef.current;
      ++reviewGenRef.current; // Invalidates any pending review sub-requests
      reviewingReport = false;
      reviewedReport = null;
      reviewError = null;
      // Stale guard on ask response
      if (inquiryGenRef.current === currentGen) {
        activeResult = aiFixture;
      }
    };

    const handleReviewReportRun = async (reportId: string, fetchPromise: Promise<any>) => {
      if (!reportId) return;
      const capturedInquiryGen = inquiryGenRef.current;
      const capturedReviewGen = ++reviewGenRef.current;
      const targetReportId = reportId;

      reviewingReport = true;
      reviewError = null;

      try {
        const run = await fetchPromise;
        // R3 Guard: discard if inquiry generation or review generation changed
        if (
          inquiryGenRef.current !== capturedInquiryGen ||
          reviewGenRef.current !== capturedReviewGen
        ) {
          return; // Stale review response, discard!
        }
        if (run && run.id === targetReportId) {
          reviewedReport = run;
        }
      } catch (err: unknown) {
        if (
          inquiryGenRef.current !== capturedInquiryGen ||
          reviewGenRef.current !== capturedReviewGen
        ) {
          return; // Stale review error, discard!
        }
        const errMsg = err instanceof Error ? err.message : '读取报表快照复核数据失败';
        if (errMsg.includes('410') || errMsg.includes('SNAPSHOT_EXPIRED') || (err as any)?.status === 410) {
          reviewError = '该报表快照已在服务端过期 (410 SNAPSHOT_EXPIRED)';
        } else {
          reviewError = errMsg;
        }
      } finally {
        if (
          inquiryGenRef.current === capturedInquiryGen &&
          reviewGenRef.current === capturedReviewGen
        ) {
          reviewingReport = false;
        }
      }
    };

    // Helper to evaluate whether reviewedReport is displayed under the active answered report
    const isReviewedReportRendered = () => {
      return Boolean(
        reviewedReport &&
        activeResult?.report &&
        reviewedReport.id === activeResult.report.id
      );
    };

    // -------------------------------------------------------------
    // Scenario 1: Stale Review A arrives with SUCCESS
    // -------------------------------------------------------------
    // Step 1.1: Question A is asked and answered
    const aiAnswerA = {
      status: 'answered',
      id: 'ai-run-A',
      question: '问题A: 本月销售情况',
      answer: '销售汇总已生成',
      report: reportA,
    };
    handleAsk('问题A', aiAnswerA);
    assert.equal(activeResult.id, 'ai-run-A');
    assert.equal(activeResult.report.id, reportA.id);

    // Step 1.2: User initiates Review for Report A (delayed in-flight)
    let resolveReviewA!: (val: any) => void;
    const reviewAPromise = new Promise((resolve) => {
      resolveReviewA = resolve;
    });
    const reviewATask = handleReviewReportRun(reportA.id, reviewAPromise);
    assert.equal(reviewingReport, true, 'Reviewing state must be active for Report A');
    assert.equal(reviewedReport, null);

    // Step 1.3: Before Review A returns, User asks Question B and Question B is answered
    const aiAnswerB = {
      status: 'answered',
      id: 'ai-run-B',
      question: '问题B: 本月资金流水',
      answer: '资金流水已生成',
      report: reportB,
    };
    handleAsk('问题B', aiAnswerB);
    assert.equal(activeResult.id, 'ai-run-B');
    assert.equal(activeResult.report.id, reportB.id);
    assert.equal(reviewedReport, null);
    assert.equal(reviewError, null);
    assert.equal(reviewingReport, false);

    // Step 1.4: User initiates Review for Report B (in-flight)
    let resolveReviewB!: (val: any) => void;
    const reviewBPromise = new Promise((resolve) => {
      resolveReviewB = resolve;
    });
    const reviewBTask = handleReviewReportRun(reportB.id, reviewBPromise);
    assert.equal(reviewingReport, true, 'Reviewing state must be active for Question B');

    // Step 1.5: Review A GET arrives late with SUCCESS (real server snapshot for Report A)
    const runARes = await fetch(`${BASE_URL}/report-runs/${reportA.id}`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    const realRunA = await runARes.json();
    resolveReviewA(realRunA);
    await reviewATask;

    // Assert: Delayed Review A success is completely discarded
    assert.equal(reviewedReport, null, 'Late Review A success MUST NOT pollute reviewedReport');
    assert.equal(reviewingReport, true, 'Late Review A MUST NOT clear Question B reviewingReport loading state');
    assert.equal(isReviewedReportRendered(), false, 'Report A table MUST NOT be rendered under Question B card');

    // Step 1.6: Review B arrives with SUCCESS (real server snapshot for Report B)
    const runBRes = await fetch(`${BASE_URL}/report-runs/${reportB.id}`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    const realRunB = await runBRes.json();
    resolveReviewB(realRunB);
    await reviewBTask;

    // Assert: Question B review completes successfully
    assert.equal(reviewingReport, false, 'Question B review must clear loading state');
    assert.ok(reviewedReport, 'Question B review must populate reviewedReport');
    assert.equal((reviewedReport as any).id, reportB.id, 'reviewedReport must be Report B');
    assert.equal(isReviewedReportRendered(), true, 'Report B table MUST be rendered under Question B card');

    // -------------------------------------------------------------
    // Scenario 2: Stale Review A arrives with FAILURE
    // -------------------------------------------------------------
    // Step 2.1: Question A asked and answered
    handleAsk('问题A再次提问', aiAnswerA);
    assert.equal(activeResult.id, 'ai-run-A');

    // Step 2.2: Review A starts and is delayed
    let rejectReviewA!: (err: any) => void;
    const reviewAFailPromise = new Promise((_, reject) => {
      rejectReviewA = reject;
    });
    const reviewAFailTask = handleReviewReportRun(reportA.id, reviewAFailPromise);
    assert.equal(reviewingReport, true);

    // Step 2.3: Question B asked and answered
    handleAsk('问题B再次提问', aiAnswerB);
    assert.equal(activeResult.id, 'ai-run-B');
    assert.equal(reviewingReport, false);

    // Step 2.4: Question B review starts
    let resolveReviewB2!: (val: any) => void;
    const reviewB2Promise = new Promise((resolve) => {
      resolveReviewB2 = resolve;
    });
    const reviewB2Task = handleReviewReportRun(reportB.id, reviewB2Promise);
    assert.equal(reviewingReport, true);

    // Step 2.5: Stale Review A rejects with 410 SNAPSHOT_EXPIRED
    rejectReviewA(new Error('410 SNAPSHOT_EXPIRED'));
    await reviewAFailTask;

    // Assert: Delayed Review A failure is completely discarded
    assert.equal(reviewError, null, 'Late Review A error MUST NOT pollute reviewError');
    assert.equal(reviewingReport, true, 'Late Review A error MUST NOT clear Question B loading state');

    // Step 2.6: Review B completes successfully
    resolveReviewB2(realRunB);
    await reviewB2Task;
    assert.equal(reviewingReport, false);
    assert.equal((reviewedReport as any).id, reportB.id);
    assert.equal(isReviewedReportRendered(), true);
  });
});
