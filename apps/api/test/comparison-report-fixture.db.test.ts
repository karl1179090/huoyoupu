import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSchema} from '@huoyoupu/contracts';
import {createComparisonReportFixture} from './support/comparison-report-fixture.js';

test('standalone HTTP report fixture naturally aligns historical commercial dates and three comparison rows', {timeout: 45000}, async t => {
  const beforeSetup = Date.now();
  const frontendOrigin = 'http://localhost:5173';
  const fixture = await createComparisonReportFixture({frontendOrigin, timers: t.mock.timers});
  let csrf = ''; const cookies = new Map<string, string>();
  async function call(method: string, path: string, body?: object) {
    const response = await fetch(fixture.apiOrigin + '/api/v1' + path, {method, headers: {
      origin: frontendOrigin, ...(csrf ? {'x-csrf-token': csrf} : {}),
      ...(cookies.size ? {cookie: [...cookies].map(([key, value]) => key + '=' + value).join('; ')} : {}),
      ...(body ? {'content-type': 'application/json'} : {}),
    }, ...(body ? {body: JSON.stringify(body)} : {})});
    assert.equal(response.status, 200, method + ' ' + path);
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(';'); const i = pair!.indexOf('='); cookies.set(pair!.slice(0, i), pair!.slice(i + 1));
    }
    return response.json();
  }
  try {
    assert.ok(Date.now() >= beforeSetup, 'Date restored before returning API to browser setup');
    assert.notEqual(fixture.apiOrigin, 'http://127.0.0.1:3000');
    assert.equal(fixture.orders.length, 5);
    csrf = parseSchema('Session', await call('GET', '/auth/session')).csrfToken;
    csrf = parseSchema('Session', await call('POST', '/auth/login', fixture.admin)).csrfToken;
    // Match the browser's controlled transport: create a full default-size run, then GET its first page.
    const fullRun = parseSchema('Report_customer_product_comparison', await call('POST', '/reports/query', fixture.query));
    assert.equal(fullRun.rows.length, 3); assert.equal(fullRun.nextCursor, null);
    const run = parseSchema('Report_customer_product_comparison', await call('GET', `/report-runs/${fullRun.id}?limit=1`));
    assert.equal(run.rows.length, 1);
    const describePage = (page: typeof run, url: string) => ({url, requestedLimit: 1, normalizedQueryLimit: page.normalizedQuery.limit,
      id: page.id, customerIds: page.rows.map(row => row.customerId), nextCursor: page.nextCursor,
      asOf: page.asOf, sourceWatermark: page.sourceWatermark});
    const pages = [describePage(run, `/report-runs/${run.id}?limit=1`)];
    assert.ok(run.nextCursor, 'First of three one-row pages must have a next cursor');
    const rows = [...run.rows]; let cursor: string | null = run.nextCursor;
    while (cursor) {
      const url: string = `/report-runs/${run.id}?limit=1&cursor=${encodeURIComponent(cursor)}`;
      const next: typeof run = parseSchema('Report_customer_product_comparison', await call('GET', url));
      assert.equal(next.id, run.id); assert.equal(next.asOf, run.asOf); assert.equal(next.sourceWatermark, run.sourceWatermark);
      assert.equal(next.rows.length, 1);
      pages.push(describePage(next, url));
      rows.push(...next.rows); cursor = next.nextCursor;
    }
    assert.equal(pages.length, 3);
    assert.ok(pages[1]!.nextCursor, 'Second page is not the last of three one-row pages');
    assert.equal(pages[2]!.nextCursor, null);
    assert.equal(new Set(rows.map(row => row.customerId)).size, 3);
    t.diagnostic('REAL_REPORT_PAGES ' + JSON.stringify({fullRun: {id: fullRun.id, rowCount: fullRun.rows.length,
      normalizedQueryLimit: fullRun.normalizedQuery.limit, nextCursor: fullRun.nextCursor}, pages}));
    assert.equal(rows.length, 3);
    for (const key of ['decline', 'zero', 'new'] as const) {
      const expected = fixture.expected[key];
      const row = rows.find(row => row.customerId === fixture.customers[key].id)!;
      assert.ok(row); assert.equal(row.productId, fixture.product.id);
      assert.equal(row.baselineOrderedQuantityBase, expected.baseline);
      assert.equal(row.currentOrderedQuantityBase, expected.current);
      assert.equal(row.quantityChangeBase, expected.change);
      assert.equal(row.changePercent, expected.percent); assert.equal(row.trend, expected.trend);
      assert.equal(row.currentReturnQuantityBase, 0); assert.equal(row.baselineReturnQuantityBase, 0);
    }
    const balance = parseSchema('StockBalancePage', await call('GET', `/inventory/balances?productId=${fixture.product.id}&warehouseId=${fixture.warehouse.id}`));
    assert.equal(balance.items[0]?.quantityBase, 31); assert.equal(balance.items[0]?.costAmount, '31.00');
    for (const [key, amount] of [['decline', '28.00'], ['zero', '6.00'], ['new', '4.00']] as const) {
      const current = parseSchema('CustomerBalance', await call('GET', `/customers/${fixture.customers[key].id}/balance`));
      assert.equal(current.netBalance, amount);
    }
    const sources = parseSchema('SourcePage', await call('GET', `/report-runs/${run.id}/sources`));
    assert.equal(sources.items.length, 5);
    assert.deepEqual(new Set(sources.items.map(source => source.id)), new Set(fixture.orders.map(order => order.revisionId)));
    for (const order of fixture.orders) {
      const stored = parseSchema('OrderAdmin', await call('GET', `/orders/${order.orderId}`));
      assert.equal(stored.confirmedAt, order.confirmedAt);
      const ledger = parseSchema('LedgerPage', await call('GET', `/customers/${order.customerId}/ledger`));
      assert.equal(ledger.items.find(entry => entry.sourceId === order.orderId)?.effectiveAt, stored.confirmedAt);
    }
    await fixture.assertSeedUnchanged();
  } finally { await fixture.close(); }
  await assert.rejects(fetch(fixture.apiOrigin + '/health'), 'Own HTTP server closes');
});
