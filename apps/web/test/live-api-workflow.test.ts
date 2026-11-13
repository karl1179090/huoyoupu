import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE_URL = 'http://127.0.0.1:3000/api/v1';
const CREDS_PATH = '/tmp/huoyoupu-dev-mTw6IP/credentials.json';

interface LoginResponse {
  csrfToken: string;
  user: {
    id: string;
    loginName: string;
    role: 'admin' | 'employee';
  };
}

describe('Live API Workflow & Role Projection Integration Tests', () => {
  let adminCookie = '';
  let adminCsrf = '';
  let employeeCookie = '';
  let employeeCsrf = '';

  let testCustomer: any = null;
  let testProducts: any[] = [];
  let testWarehouses: any[] = [];
  let confirmedOrderId = '';
  let confirmedVersion = 0;

  test('0. Setup: Read credentials and authenticate Admin & Employee', async () => {
    assert.ok(fs.existsSync(CREDS_PATH), `Credentials file must exist at ${CREDS_PATH}`);
    const rawCreds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));
    const ORIGIN = 'http://localhost:5173';

    // 1. Initial anonymous session to get CSRF token and cookie
    const initRes = await fetch(`${BASE_URL}/auth/session`, {
      headers: { Origin: ORIGIN },
    });
    const initData = await initRes.json();
    const initCsrf = initData.csrfToken;
    const initCookie = initRes.headers.get('set-cookie')?.split(';')[0] || '';

    // 2. Admin login with CSRF token and Origin
    const adminRes = await fetch(`${BASE_URL}/auth/login`, {
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
    assert.equal(adminRes.status, 200, 'Admin login must succeed');
    const adminData = (await adminRes.json()) as LoginResponse;
    assert.equal(adminData.user.role, 'admin');
    adminCsrf = adminData.csrfToken;
    const adminSetCookie = adminRes.headers.get('set-cookie');
    assert.ok(adminSetCookie, 'Admin session cookie must be set');
    adminCookie = adminSetCookie.split(';')[0]!;

    // 3. Employee login with fresh session CSRF token
    const empInitRes = await fetch(`${BASE_URL}/auth/session`, {
      headers: { Origin: ORIGIN },
    });
    const empInitData = await empInitRes.json();
    const empInitCsrf = empInitData.csrfToken;
    const empInitCookie = empInitRes.headers.get('set-cookie')?.split(';')[0] || '';

    const empRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': empInitCsrf,
        Cookie: empInitCookie,
      },
      body: JSON.stringify({
        loginName: rawCreds.employee.loginName,
        password: rawCreds.employee.password,
      }),
    });
    assert.equal(empRes.status, 200, 'Employee login must succeed');
    const empData = (await empRes.json()) as LoginResponse;
    assert.equal(empData.user.role, 'employee');
    employeeCsrf = empData.csrfToken;
    const empSetCookie = empRes.headers.get('set-cookie');
    assert.ok(empSetCookie, 'Employee session cookie must be set');
    employeeCookie = empSetCookie.split(';')[0]!;
  });

  test('1. Verify active session and role-based permissions', async () => {
    const sessionRes = await fetch(`${BASE_URL}/auth/session`, {
      headers: {
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
      },
    });
    assert.equal(sessionRes.status, 200);
    const sessionData = await sessionRes.json();
    assert.equal(sessionData.user.role, 'admin');
    adminCsrf = sessionData.csrfToken;
  });

  test('2. Retrieve catalog: customers, warehouses, and products', async () => {
    const [custRes, whRes, prodRes] = await Promise.all([
      fetch(`${BASE_URL}/customers?limit=10`, {
        headers: { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf },
      }),
      fetch(`${BASE_URL}/warehouses`, {
        headers: { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf },
      }),
      fetch(`${BASE_URL}/products?limit=10`, {
        headers: { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf },
      }),
    ]);

    assert.equal(custRes.status, 200);
    assert.equal(whRes.status, 200);
    assert.equal(prodRes.status, 200);

    const custData = await custRes.json();
    const whData = await whRes.json();
    const prodData = await prodRes.json();

    assert.ok(custData.items.length > 0, 'Must have at least one test customer');
    assert.ok(whData.items.length > 0, 'Must have at least one test warehouse');
    assert.ok(prodData.items.length > 0, 'Must have at least one test product');

    testCustomer = custData.items.find((c: any) => c.active && c.addresses && c.addresses.some((a: any) => a.active)) || custData.items.find((c: any) => c.active) || custData.items[0];
    testWarehouses = whData.items.filter((w: any) => w.active);
    testProducts = prodData.items.filter((p: any) => p.active);
  });

  test('3. Server-side order quote calculation with multi-line items', async () => {
    const product = testProducts[0]!;
    const warehouse = testWarehouses[0]!;
    const baseUnitId = product.baseUnitId;

    const addressPayload = testCustomer.addresses?.[0]?.id
      ? { addressId: testCustomer.addresses[0].id }
      : {
          deliverySnapshot: {
            customerName: testCustomer.name,
            contactName: testCustomer.contactName || '默认收件人',
            phone: testCustomer.phone || '13800000000',
            address: '测试配送地址',
          },
        };

    const quotePayload = {
      customerId: testCustomer.id,
      ...addressPayload,
      lines: [
        {
          clientLineId: 'line-test-1',
          productId: product.id,
          warehouseId: warehouse.id,
          unitId: baseUnitId,
          quantity: 2,
          unitPrice: '10.00',
          allocationMode: 'auto',
        },
      ],
      discountAmount: '0.00',
      roundOffAmount: '0.00',
    };

    const quoteRes = await fetch(`${BASE_URL}/orders/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
      },
      body: JSON.stringify(quotePayload),
    });

    assert.equal(quoteRes.status, 200);
    const quote = await quoteRes.json();
    assert.ok(quote.calculation, 'Quote must return server calculation');
    assert.ok(Number(quote.calculation.totalAmount) >= 0);
  });

  test('4. Create draft order and atomically confirm with expectedVersion & Idempotency-Key', async () => {
    const product = testProducts[0]!;
    const warehouse = testWarehouses[0]!;
    const idempotencyKeyDraft = 'test-draft-' + Date.now();

    const addressPayload = testCustomer.addresses?.[0]?.id
      ? { addressId: testCustomer.addresses[0].id }
      : {
          deliverySnapshot: {
            customerName: testCustomer.name,
            contactName: testCustomer.contactName || '默认收件人',
            phone: testCustomer.phone || '13800000000',
            address: '测试配送地址',
          },
        };

    const draftPayload = {
      customerId: testCustomer.id,
      ...addressPayload,
      lines: [
        {
          clientLineId: 'client-line-1',
          productId: product.id,
          warehouseId: warehouse.id,
          unitId: product.baseUnitId,
          quantity: 1,
          unitPrice: '10.00',
          allocationMode: 'auto',
        },
      ],
      discountAmount: '0.00',
      roundOffAmount: '0.00',
    };

    const draftRes = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': idempotencyKeyDraft,
      },
      body: JSON.stringify(draftPayload),
    });

    assert.equal(draftRes.status, 201);
    const draft = await draftRes.json();
    assert.equal(draft.status, 'draft');
    assert.equal(typeof draft.version, 'number');

    // Confirm order with expectedVersion
    const idempotencyKeyConfirm = 'test-confirm-' + Date.now();
    const confirmRes = await fetch(`${BASE_URL}/orders/${draft.id}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': idempotencyKeyConfirm,
      },
      body: JSON.stringify({ expectedVersion: draft.version }),
    });

    assert.equal(confirmRes.status, 200);
    const confirmed = await confirmRes.json();
    assert.equal(confirmed.status, 'confirmed');
    assert.ok(confirmed.version > draft.version, 'Confirmed version must increment');

    confirmedOrderId = confirmed.id;
    confirmedVersion = confirmed.version;
  });

  test('5. Revise confirmed order with revision reason and version tracking', async () => {
    const product = testProducts[0]!;
    const warehouse = testWarehouses[0]!;
    const idempotencyKeyRevise = 'test-revise-' + Date.now();

    const revisePayload = {
      expectedVersion: confirmedVersion,
      reason: '客户临时电话要求变更配送数量',
      lineChanges: [
        {
          op: 'add',
          line: {
            clientLineId: 'rev-line-2',
            productId: product.id,
            warehouseId: warehouse.id,
            unitId: product.baseUnitId,
            quantity: 1,
            unitPrice: '10.00',
            allocationMode: 'auto',
          },
        },
      ],
    };

    const reviseRes = await fetch(`${BASE_URL}/orders/${confirmedOrderId}/revisions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': idempotencyKeyRevise,
      },
      body: JSON.stringify(revisePayload),
    });

    assert.equal(reviseRes.status, 201);
    const revised = await reviseRes.json();
    assert.ok(revised.revisionNo >= 1, 'Revision number must increment');
    assert.ok(revised.version > confirmedVersion, 'Version must increment after revision');
  });

  test('6. Role Projection Guard: Employee view omits cost and gross profit fields (OrderPublic)', async () => {
    // Admin reads the order
    const adminGetRes = await fetch(`${BASE_URL}/orders/${confirmedOrderId}`, {
      headers: { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf },
    });
    assert.equal(adminGetRes.status, 200);
    const adminOrder = await adminGetRes.json();
    assert.ok(adminOrder.costAmount !== undefined, 'Admin must see costAmount');
    assert.ok(adminOrder.grossProfit !== undefined, 'Admin must see grossProfit');

    // Employee reads the same order
    const empGetRes = await fetch(`${BASE_URL}/orders/${confirmedOrderId}`, {
      headers: { Cookie: employeeCookie, 'X-CSRF-Token': employeeCsrf },
    });
    assert.equal(empGetRes.status, 200);
    const empOrder = await empGetRes.json();

    // Verify employee view hides costAmount and grossProfit (OrderPublic)
    assert.equal(empOrder.costAmount, undefined, 'Employee view must hide costAmount');
    assert.equal(empOrder.grossProfit, undefined, 'Employee view must hide grossProfit');
  });
});
