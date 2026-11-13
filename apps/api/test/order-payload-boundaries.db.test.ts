import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parseSchema, type SchemaValue} from '@huoyoupu/contracts';
import {createComparisonReportFixture} from './support/comparison-report-fixture.js';

test('isolated HTTP validates joint stock, canonical discount money and order version concurrency', {timeout: 45000}, async t => {
  const origin = 'http://localhost:5173';
  const fixture = await createComparisonReportFixture({frontendOrigin: origin, timers: t.mock.timers});
  const cookies = new Map<string, string>(); let csrf = '';
  async function call(method: string, path: string, body?: object, expected = 200) {
    const response = await fetch(fixture.apiOrigin + '/api/v1' + path, {method, headers: {
      origin, ...(csrf ? {'x-csrf-token': csrf} : {}),
      ...(cookies.size ? {cookie: [...cookies].map(([key, value]) => key + '=' + value).join('; ')} : {}),
      ...(body ? {'content-type': 'application/json', 'idempotency-key': randomUUID()} : {}),
    }, ...(body ? {body: JSON.stringify(body)} : {})});
    assert.equal(response.status, expected, method + ' ' + path);
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(';'); const index = pair!.indexOf('='); cookies.set(pair!.slice(0, index), pair!.slice(index + 1));
    }
    return response.json();
  }
  try {
    csrf = parseSchema('Session', await call('GET', '/auth/session')).csrfToken;
    csrf = parseSchema('Session', await call('POST', '/auth/login', fixture.admin)).csrfToken;
    const payload = (quantity: number, discountAmount: string): SchemaValue<'OrderDraftInput'> => ({
      customerId: fixture.customers.decline.id,
      lines: ['2', '3'].map((unitPrice, i) => ({clientLineId: 'independent-' + i, productId: fixture.product.id,
        warehouseId: fixture.warehouse.id, unitId: fixture.product.baseUnitId, quantity, unitPrice, allocationMode: 'auto'})),
      discountAmount, roundOffAmount: '0.00',
    });
    const shortage = parseSchema('ApiError', await call('POST', '/orders/quote', payload(20, '0.00'), 409));
    assert.equal(shortage.code, 'INSUFFICIENT_STOCK');
    // UnitPrice '2'/'3' is legal; Money '1' deliberately reproduces the current UI payload.
    const invalidMoney = parseSchema('ApiError', await call('POST', '/orders/quote', payload(2, '1'), 400));
    assert.equal(invalidMoney.code, 'INVALID_REQUEST');
    const valid = parseSchema('OrderQuote', await call('POST', '/orders/quote', payload(2, '1.00')));
    assert.equal(valid.calculation.subtotalAmount, '10.00');
    assert.equal(valid.calculation.discountAmount, '1.00'); assert.equal(valid.calculation.totalAmount, '9.00');
    assert.equal(valid.calculation.lines.length, 2); assert.equal(valid.stockReserved, false);
    await fixture.assertSeedUnchanged();

    const order = parseSchema('OrderAdmin', await call('GET', '/orders/' + fixture.orders[0]!.orderId));
    const stock = async () => parseSchema('StockBalancePage', await call('GET', `/inventory/balances?productId=${fixture.product.id}&warehouseId=${fixture.warehouse.id}`)).items;
    const balance = async () => {
      const {asOf, ...values} = parseSchema('CustomerBalance', await call('GET', `/customers/${order.customerId}/balance`));
      return values;
    };
    const stockBefore = await stock(), balanceBefore = await balance();
    const delivered = parseSchema('OrderAdmin', await call('POST', `/orders/${order.id}/delivery`, {
      expectedVersion: order.version, deliveryStatus: 'delivered',
    }));
    assert.equal(delivered.version, order.version + 1); assert.equal(delivered.revisionNo, order.revisionNo);
    const external = parseSchema('OrderAdmin', await call('POST', `/orders/${order.id}/revisions`, {
      expectedVersion: delivered.version, reason: '真实外部空行更正', lineChanges: [],
    }, 201));
    assert.equal(external.version, delivered.version + 1); assert.equal(external.revisionNo, delivered.revisionNo + 1);
    const stale = parseSchema('ApiError', await call('POST', `/orders/${order.id}/revisions`, {
      expectedVersion: delivered.version, reason: '旧version拒绝', lineChanges: [],
    }, 409));
    assert.equal(stale.code, 'VERSION_CONFLICT');
    const refreshed = parseSchema('OrderAdmin', await call('GET', '/orders/' + order.id));
    const retried = parseSchema('OrderAdmin', await call('POST', `/orders/${order.id}/revisions`, {
      expectedVersion: refreshed.version, reason: '刷新后新key新version提交', lineChanges: [],
    }, 201));
    assert.equal(retried.version, external.version + 1); assert.equal(retried.revisionNo, external.revisionNo + 1);
    assert.deepEqual(await stock(), stockBefore); assert.deepEqual(await balance(), balanceBefore);
    const history = parseSchema('OrderRevisionPage', await call('GET', `/orders/${order.id}/revisions`));
    assert.ok(history.items.some(item => item.changeReason === '真实外部空行更正'));
    t.diagnostic('ORDER_PAYLOAD_FACTS ' + JSON.stringify({
      shortage: {httpStatus: 409, ...shortage}, invalidMoney: {httpStatus: 400, ...invalidMoney},
      validQuote: {httpStatus: 200, subtotalAmount: valid.calculation.subtotalAmount,
        discountAmount: valid.calculation.discountAmount, totalAmount: valid.calculation.totalAmount, stockReserved: valid.stockReserved},
      versions: {confirmed: {version: order.version, revisionNo: order.revisionNo}, delivered: {version: delivered.version, revisionNo: delivered.revisionNo},
        external: {version: external.version, revisionNo: external.revisionNo}, staleError: stale, refreshed: {version: retried.version, revisionNo: retried.revisionNo}},
    }));
  } finally { await fixture.close(); }
});
