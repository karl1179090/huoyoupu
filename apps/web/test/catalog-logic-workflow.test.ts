import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  fetchAllCustomerPriceRules,
  fetchAllProductsForRules,
  resolvePriceQuoteWithScope,
  type PriceQuoteScope,
} from '../src/pages/catalog/CustomerListPage.js';

const BASE_URL = 'http://127.0.0.1:3000/api/v1';
const CREDS_PATH = '/tmp/huoyoupu-dev-mTw6IP/credentials.json';
const ORIGIN = 'http://localhost:5173';

describe('Catalog Maintenance Domain & Workflow Tests (12.1)', () => {
  let adminCookie = '';
  let adminCsrf = '';

  let testCustomer: any = null;
  let testProduct: any = null;
  let baseUnitId = '';
  let subUnitId = '';

  test('0. Setup: Authenticate Admin using local credentials', async () => {
    assert.ok(fs.existsSync(CREDS_PATH), `Credentials file must exist at ${CREDS_PATH}`);
    const rawCreds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));

    // Step 1: Initial anonymous session
    const initRes = await fetch(`${BASE_URL}/auth/session`, {
      headers: { Origin: ORIGIN },
    });
    assert.equal(initRes.status, 200);
    const initData = (await initRes.json()) as { csrfToken: string };
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
    const loginData = (await loginRes.json()) as { csrfToken: string; user: { role: string } };
    assert.equal(loginData.user.role, 'admin');

    adminCsrf = loginData.csrfToken;
    adminCookie = loginRes.headers.get('set-cookie')?.split(';')[0] || initCookie;
  });

  test('1. Product Creation & 500mljy Mnemonic Search Rule', async () => {
    const timestamp = Date.now();
    const prodCode = `SP-D-${timestamp}`;
    const prodName = `500ml酱油特级`;

    const createRes = await fetch(`${BASE_URL}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        code: prodCode,
        name: prodName,
        specification: '500ml/瓶',
        baseUnit: {
          name: '瓶',
          defaultSalePrice: '15.00',
        },
      }),
    });
    assert.equal(createRes.status, 201, 'Create product must return 201');
    testProduct = await createRes.json();
    baseUnitId = testProduct.baseUnitId;

    // Verify generated mnemonic code contains 500mljy
    assert.ok(
      testProduct.generatedMnemonicCode.includes('500mljy'),
      `Expected generated mnemonic to include '500mljy', got ${testProduct.generatedMnemonicCode}`
    );

    // Search via q=500mljy
    const searchRes = await fetch(`${BASE_URL}/products?q=500mljy`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(searchRes.status, 200);
    const searchData = (await searchRes.json()) as { items: any[] };
    const found = searchData.items.find(p => p.id === testProduct.id);
    assert.ok(found, 'Product must be found by mnemonic search query 500mljy');
  });

  test('2. Mnemonic Code Override: Manual setting and Clearing with null', async () => {
    assert.ok(testProduct, 'Test product must exist');

    // 1. Manually set mnemonic override
    const overrideRes = await fetch(`${BASE_URL}/products/${testProduct.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        expectedVersion: testProduct.version,
        mnemonicCodeOverride: 'customjy99',
      }),
    });
    assert.equal(overrideRes.status, 200);
    testProduct = await overrideRes.json();
    assert.equal(testProduct.mnemonicCodeOverride, 'customjy99');
    assert.equal(testProduct.mnemonicCode, 'customjy99');

    // 2. Clear mnemonic override with null
    const clearRes = await fetch(`${BASE_URL}/products/${testProduct.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        expectedVersion: testProduct.version,
        mnemonicCodeOverride: null,
      }),
    });
    assert.equal(clearRes.status, 200);
    testProduct = await clearRes.json();
    assert.equal(testProduct.mnemonicCodeOverride, null, 'Override should be reset to null');
    assert.ok(testProduct.mnemonicCode.includes('500mljy'), 'Mnemonic should revert to auto generated code');
  });

  test('3. Barcode string leading zeroes preservation on independent fixture', async () => {
    assert.ok(testProduct, 'Test product must exist');

    // Refresh testProduct to get latest version
    const refreshedRes = await fetch(`${BASE_URL}/products/${testProduct.id}`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    testProduct = await refreshedRes.json();

    // Unique barcode with leading zeroes (no cross-fixture conflict, never touching other products)
    const uniqueLeadingZeroBarcode = `00${Math.floor(100000 + Math.random() * 900000)}`;
    const uniqueEanBarcode = `69${Date.now()}`;
    // Barcode update requires whole group replacement with Product version
    const barcodeRes = await fetch(`${BASE_URL}/products/${testProduct.id}/barcodes`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        expectedVersion: testProduct.version,
        barcodes: [
          { value: uniqueLeadingZeroBarcode, unitId: baseUnitId },
          { value: uniqueEanBarcode, unitId: baseUnitId },
        ],
      }),
    });
    assert.equal(barcodeRes.status, 200, 'Barcode replacement must succeed');
    testProduct = await barcodeRes.json();

    const leadingZeroBarcode = testProduct.barcodes.find((b: any) => b.value === uniqueLeadingZeroBarcode);
    assert.ok(leadingZeroBarcode, 'Leading zero barcode must be present in product barcodes');
    assert.strictEqual(leadingZeroBarcode.value, uniqueLeadingZeroBarcode, 'Leading zeros must be strictly preserved as string');
    assert.ok(leadingZeroBarcode.value.startsWith('00'), 'Barcode must start with leading zeroes');
  });

  test('4. Unit Creation & Editing (UnitPatch) with Version Check', async () => {
    assert.ok(testProduct, 'Test product must exist');

    // 1. Create auxiliary unit (box of 12)
    const createUnitRes = await fetch(`${BASE_URL}/products/${testProduct.id}/units`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        name: '箱',
        multiplierBase: 12,
        defaultSalePrice: '160.00',
        defaultReceiptCost: '120.00', // Never use sale price as purchase cost
      }),
    });
    assert.equal(createUnitRes.status, 201, 'Unit creation must return 201');
    const newUnit = (await createUnitRes.json()) as any;
    subUnitId = newUnit.id;
    assert.equal(newUnit.name, '箱');
    assert.equal(newUnit.multiplierBase, 12);
    assert.ok(newUnit.defaultSalePrice.startsWith('160.00'));
    assert.ok(newUnit.defaultReceiptCost?.startsWith('120.00'));

    // 2. Edit unit via UnitPatch
    const patchUnitRes = await fetch(`${BASE_URL}/products/${testProduct.id}/units/${subUnitId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        expectedVersion: newUnit.version,
        name: '标准箱',
        defaultSalePrice: '158.00',
        defaultReceiptCost: '115.00',
      }),
    });
    assert.equal(patchUnitRes.status, 200, 'Unit patch must succeed');
    const patchedUnit = (await patchUnitRes.json()) as any;
    assert.equal(patchedUnit.name, '标准箱');
    assert.ok(patchedUnit.defaultSalePrice.startsWith('158.00'));
    assert.ok(patchedUnit.defaultReceiptCost?.startsWith('115.00'));
    assert.equal(patchedUnit.multiplierBase, 12, 'Multiplier base must remain immutable');
    assert.ok(patchedUnit.version > newUnit.version, 'Unit version must be incremented');

    // 3. Edit base unit price
    const baseUnit = testProduct.units.find((u: any) => u.id === baseUnitId);
    assert.ok(baseUnit, 'Base unit must exist');
    const patchBaseRes = await fetch(`${BASE_URL}/products/${testProduct.id}/units/${baseUnitId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        expectedVersion: baseUnit.version,
        name: '原装瓶',
        defaultSalePrice: '14.50',
      }),
    });
    assert.equal(patchBaseRes.status, 200, 'Base unit patch must succeed');
    const patchedBase = (await patchBaseRes.json()) as any;
    assert.equal(patchedBase.name, '原装瓶');
    assert.ok(patchedBase.defaultSalePrice.startsWith('14.50'));
  });

  test('5. Customer Multi-Address Management & AddressPatch Editing', async () => {
    const timestamp = Date.now();
    const custCode = `KH-D-${timestamp}`;

    // 1. Create fictional customer
    const createCustRes = await fetch(`${BASE_URL}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        code: custCode,
        name: `测试酒楼-${timestamp}`,
        contactName: '刘经理',
        phone: '13900001111',
      }),
    });
    assert.equal(createCustRes.status, 201);
    testCustomer = await createCustRes.json();

    // 2. Add address
    const addAddrRes = await fetch(`${BASE_URL}/customers/${testCustomer.id}/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        label: '一分店',
        contactName: '刘主管',
        phone: '13900002222',
        address: '朝阳区工体北路88号',
        isDefault: true,
      }),
    });
    assert.equal(addAddrRes.status, 201);
    const addedAddr = (await addAddrRes.json()) as any;
    assert.equal(addedAddr.label, '一分店');
    assert.equal(addedAddr.isDefault, true);

    // 3. Edit address using AddressPatch
    const patchAddrRes = await fetch(`${BASE_URL}/customers/${testCustomer.id}/addresses/${addedAddr.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        expectedVersion: addedAddr.version,
        contactName: '张总厨',
        phone: '13900003333',
        address: '朝阳区工体北路88号后厨收货通道',
        label: '工体总店',
      }),
    });
    assert.equal(patchAddrRes.status, 200, 'Address patch must succeed');
    const patchedAddr = (await patchAddrRes.json()) as any;
    assert.equal(patchedAddr.contactName, '张总厨');
    assert.equal(patchedAddr.phone, '13900003333');
    assert.equal(patchedAddr.address, '朝阳区工体北路88号后厨收货通道');
    assert.equal(patchedAddr.label, '工体总店');
    assert.ok(patchedAddr.version > addedAddr.version, 'Address version must be incremented');

    // 4. Edit address: explicitly clear phone and label by sending empty string "" (P2 fix regression)
    const clearAddrRes = await fetch(`${BASE_URL}/customers/${testCustomer.id}/addresses/${addedAddr.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        expectedVersion: patchedAddr.version,
        contactName: '张总厨',
        phone: '',
        address: '朝阳区工体北路88号后厨收货通道',
        label: '',
      }),
    });
    assert.equal(clearAddrRes.status, 200, 'Address patch clearing phone/label must succeed');
    const clearedAddr = (await clearAddrRes.json()) as any;
    assert.equal(clearedAddr.phone, '', 'Phone must be cleared to empty string');
    assert.equal(clearedAddr.label, '', 'Label must be cleared to empty string');
    assert.equal(clearedAddr.contactName, '张总厨');

    // 5. Read back customer from API and verify cleared address values persist
    const refCustRes = await fetch(`${BASE_URL}/customers/${testCustomer.id}`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    const refCust = (await refCustRes.json()) as any;
    const refAddr = refCust.addresses.find((a: any) => a.id === addedAddr.id);
    assert.ok(refAddr, 'Address must exist in customer profile');
    assert.equal(refAddr.phone, '', 'Persisted address phone must remain cleared');
    assert.equal(refAddr.label, '', 'Persisted address label must remain cleared');
  });

  test('6. Customer Price Rules (Upsert, Delete, Hierarchy & Source Tracing)', async () => {
    assert.ok(testCustomer && testProduct, 'Customer and product must exist');

    // 1. Initial price quote before rule (should be default unit price)
    const quoteBeforeRes = await fetch(
      `${BASE_URL}/customers/${testCustomer.id}/price-quote?productId=${testProduct.id}&unitId=${baseUnitId}`,
      { headers: { Origin: ORIGIN, Cookie: adminCookie } }
    );
    assert.equal(quoteBeforeRes.status, 200);
    const quoteBefore = (await quoteBeforeRes.json()) as any;
    assert.equal(quoteBefore.source, 'default', 'Initial price quote should have source=default');

    // 2. Upsert customer price rule (new rule: expectedVersion=0)
    const upsertRes = await fetch(
      `${BASE_URL}/customers/${testCustomer.id}/price-rules/${testProduct.id}/${baseUnitId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          'X-CSRF-Token': adminCsrf,
          Cookie: adminCookie,
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          expectedVersion: 0,
          unitPrice: '12.80',
        }),
      }
    );
    assert.equal(upsertRes.status, 200, 'Price rule create must return 200');
    const createdRule = (await upsertRes.json()) as any;
    assert.ok(createdRule.unitPrice.startsWith('12.80'));
    assert.equal(createdRule.version, 1);

    // 3. Price quote with rule established (should be customer_rule)
    const quoteWithRuleRes = await fetch(
      `${BASE_URL}/customers/${testCustomer.id}/price-quote?productId=${testProduct.id}&unitId=${baseUnitId}`,
      { headers: { Origin: ORIGIN, Cookie: adminCookie } }
    );
    assert.equal(quoteWithRuleRes.status, 200);
    const quoteWithRule = (await quoteWithRuleRes.json()) as any;
    assert.equal(quoteWithRule.source, 'customer_rule');
    assert.ok(quoteWithRule.unitPrice.startsWith('12.80'));

    // 4. Update customer price rule (expectedVersion=1 -> version becomes 2)
    const updateRuleRes = await fetch(
      `${BASE_URL}/customers/${testCustomer.id}/price-rules/${testProduct.id}/${baseUnitId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          'X-CSRF-Token': adminCsrf,
          Cookie: adminCookie,
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          expectedVersion: createdRule.version,
          unitPrice: '12.00',
        }),
      }
    );
    assert.equal(updateRuleRes.status, 200);
    const updatedRule = (await updateRuleRes.json()) as any;
    assert.ok(updatedRule.unitPrice.startsWith('12.00'));
    assert.equal(updatedRule.version, 2);

    // 5. Delete customer price rule with expectedVersion
    const deleteRuleRes = await fetch(
      `${BASE_URL}/customers/${testCustomer.id}/price-rules/${testProduct.id}/${baseUnitId}?expectedVersion=${updatedRule.version}`,
      {
        method: 'DELETE',
        headers: {
          Origin: ORIGIN,
          'X-CSRF-Token': adminCsrf,
          Cookie: adminCookie,
          'Idempotency-Key': crypto.randomUUID(),
        },
      }
    );
    assert.equal(deleteRuleRes.status, 204, 'Delete price rule must return 204');

    // 6. Price quote after rule deleted (should revert to default)
    const quoteAfterRes = await fetch(
      `${BASE_URL}/customers/${testCustomer.id}/price-quote?productId=${testProduct.id}&unitId=${baseUnitId}`,
      { headers: { Origin: ORIGIN, Cookie: adminCookie } }
    );
    assert.equal(quoteAfterRes.status, 200);
    const quoteAfter = (await quoteAfterRes.json()) as any;
    assert.equal(quoteAfter.source, 'default', 'Price quote must revert to default after rule deletion');
  });

  test('7. Production CustomerListPage Helpers: >100 Continuation & Slow A / Fast B Quote Scope Regression', async () => {
    // 1. Production fetchAllCustomerPriceRules & fetchAllProductsForRules: >100 pagination continuation
    // Simulates multi-page fetch with nextCursor across pages
    let pageCount = 0;
    const mockMultiPageFetch = async (
      _customerId: string,
      options: { limit: number; cursor?: string }
    ) => {
      pageCount++;
      if (!options.cursor) {
        // Page 1: 100 items with nextCursor
        const items = Array.from({ length: 100 }, (_, i) => ({
          productId: `prod-${i}`,
          unitId: `unit-${i}`,
          unitPrice: '10.00',
          version: 1,
        }));
        return { items, nextCursor: 'cursor-page-2' };
      } else {
        // Page 2: 25 items with no nextCursor (end of pages)
        const items = Array.from({ length: 25 }, (_, i) => ({
          productId: `prod-p2-${i}`,
          unitId: `unit-p2-${i}`,
          unitPrice: '12.00',
          version: 1,
        }));
        return { items, nextCursor: null };
      }
    };

    let activeScope = { customerId: 'cust-scope-1', seq: 1 };
    const allRules = await fetchAllCustomerPriceRules(
      'cust-scope-1',
      1,
      (cId, seq) => activeScope.customerId === cId && activeScope.seq === seq,
      mockMultiPageFetch as any
    );
    assert.ok(allRules, 'Continuation rules must be returned');
    assert.equal(allRules.length, 125, 'fetchAllCustomerPriceRules must exhaustively fetch all 125 rules across pages');
    assert.equal(pageCount, 2, 'Must have traversed 2 pages via cursor');

    // 2. Cancellation during continuation: if scope invalidates on page 2, returns null
    pageCount = 0;
    const cancelledRules = await fetchAllCustomerPriceRules(
      'cust-scope-1',
      1,
      (_cId, _seq) => {
        // Simulate customer modal switch after page 1 is fetched
        return pageCount < 2;
      },
      mockMultiPageFetch as any
    );
    assert.equal(cancelledRules, null, 'Scope invalidation mid-pagination must drop result and return null');

    // 3. P2 Race Condition Regression: Same Customer Switching Product A -> B (Slow A / Fast B)
    // User is on customer 'cust-1', modalSeq: 1.
    // Product A is selected -> quoteGen: 1, delayed network response (80ms).
    // User quickly switches to Product B -> quoteGen: 2, fast network response (20ms).
    const currentScopeTracker: PriceQuoteScope = {
      customerId: 'cust-1',
      modalSeq: 1,
      productId: 'prod-B',
      unitId: 'unit-B',
      quoteGen: 2, // Current generation is 2 (Product B)
    };

    const isQuoteScopeValid = (cId: string, pId: string, uId: string, mSeq: number, qGen: number) => {
      return (
        currentScopeTracker.customerId === cId &&
        currentScopeTracker.modalSeq === mSeq &&
        currentScopeTracker.productId === pId &&
        currentScopeTracker.unitId === uId &&
        currentScopeTracker.quoteGen === qGen
      );
    };

    // Simulate Product A fetch (slow: 80ms)
    const fetchQuoteA = async () => {
      await new Promise(r => setTimeout(r, 80));
      return {
        unitPrice: '99.00',
        source: 'history' as const,
        sourceOrderId: 'order-AAA',
        sourceRevisionId: 'rev-1',
        sourceLineId: null,
        sourceConfirmedAt: null,
        sourceNetAmount: null,
      };
    };

    // Simulate Product B fetch (fast: 20ms)
    const fetchQuoteB = async () => {
      await new Promise(r => setTimeout(r, 20));
      return {
        unitPrice: '45.00',
        source: 'customer_rule' as const,
        sourceOrderId: null,
        sourceRevisionId: null,
        sourceLineId: null,
        sourceConfirmedAt: null,
        sourceNetAmount: null,
      };
    };

    // Launch both concurrent quote requests
    const promiseA = resolvePriceQuoteWithScope('cust-1', 'prod-A', 'unit-A', 1, 1, isQuoteScopeValid, fetchQuoteA);
    const promiseB = resolvePriceQuoteWithScope('cust-1', 'prod-B', 'unit-B', 1, 2, isQuoteScopeValid, fetchQuoteB);

    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

    // Product B (fast, current generation) must resolve successfully
    assert.ok(resultB, 'Product B quote must be accepted');
    assert.equal(resultB.unitPrice, '45.00');
    assert.equal(resultB.source, 'customer_rule');

    // Product A (slow, stale generation) must be discarded (returns null), preventing overwrite
    assert.equal(resultA, null, 'Slow Product A quote must be rejected and not overwrite Product B');
  });

  test('8. Warehouse List Pagination & Filtering (No includeInactive parameter)', async () => {
    // 1. List warehouses with limit 2
    const whRes = await fetch(`${BASE_URL}/warehouses?limit=2`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(whRes.status, 200);
    const whData = (await whRes.json()) as any;
    assert.ok(Array.isArray(whData.items), 'items must be an array');
    assert.ok('asOf' in whData, 'WarehousePage must contain asOf');

    // 2. Search query q
    const firstWh = whData.items[0];
    if (firstWh) {
      const searchWhRes = await fetch(`${BASE_URL}/warehouses?q=${encodeURIComponent(firstWh.code)}`, {
        headers: { Origin: ORIGIN, Cookie: adminCookie },
      });
      assert.equal(searchWhRes.status, 200);
      const searchWhData = (await searchWhRes.json()) as any;
      assert.ok(searchWhData.items.some((w: any) => w.id === firstWh.id), 'Search must return matched warehouse');
    }
  });
});
