import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSchema, type SchemaValue} from '@huoyoupu/contracts';
import {apiFixture, writeHeaders} from './helpers.js';

test('revision quotes correlate original lines after set and return splits without persisting estimates', async t => {
  const f = await apiFixture();
  try {
    const credentials = await f.login();
    const post = async (url: string, payload: object, status = 201) => {
      const response = await f.app.inject({method: 'POST', url, headers: writeHeaders(credentials), payload});
      assert.equal(response.statusCode, status, response.body);
      return response.json();
    };
    const customer = parseSchema('Customer', await post('/api/v1/customers', {code: 'QUOTE-C', name: '虚构报价关联客户'}));
    await post(`/api/v1/customers/${customer.id}/addresses`, {contactName: '虚构', address: '虚构报价地址', isDefault: true});
    const product = parseSchema('Product', await post('/api/v1/products', {
      code: 'QUOTE-P', name: '同商品多行', baseUnit: {name: '瓶', defaultSalePrice: '2'},
      units: [{name: '件', multiplierBase: 12, defaultSalePrice: '24'}],
    }));
    const warehouse = parseSchema('Warehouse', await post('/api/v1/warehouses', {code: 'QUOTE-W', name: '虚构报价仓'}));
    await post('/api/v1/receipts', {kind: 'opening', warehouseId: warehouse.id, receivedAt: '2026-01-01T00:00:00Z',
      lines: [{productId: product.id, unitId: product.baseUnitId, quantity: 100, unitCost: '1'}]});
    const caseUnit = product.units.find(unit => unit.multiplierBase === 12)!;
    const line = (clientLineId: string, quantity: number, unitId = product.baseUnitId, unitPrice = '2') => ({
      clientLineId, productId: product.id, warehouseId: warehouse.id, unitId, quantity, unitPrice, allocationMode: 'auto' as const,
    });
    const draft = parseSchema('OrderAdmin', await post('/api/v1/orders', {customerId: customer.id,
      lines: [line('first-case', 1, caseUnit.id, '24'), line('same-product-second', 2)], discountAmount: '0.00', roundOffAmount: '0.00'}));
    const order = parseSchema('OrderAdmin', await post(`/api/v1/orders/${draft.id}/confirm`, {expectedVersion: draft.version}, 200));
    const first = order.lines[0]!;
    const second = order.lines[1]!;
    // Compare every table's rows, including operations/audits/allocations/account views.
    // Authentication may touch a session; no session token or row content is exposed by this fingerprint.
    const snapshot = async () => {
      const tables = (await f.pool.query<{table_name: string}>(`SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name<>'sessions' ORDER BY table_name`)).rows;
      const hashes = [];
      for (const {table_name} of tables) {
        const quoted = '"' + table_name.replaceAll('"', '""') + '"';
        const result = await f.pool.query(`SELECT count(*)::text AS count,
          md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]')) AS digest FROM ${quoted} r`);
        hashes.push({table: table_name, ...result.rows[0]});
      }
      return hashes;
    };
    const quote = async (revision: SchemaValue<'OrderReviseInput'>) => {
      const before = await snapshot();
      const result = parseSchema('OrderQuote', await post('/api/v1/orders/quote', {orderId: order.id, revision}, 200));
      assert.equal(result.stockReserved, false);
      assert.deepEqual(await snapshot(), before, 'quote must not persist business, operation or audit changes');
      return result.calculation;
    };
    const uniqueSource = (calculation: SchemaValue<'OrderCalculation'>, sourceLineId: string, readOnly = false) => {
      const matches = calculation.lines.filter(row => row.sourceLineId === sourceLineId && row.readOnly === readOnly);
      assert.equal(matches.length, 1, 'sourceLineId + readOnly must identify this existing line segment');
      return matches[0]!;
    };

    await t.test('unreturned set keeps each existing source; same-product add keeps only its client key', async () => {
      const calculation = await quote({expectedVersion: order.version, reason: '无退报价关联', lineChanges: [
        {op: 'set', lineId: first.id, unitPrice: '36'},
        {op: 'set', lineId: second.id, unitPrice: '5'},
        {op: 'add', line: line('new-same-product', 1, product.baseUnitId, '7')},
      ]});
      assert.equal(uniqueSource(calculation, first.id).netAmount, '36.00');
      assert.equal(uniqueSource(calculation, second.id).netAmount, '10.00');
      const added = calculation.lines.find(row => row.clientLineId === 'new-same-product')!;
      assert.ok(added);
      assert.equal(added.sourceLineId, null);
      assert.equal(added.netAmount, '7.00');
      assert.equal(calculation.lines.length, 3);
    });

    const returned = parseSchema('SalesReturn', await post(`/api/v1/orders/${order.id}/returns`, {
      expectedVersion: order.version, reason: '首退三瓶', lines: [{lineId: first.id, quantityBase: 3}],
    }));
    await t.test('first return no-op quote binds protected 3 and editable 9 to the original case line', async () => {
      const calculation = await quote({expectedVersion: returned.orderVersion, reason: '首次退后初始预览', lineChanges: []});
      const history = uniqueSource(calculation, first.id, true);
      const editable = uniqueSource(calculation, first.id);
      assert.deepEqual([history.quantityBase, history.netAmount, history.costAmount], [3, '6.00', '3.00']);
      assert.deepEqual([editable.quantityBase, editable.netAmount, editable.costAmount], [9, '18.00', '9.00']);
      assert.equal(history.unitId, product.baseUnitId);
      assert.equal(editable.unitId, product.baseUnitId);
      assert.equal(uniqueSource(calculation, second.id).quantityBase, 2);
      assert.equal(calculation.lines.length, 3);
    });
    await t.test('set of a split remainder preserves original source across repeated quotes and duplicate products', async () => {
      const revision: SchemaValue<'OrderReviseInput'> = {expectedVersion: returned.orderVersion, reason: '退后改基础价', lineChanges: [
        {op: 'set', lineId: first.id, unitId: product.baseUnitId, quantity: 12, unitPrice: '3'},
        {op: 'set', lineId: second.id, unitPrice: '5'},
        {op: 'add', line: line('new-same-product', 1, product.baseUnitId, '7')},
      ]};
      for (let attempt = 0; attempt < 2; attempt++) {
        const calculation = await quote(revision);
        const history = uniqueSource(calculation, first.id, true);
        const editable = uniqueSource(calculation, first.id);
        assert.deepEqual([history.quantityBase, history.netAmount], [3, '6.00']);
        assert.deepEqual([editable.quantityBase, editable.netAmount], [9, '27.00']);
        assert.deepEqual([uniqueSource(calculation, second.id).quantityBase, uniqueSource(calculation, second.id).netAmount], [2, '10.00']);
        const added = calculation.lines.find(row => row.clientLineId === 'new-same-product')!;
        assert.equal(added.sourceLineId, null);
        assert.equal(added.netAmount, '7.00');
        assert.equal(calculation.totalAmount, '50.00');
        assert.equal(calculation.costAmount, '15.00');
        assert.equal(calculation.lines.length, 4);
      }
    });
  } finally {
    await f.cleanup();
  }
});
