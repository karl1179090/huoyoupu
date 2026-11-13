import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parseSchema} from '@huoyoupu/contracts';
import {apiFixture, password, writeHeaders} from './helpers.js';
import {resolveDeliverySnapshot} from '../src/modules/catalog/service.js';

test('independent HTTP acceptance of catalog contracts, authorization, transactions and audit', async t => {
  const fixture = await apiFixture();
  const {app, pool} = fixture;
  try {
    const admin = await fixture.login();
    const key = randomUUID();
    const productInput = {code: 'HTTP-SOY', name: '500ML酱油', baseUnit: {name: '瓶', defaultSalePrice: '2.50', defaultReceiptCost: '1.00'}, units: [{name: '件', multiplierBase: 24, defaultSalePrice: '60'}], barcodes: [{value: '0012345678901', unitName: '瓶'}]};
    const created = await app.inject({method: 'POST', url: '/api/v1/products', headers: writeHeaders(admin, key), payload: productInput});
    assert.equal(created.statusCode, 201, created.body);
    let product = parseSchema('Product', created.json());
    const pack = product.units.find(unit => unit.name === '件')!;
    await t.test('product creation, idempotency and normalized searchable names preserve exact fields', async () => {
      assert.equal(product.mnemonicCode, '500mljy');
      assert.equal(product.barcodes[0]!.value, '0012345678901');
      const repeated = await app.inject({method: 'POST', url: '/api/v1/products', headers: writeHeaders(admin, key), payload: productInput});
      assert.equal(repeated.statusCode, 201);
      assert.deepEqual(repeated.json(), created.json());
      for (const q of ['500MLJY', 'jy', '0012345678901']) {
        const found = await app.inject({url: `/api/v1/products?q=${encodeURIComponent(q)}`, headers: {cookie: admin.cookie}});
        assert.equal(found.statusCode, 200);
        const page = parseSchema('ProductPage', found.json());
        assert.equal(page.items[0]!.id, product.id);
      }
      const duplicate = await app.inject({method: 'POST', url: '/api/v1/products', headers: writeHeaders(admin), payload: {...productInput, code: 'http-soy'}});
      assert.equal(duplicate.statusCode, 422);
      parseSchema('ApiError', duplicate.json());
      assert.equal((await pool.query('SELECT count(*) FROM products')).rows[0].count, '1');
    });
    await t.test('mnemonic override and rename are versioned, and referenced unit meaning remains stable', async () => {
      const corrected = await app.inject({method: 'PATCH', url: `/api/v1/products/${product.id}`, headers: writeHeaders(admin), payload: {expectedVersion: product.version, mnemonicCodeOverride: 'OVERRIDE500'}});
      assert.equal(corrected.statusCode, 200);
      product = parseSchema('Product', corrected.json());
      const renamed = await app.inject({method: 'PATCH', url: `/api/v1/products/${product.id}`, headers: writeHeaders(admin), payload: {expectedVersion: product.version, name: '250ml酱油'}});
      assert.equal(renamed.statusCode, 200);
      product = parseSchema('Product', renamed.json());
      assert.equal(product.mnemonicCode, '250mljy');
      assert.equal(product.mnemonicCodeOverride, null);
      // This real FK models a prior transaction without fabricating an order service result.
      await pool.query('CREATE TABLE acceptance_unit_references(id uuid PRIMARY KEY,unit_id uuid NOT NULL REFERENCES product_units(id))');
      await pool.query('INSERT INTO acceptance_unit_references VALUES ($1,$2)', [randomUUID(), pack.id]);
      const changed = await app.inject({method: 'PATCH', url: `/api/v1/products/${product.id}/units/${pack.id}`, headers: writeHeaders(admin), payload: {expectedVersion: pack.version, multiplierBase: 12}});
      assert.equal(changed.statusCode, 422);
      assert.equal(changed.json().code, 'UNIT_REFERENCED');
    });
    const customerResponse = await app.inject({method: 'POST', url: '/api/v1/customers', headers: writeHeaders(admin), payload: {code: 'HTTP-C', name: '虚构客户'}});
    assert.equal(customerResponse.statusCode, 201);
    const customer = parseSchema('Customer', customerResponse.json());
    const otherResponse = await app.inject({method: 'POST', url: '/api/v1/customers', headers: writeHeaders(admin), payload: {code: 'HTTP-C2', name: '虚构客户乙'}});
    const other = parseSchema('Customer', otherResponse.json());
    await t.test('customer addresses enforce customer scope, one default, and immutable captured delivery data', async () => {
      const first = await app.inject({method: 'POST', url: `/api/v1/customers/${customer.id}/addresses`, headers: writeHeaders(admin), payload: {contactName: '联系人甲', address: '旧地址', isDefault: true}});
      assert.equal(first.statusCode, 201);
      parseSchema('Address', first.json());
      const second = await app.inject({method: 'POST', url: `/api/v1/customers/${customer.id}/addresses`, headers: writeHeaders(admin), payload: {contactName: '联系人乙', address: '第二地址', isDefault: true}});
      assert.equal(second.statusCode, 201);
      const address = parseSchema('Address', second.json());
      const before = await resolveDeliverySnapshot(pool, customer.id);
      const changed = await app.inject({method: 'PATCH', url: `/api/v1/customers/${customer.id}/addresses/${address.id}`, headers: writeHeaders(admin), payload: {expectedVersion: address.version, address: '新地址'}});
      assert.equal(changed.statusCode, 200);
      assert.equal(before.address, '第二地址');
      assert.equal((await resolveDeliverySnapshot(pool, customer.id)).address, '新地址');
      const wrongCustomer = await app.inject({method: 'PATCH', url: `/api/v1/customers/${other.id}/addresses/${address.id}`, headers: writeHeaders(admin), payload: {expectedVersion: address.version + 1, active: false}});
      assert.equal(wrongCustomer.statusCode, 404);
      const currentResponse = await app.inject({url: `/api/v1/customers/${customer.id}`, headers: {cookie: admin.cookie}});
      const current = parseSchema('Customer', currentResponse.json());
      assert.equal(current.addresses.filter(item => item.active && item.isDefault).length, 1);
      const disabled = await app.inject({method: 'PATCH', url: `/api/v1/customers/${customer.id}/addresses/${address.id}`, headers: writeHeaders(admin), payload: {expectedVersion: address.version + 1, active: false}});
      assert.equal(disabled.statusCode, 200);
      assert.equal(parseSchema('Address', disabled.json()).isDefault, false);
      await assert.rejects(resolveDeliverySnapshot(pool, customer.id, address.id), /地址/);
    });
    await t.test('dedicated pricing uses ownership and versions with connected historical source', async () => {
      const url = `/api/v1/customers/${customer.id}/price-rules/${product.id}/${product.baseUnitId}`;
      const result = await app.inject({method: 'PUT', url, headers: writeHeaders(admin), payload: {expectedVersion: 0, unitPrice: '1.234567'}});
      assert.equal(result.statusCode, 200);
      assert.equal(parseSchema('PriceRule', result.json()).unitPrice, '1.234567');
      const stale = await app.inject({method: 'PUT', url, headers: writeHeaders(admin), payload: {expectedVersion: 0, unitPrice: '1'}});
      assert.equal(stale.statusCode, 409);
      const quote = await app.inject({url: `/api/v1/customers/${customer.id}/price-quote?productId=${product.id}&unitId=${product.baseUnitId}`, headers: {cookie: admin.cookie}});
      assert.equal(quote.statusCode, 200,quote.body);
      const price=parseSchema('PriceQuote',quote.json());assert.equal(price.unitPrice,'1.234567');assert.equal(price.source,'customer_rule');assert.equal(price.sourceOrderId,null);
    });
    await t.test('employee management requests fail before effects and all successful catalog mutations have entity audits', async () => {
      const employeeResponse = await app.inject({method: 'POST', url: '/api/v1/users', headers: writeHeaders(admin), payload: {loginName: 'catalog-reader', password, role: 'employee'}});
      assert.equal(employeeResponse.statusCode, 201);
      const employee = await fixture.login('catalog-reader');
      const forbidden = await app.inject({method: 'PATCH', url: `/api/v1/products/${product.id}`, headers: writeHeaders(employee), payload: {expectedVersion: product.version, active: false}});
      assert.equal(forbidden.statusCode, 403);
      assert.ok(!/cost|profit|password_hash|token_hash/i.test(forbidden.body));
      assert.equal((await pool.query('SELECT active FROM products WHERE id=$1', [product.id])).rows[0].active, true);
      const events = await pool.query("SELECT * FROM audit_events WHERE entity_type IN ('product','customer','address','price_rule')");
      assert.ok(events.rows.length >= 8);
      assert.ok(events.rows.some(row => Number(row.old_version) > 0 && Number(row.new_version) > Number(row.old_version)));
      assert.ok(!JSON.stringify(events.rows).includes(password));
    });
  } finally {await fixture.cleanup();}
});
