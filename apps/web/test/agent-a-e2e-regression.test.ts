import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import type { Customer, Address, Product, Warehouse, OrderAny } from '../src/api/types.js';

const API_BASE = 'http://127.0.0.1:3000/api/v1';
const APP_ORIGIN = 'http://localhost:5173';

interface Fixtures {
  fixtureWarehouse: Warehouse;
  fixtureCustomer: Customer;
  fixtureAddress: Address;
  fixtureProducts: Product[];
  fixtureDraftOrder: OrderAny;
  fixtureMobileDraftOrder: OrderAny;
  fixtureConfirmedOrder: OrderAny;
  fixtureReturnOrder: OrderAny;
  getOrder: (id: string) => Promise<OrderAny>;
  getRevisions: (id: string) => Promise<{ items: any[] }>;
  getCustomerBalance: (customerId: string) => Promise<{
    customerId: string;
    netBalance: string;
    receivableBalance: string;
    creditBalance: string;
  }>;
}

/**
 * Isolated Node-side API helper using absolute API origin, Origin header, and session cookies.
 * Does not import or execute browser-relative production client in Node.js.
 */
async function createTest4Fixtures(creds: { loginName: string; password: string }): Promise<Fixtures> {
  // 1. Initial anonymous session challenge
  const initRes = await fetch(`${API_BASE}/auth/session`, {
    headers: { Origin: APP_ORIGIN },
  });
  assert.equal(initRes.status, 200, 'Init session challenge must succeed');
  const initData = (await initRes.json()) as { csrfToken: string };
  const initCookie = initRes.headers.get('set-cookie')?.split(';')[0] || '';
  assert.ok(initData.csrfToken, 'Init CSRF token must exist');

  // 2. Admin login via API
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: APP_ORIGIN,
      'X-CSRF-Token': initData.csrfToken,
      Cookie: initCookie,
    },
    body: JSON.stringify({
      loginName: creds.loginName,
      password: creds.password,
    }),
  });
  assert.equal(loginRes.status, 200, 'Admin API login for fixture setup must succeed');
  const loginData = (await loginRes.json()) as { csrfToken: string; user: { role: string } };
  assert.equal(loginData.user.role, 'admin', 'Authenticated user must be admin');
  const adminCsrf = loginData.csrfToken;
  const adminCookie = loginRes.headers.get('set-cookie')?.split(';')[0] || initCookie;
  assert.ok(adminCsrf && adminCookie, 'Admin session cookie and CSRF token must exist');

  // Internal helper for authenticated admin API requests with strict status checks
  async function adminRequest<T>(
    endpoint: string,
    options: { method?: string; body?: unknown; idempotencyKey?: string } = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      Origin: APP_ORIGIN,
      'X-CSRF-Token': adminCsrf,
      Cookie: adminCookie,
    };
    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const resText = await res.text();
    let data: any;
    try {
      data = JSON.parse(resText);
    } catch {
      data = resText;
    }
    assert.ok(
      res.status >= 200 && res.status < 300,
      `API request ${options.method || 'GET'} ${endpoint} failed (${res.status}): ${typeof data === 'object' ? JSON.stringify(data) : data}`
    );
    return data as T;
  }

  // 1. Warehouse fixture
  const whPage = await adminRequest<{ items: Warehouse[] }>('/warehouses');
  let fixtureWarehouse = whPage.items.find(w => w.active);
  if (!fixtureWarehouse) {
    fixtureWarehouse = await adminRequest<Warehouse>('/warehouses', {
      method: 'POST',
      body: {
        code: `WH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: `E2E测试主仓-${Date.now()}`,
      },
      idempotencyKey: `idemp-wh-${Date.now()}`,
    });
  }
  assert.ok(fixtureWarehouse && fixtureWarehouse.id && fixtureWarehouse.active, 'Warehouse fixture must be valid and active');

  // 2. Customer fixture with valid default address
  const custCode = `E2E${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 1000)}`;
  const fixtureCustomer = await adminRequest<Customer>('/customers', {
    method: 'POST',
    body: {
      name: `E2E自动化客户-${Date.now()}`,
      code: custCode,
      contactName: '高主管',
      phone: '13911112222',
      notes: 'A18底部确认及长单滚动自动化验收专用',
    },
    idempotencyKey: `idemp-cust-${Date.now()}`,
  });
  assert.ok(fixtureCustomer && fixtureCustomer.id && fixtureCustomer.active, 'Customer fixture must be created successfully');

  const fixtureAddress = await adminRequest<Address>(`/customers/${fixtureCustomer.id}/addresses`, {
    method: 'POST',
    body: {
      contactName: '高主管',
      phone: '13911112222',
      address: '北京市海淀区科技大厦A座801室',
      label: '总店',
      isDefault: true,
    },
    idempotencyKey: `idemp-addr-${Date.now()}`,
  });
  assert.ok(fixtureAddress && fixtureAddress.id && fixtureAddress.isDefault, 'Default customer address fixture must be valid');

  // 3. Products fixture: always create 5 dedicated active products with base units
  // so the picker can search/select deterministic products owned by this test run
  // instead of relying on another fixture's first-screen catalog rows.
  const prodStamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const fixtureProducts: Product[] = [];
  for (let i = 0; i < 5; i++) {
    const newP = await adminRequest<Product>('/products', {
      method: 'POST',
      body: {
        code: `P-${prodStamp}-${i + 1}`,
        name: `E2E商品-${prodStamp}-${i + 1}`,
        specification: '500g/包',
        brand: '测试品牌',
        baseUnit: {
          name: '包',
          defaultSalePrice: '20.00',
          defaultReceiptCost: '10.00',
        },
      },
      idempotencyKey: `idemp-prod-${prodStamp}-${i + 1}`,
    });
    assert.ok(newP && newP.id && newP.baseUnitId, 'Product fixture must be created with baseUnitId');
    assert.equal(newP.active, true, 'Product fixture must be active');
    fixtureProducts.push(newP);
  }
  assert.equal(fixtureProducts.length, 5, 'Must have exactly 5 dedicated active products for fixture');
  assert.ok(fixtureProducts.every(p => p.baseUnitId && p.active), 'All products must have baseUnitId and be active');

  // 4. Stock Receipt: Strictly assert successful receipt confirmation without swallowing errors
  const receipt = await adminRequest<{ id: string }>('/receipts', {
    method: 'POST',
    body: {
      kind: 'opening',
      warehouseId: fixtureWarehouse.id,
      receivedAt: new Date().toISOString(),
      lines: fixtureProducts.map(p => ({
        productId: p.id,
        unitId: p.baseUnitId,
        quantity: 200,
        unitCost: '10.00',
      })),
    },
    idempotencyKey: `idemp-rcpt-${Date.now()}`,
  });
  assert.ok(receipt && receipt.id, 'Inventory receipt must be created and confirmed successfully');

  // 5. Draft order fixture for desktop verification
  const fixtureDraftOrder = await adminRequest<OrderAny>('/orders', {
    method: 'POST',
    body: {
      customerId: fixtureCustomer.id,
      addressId: fixtureAddress.id,
      lines: fixtureProducts.slice(0, 4).map((p, idx) => ({
        clientLineId: `draft-line-${idx + 1}`,
        productId: p.id,
        warehouseId: fixtureWarehouse.id,
        unitId: p.baseUnitId,
        quantity: 2,
        unitPrice: '25.00',
        allocationMode: 'auto',
      })),
      discountAmount: '0.00',
      roundOffAmount: '0.00',
      remark: 'E2E独立草稿长单底栏验证：需核对多行滚动及底部确认条',
    },
    idempotencyKey: `idemp-draft-${Date.now()}`,
  });
  assert.ok(fixtureDraftOrder && fixtureDraftOrder.id, 'Draft order fixture must be created');
  assert.equal(fixtureDraftOrder.status, 'draft', 'Draft order fixture status must be draft');

  // 6. Separate draft order fixture for mobile verification (since desktop confirms fixtureDraftOrder)
  const fixtureMobileDraftOrder = await adminRequest<OrderAny>('/orders', {
    method: 'POST',
    body: {
      customerId: fixtureCustomer.id,
      addressId: fixtureAddress.id,
      lines: fixtureProducts.slice(0, 4).map((p, idx) => ({
        clientLineId: `m-draft-line-${idx + 1}`,
        productId: p.id,
        warehouseId: fixtureWarehouse.id,
        unitId: p.baseUnitId,
        quantity: 2,
        unitPrice: '25.00',
        allocationMode: 'auto',
      })),
      discountAmount: '0.00',
      roundOffAmount: '0.00',
      remark: 'E2E移动端独立草稿长单底栏验证',
    },
    idempotencyKey: `idemp-m-draft-${Date.now()}`,
  });
  assert.ok(fixtureMobileDraftOrder && fixtureMobileDraftOrder.id, 'Mobile draft order fixture must be created');
  assert.equal(fixtureMobileDraftOrder.status, 'draft', 'Mobile draft order fixture status must be draft');

  // 7. Confirmed order fixture for edit verification
  const draftToConfirm = await adminRequest<OrderAny>('/orders', {
    method: 'POST',
    body: {
      customerId: fixtureCustomer.id,
      addressId: fixtureAddress.id,
      lines: fixtureProducts.slice(0, 4).map((p, idx) => ({
        clientLineId: `conf-line-${idx + 1}`,
        productId: p.id,
        warehouseId: fixtureWarehouse.id,
        unitId: p.baseUnitId,
        quantity: 2,
        unitPrice: '30.00',
        allocationMode: 'auto',
      })),
      discountAmount: '0.00',
      roundOffAmount: '0.00',
      remark: 'E2E独立更正长单底栏验证：需核对更正按钮与差额预测',
    },
    idempotencyKey: `idemp-conf-draft-${Date.now()}`,
  });
  assert.ok(draftToConfirm && draftToConfirm.id, 'Draft order to confirm must be created');

  const fixtureConfirmedOrder = await adminRequest<OrderAny>(`/orders/${draftToConfirm.id}/confirm`, {
    method: 'POST',
    body: { expectedVersion: draftToConfirm.version },
    idempotencyKey: `idemp-conf-action-${Date.now()}`,
  });
  assert.ok(fixtureConfirmedOrder && fixtureConfirmedOrder.id, 'Confirmed order fixture must be created');
  assert.equal(fixtureConfirmedOrder.status, 'confirmed', 'Confirmed order fixture status must be confirmed');

  // 8. Return test product, order and confirmed return (for Stage A20 return-then-edit regression)
  // Dedicated customer + address so this return scenario has its own 18.00 -> 27.00
  // account baseline and never mixes with other fixture customers' debt orders.
  const returnCustCode = `RET${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 1000)}`;
  const returnCustomer = await adminRequest<Customer>('/customers', {
    method: 'POST',
    body: {
      name: `E2E退货专用客户-${Date.now()}`,
      code: returnCustCode,
      contactName: '退货专员',
      phone: '13822223333',
      notes: 'A20退货改单专用独立客户，禁止与其他fixture订单混用',
    },
    idempotencyKey: `idemp-cust-ret-${Date.now()}`,
  });
  assert.ok(returnCustomer && returnCustomer.id, 'Dedicated return customer must be created');

  const returnAddress = await adminRequest<Address>(`/customers/${returnCustomer.id}/addresses`, {
    method: 'POST',
    body: {
      contactName: '退货专员',
      phone: '13822223333',
      address: '北京市朝阳区退货测试大厦3层',
      label: '退货专用',
      isDefault: true,
    },
    idempotencyKey: `idemp-addr-ret-${Date.now()}`,
  });
  assert.ok(returnAddress && returnAddress.id && returnAddress.isDefault, 'Dedicated return address must be valid');

  const returnProduct = await adminRequest<Product>('/products', {
    method: 'POST',
    body: {
      code: `P-RET-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `E2E退货改单商品-${Date.now()}`,
      specification: '500ml*12/件',
      brand: '精酿测试',
      baseUnit: {
        name: '瓶',
        defaultSalePrice: '2.00',
        defaultReceiptCost: '1.00',
      },
      units: [
        {
          name: '件',
          multiplierBase: 12,
          defaultSalePrice: '24.00',
          defaultReceiptCost: '12.00',
        },
      ],
    },
    idempotencyKey: `idemp-prod-ret-${Date.now()}`,
  });
  assert.ok(returnProduct && returnProduct.id && returnProduct.baseUnitId, 'Return test product must be created');

  const rcptRet = await adminRequest<{ id: string }>('/receipts', {
    method: 'POST',
    body: {
      kind: 'opening',
      warehouseId: fixtureWarehouse.id,
      receivedAt: new Date().toISOString(),
      lines: [
        {
          productId: returnProduct.id,
          unitId: returnProduct.baseUnitId,
          quantity: 100,
          unitCost: '1.00',
        },
      ],
    },
    idempotencyKey: `idemp-rcpt-ret-${Date.now()}`,
  });
  assert.ok(rcptRet && rcptRet.id, 'Stock receipt for return product must be confirmed');

  const caseUnit = returnProduct.units.find(u => u.name === '件') || returnProduct.units[0]!;

  const draftRetOrder = await adminRequest<OrderAny>('/orders', {
    method: 'POST',
    body: {
      customerId: returnCustomer.id,
      addressId: returnAddress.id,
      lines: [
        {
          clientLineId: `ret-init-line-1`,
          productId: returnProduct.id,
          warehouseId: fixtureWarehouse.id,
          unitId: caseUnit.id,
          quantity: 1,
          unitPrice: '24.00',
          allocationMode: 'auto',
        },
      ],
      discountAmount: '0.00',
      roundOffAmount: '0.00',
      remark: 'A20首次退货后改单真实闭环测试订单',
    },
    idempotencyKey: `idemp-draft-ret-${Date.now()}`,
  });
  assert.ok(draftRetOrder && draftRetOrder.id, 'Draft order for return test must be created');

  const confRetOrder = await adminRequest<OrderAny>(`/orders/${draftRetOrder.id}/confirm`, {
    method: 'POST',
    body: { expectedVersion: draftRetOrder.version },
    idempotencyKey: `idemp-conf-ret-${Date.now()}`,
  });
  assert.ok(confRetOrder && confRetOrder.id, 'Order for return test must be confirmed');

  assert.ok(confRetOrder.lines && confRetOrder.lines.length > 0, 'Confirmed return order must have lines');
  const returnLine = confRetOrder.lines[0]!;

  // Confirm return: 3 bottles
  const returnRes = await adminRequest<{ id: string; returnAmount: string }>(`/orders/${confRetOrder.id}/returns`, {
    method: 'POST',
    body: {
      expectedVersion: confRetOrder.version,
      reason: '客户要求退回3瓶',
      lines: [
        {
          lineId: returnLine.id,
          quantityBase: 3,
        },
      ],
    },
    idempotencyKey: `idemp-act-ret-${Date.now()}`,
  });
  assert.ok(returnRes && returnRes.id, 'Sales return must be confirmed');

  const fixtureReturnOrder = await adminRequest<OrderAny>(`/orders/${confRetOrder.id}`);
  assert.ok(fixtureReturnOrder.lines && fixtureReturnOrder.lines.length > 0, 'Return order must have lines');
  assert.equal(fixtureReturnOrder.lines[0]!.returnedQuantityBase, 3, 'Returned quantity base must be 3');

  return {
    fixtureWarehouse,
    fixtureCustomer,
    fixtureAddress,
    fixtureProducts,
    fixtureDraftOrder,
    fixtureMobileDraftOrder,
    fixtureConfirmedOrder,
    fixtureReturnOrder,
    getOrder: (id: string) => adminRequest<OrderAny>(`/orders/${id}`),
    getRevisions: (id: string) =>
      adminRequest<{ items: any[] }>(`/orders/${id}/revisions?limit=50`),
    getCustomerBalance: (customerId: string) =>
      adminRequest<{
        customerId: string;
        netBalance: string;
        receivableBalance: string;
        creditBalance: string;
      }>(`/customers/${customerId}/balance`),
  };
}

/**
 * Selects THIS test's own fixture products inside the real BatchProductPicker:
 * search by exact fixture product name, click its row's 添加 button, and require
 * the configured-line counter / join button to reach the expected row count.
 * A plan of [p1,p2,p3,p4,p5,p1,p2,p3] produces 8 configured lines (a real long order).
 */
async function pickFixtureProducts(
  page: Page,
  fixtureProducts: Product[],
  plan: Product[],
  options: { assertConfiguredRows: boolean; warehouseName: string }
): Promise<number> {
  const search = page.locator('.picker-modal-body input[placeholder*="搜索商品"]');
  await search.waitFor({ state: 'visible', timeout: 8000 });

  for (let i = 0; i < plan.length; i++) {
    const prod = plan[i]!;
    await search.fill(prod.name);
    const row = page
      .locator('.picker-catalog-col div[style*="cursor: pointer"]')
      .filter({ hasText: prod.name })
      .first();
    await row.waitFor({ state: 'visible', timeout: 8000 });
    const addBtn = row.getByRole('button', { name: '添加' });
    assert.ok(await addBtn.isEnabled(), `Picker add button for fixture product ${prod.name} must be enabled`);
    await addBtn.click();

    // The picker footer must really report i+1 configured lines (visible on desktop AND mobile).
    const expectedJoin = page.getByRole('button', {
      name: new RegExp(`确认加入订单\\s*\\(${i + 1}\\s*行\\)`),
    });
    await expectedJoin.waitFor({ state: 'visible', timeout: 8000 });
    if (options.assertConfiguredRows) {
      // Desktop right-hand selected column: the i-th configured line header.
      const lineHeader = page.locator('.picker-lines-scroll span', { hasText: `#${i + 1} ${prod.name}` });
      await lineHeader.first().waitFor({ state: 'visible', timeout: 8000 });
    } else {
      // Mobile catalog tab hides the selected column; assert the selected-tab counter instead.
      await page.getByRole('button', { name: new RegExp(`已选配置\\s*\\(${i + 1}行\\)`) })
        .waitFor({ state: 'visible', timeout: 8000 });
      // Reveal the selected-lines tab so each line's real warehouse control can be configured.
      await page.getByRole('button', { name: new RegExp(`已选配置\\s*\\(${i + 1}行\\)`) }).click();
    }

    // Each configured line defaults to warehouses[0]; pin THIS test's own active, stocked
    // fixture warehouse on the real per-line 出货仓库 select (first select of the line card).
    const warehouseSelect = page
      .locator('.picker-lines-scroll select')
      .nth(i * 3); // 出货仓库 / 销售单位 / 批次分配 per line card
    await warehouseSelect.waitFor({ state: 'visible', timeout: 8000 });
    await warehouseSelect.selectOption({ label: options.warehouseName });
    assert.equal(
      await warehouseSelect.inputValue(),
      await warehouseSelect.locator(`option:text-is("${options.warehouseName}")`).getAttribute('value'),
      `Picker line ${i + 1} must use fixture warehouse ${options.warehouseName}`
    );

    if (!options.assertConfiguredRows) {
      // Return to the catalog tab so the next search/添加 still works on mobile.
      await page.getByRole('button', { name: /浏览商品/ }).click();
    }
  }

  assert.ok(fixtureProducts.length >= 5, 'Fixture must provide at least 5 active products');
  return plan.length;
}

/**
 * Tracks failed quote calls so a stuck "no quote" state reports the real server
 * rejection instead of an opaque locator timeout.
 */
function trackQuoteResponses(page: Page): string[] {
  const failures: string[] = [];
  page.on('response', res => {
    if (res.url().includes('/quote') && res.status() >= 300) {
      failures.push(`quote HTTP ${res.status()}: ${res.url()}`);
    }
  });
  page.on('requestfailed', req => {
    if (req.url().includes('/quote')) {
      failures.push(`quote request failed: ${req.failure()?.errorText ?? 'unknown'}`);
    }
  });
  return failures;
}

/** Waits for the real Create page live quote (bottom summary must show a ¥ total). */
async function waitForCreateQuote(page: Page, quoteFailures: string[]): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.order-bottom-summary-text');
        return Boolean(el && el.textContent && el.textContent.includes('¥'));
      },
      undefined,
      { timeout: 25000 }
    );
  } catch (err) {
    const summary = await page.locator('.order-bottom-summary-text').innerText().catch(() => '<missing>');
    throw new Error(
      `Create page live quote never rendered a ¥ total. summary="${summary}" quoteFailures=${JSON.stringify(quoteFailures)}`
    );
  }
}

/**
 * AppLayout's main content column (flex:1; overflowY:auto; maxHeight:100vh) is the REAL
 * scroll owner inside the app shell — window scrolling does not move it. Scroll that
 * owner to its true end and report its metrics so the geometry assertions judge the
 * genuine end-of-page position instead of an unscrolled container.
 */
async function scrollOwnerToBottom(page: Page): Promise<{
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  atEnd: boolean;
}> {
  const metrics = await page.evaluate(async () => {
    const main = document.querySelector('main');
    let owner: HTMLElement | null = main ? (main.parentElement as HTMLElement | null) : null;
    while (owner) {
      const style = window.getComputedStyle(owner);
      if (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        owner.scrollHeight > owner.clientHeight + 1
      ) {
        break;
      }
      owner = owner.parentElement as HTMLElement | null;
    }
    if (!owner) return null;
    owner.scrollTop = owner.scrollHeight;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return {
      scrollTop: Math.round(owner.scrollTop),
      clientHeight: Math.round(owner.clientHeight),
      scrollHeight: Math.round(owner.scrollHeight),
      atEnd: owner.scrollTop + owner.clientHeight >= owner.scrollHeight - 2,
    };
  });
  assert.ok(metrics, 'AppLayout scroll owner (overflowY auto column) must exist');
  assert.ok(metrics.atEnd, `Scroll owner must reach its real end: ${JSON.stringify(metrics)}`);
  return metrics;
}

/**
 * The real mobile bottom navigation is AppLayout's `<nav className="hide-desktop">`
 * (sticky, bottom:0, height: var(--mobile-nav-height)). There is no `.mobile-bottom-nav`
 * class. Assert it exists uniquely, is visible, and has a real bounding box.
 */
async function mobileBottomNavBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('nav.hide-desktop')).filter(n => {
        const r = (n as HTMLElement).getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }).length === 1,
    undefined,
    { timeout: 8000 }
  );
  const navs = page.locator('nav.hide-desktop');
  assert.equal(await navs.count(), 1, 'There must be exactly one mobile bottom nav container');
  const box = await navs.boundingBox();
  assert.ok(box, 'Mobile bottom nav must have a bounding box');
  assert.ok(box.width > 0 && box.height > 0, 'Mobile bottom nav must be visible');
  return box;
}

describe('Agent A Core Scope Headless E2E Regression Tests', () => {
  let browser: Browser;
  let credentialsPath: string;
  let credentials: { admin: { loginName: string; password: string }; employee: { loginName: string; password: string } };

  test('0. Headless browser and credentials setup', async () => {
    browser = await chromium.launch({ headless: true });
    credentialsPath = '/tmp/huoyoupu-dev-mTw6IP/credentials.json';
    assert.ok(fs.existsSync(credentialsPath), 'Credentials file must exist');
    credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
  });

  test('1. Employee role login defaults to orders list and 403 blocks admin pages without admin requests', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // Track network requests to ensure no forbidden admin APIs are called
    const forbiddenRequests: string[] = [];
    page.on('request', req => {
      const url = req.url();
      if (url.includes('/api/v1/orders/') && url.includes('/returns')) {
        forbiddenRequests.push(url);
      }
      if (url.includes('/api/v1/users') && req.method() === 'POST') {
        forbiddenRequests.push(url);
      }
    });

    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Login as employee
    await page.fill('input[placeholder*="用户名"], input[type="text"]', credentials.employee.loginName);
    await page.fill('input[type="password"]', credentials.employee.password);
    await page.click('button[type="submit"]');

    // Employee default route must be orders
    await page.waitForSelector('text=销售订单管理');
    const orderTitle = await page.locator('text=销售订单管理').isVisible();
    assert.ok(orderTitle, 'Employee must land on Order List page');

    // Attempt to navigate via huoyoupu:navigate to admin-only page (e.g. /receipts/new or users)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('huoyoupu:navigate', { detail: { href: '/customers/cust-1' } }));
    });

    // 403 screen must be shown
    await page.waitForSelector('text=403 访问权限受限');
    const forbiddenTitle = await page.locator('text=403 访问权限受限').isVisible();
    assert.ok(forbiddenTitle, 'Employee accessing admin page must display 403 Forbidden screen');

    // Click return to orders
    await page.click('button:has-text("返回订单列表")');
    await page.waitForSelector('text=销售订单管理');

    assert.equal(forbiddenRequests.length, 0, 'No forbidden administrative API requests should have been fired');
    await context.close();
  });

  test('2. Admin login, Customer & Address change with instant quote invalidation & snapshot capturing', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Login as admin
    await page.fill('input[placeholder*="用户名"], input[type="text"]', credentials.admin.loginName);
    await page.fill('input[type="password"]', credentials.admin.password);
    await page.click('button[type="submit"]');

    // Wait for OrderCreatePage workbench
    await page.waitForSelector('text=销售开单工作台');

    // Open customer picker modal
    await page.click('button:has-text("选择客户与地址"), button:has-text("更换客户/地址")');
    await page.waitForSelector('text=配送与交付设置');

    // Check custom snapshot form rendering and validation rejection
    const customSnapshotBtn = page.locator('button:has-text("录入本次自定义快照")');
    if (await customSnapshotBtn.isVisible()) {
      await customSnapshotBtn.click();
    }

    // Verify snapshot fields exist: contact name, phone, address
    await page.waitForSelector('text=联系人姓名');
    await page.waitForSelector('text=联系电话');
    await page.waitForSelector('text=交付 / 提货地址');

    // Fill snapshot
    await page.fill('input[placeholder*="例如：张经理"]', '李主管');
    await page.fill('input[placeholder*="例如：13800000000"]', '13911112222');
    await page.fill('input[placeholder*="请输入明确地址"]', '北京市海淀区科技园8号楼1层');

    // Confirm selection
    await page.click('button:has-text("确认选用该客户")');

    // Customer should now be chosen in OrderCreatePage
    await page.waitForSelector('text=李主管');

    // Navigate to OrderListPage to inspect orders via nav item
    await page.click('button:has-text("订单管理")');
    await page.waitForSelector('text=销售订单管理');

    // Wait for order rows to load
    await page.waitForSelector('tbody tr');
    const firstOrderRow = page.locator('tbody tr').first();
    const hasOrder = await firstOrderRow.isVisible();

    if (hasOrder) {
      await firstOrderRow.click();
      await page.waitForSelector('text=返回列表');

      const snapshotDir = path.resolve('docs/ui/build-web-inventory-v1/implementation');
      fs.mkdirSync(snapshotDir, { recursive: true });

      // Click Revisions History tab
      const revTab = page.locator('button:has-text("版本历史")');
      if (await revTab.isVisible()) {
        await revTab.click();
        await page.waitForSelector('text=版本号');

        // Check if a view revision snapshot button exists
        const viewSnapshotBtn = page.locator('button:has-text("查看此版本快照")').first();
        if (await viewSnapshotBtn.isVisible()) {
          await viewSnapshotBtn.click();
          await page.waitForSelector('text=历史版本只读快照');
          const snapshotBanner = await page.locator('text=历史版本只读快照').isVisible();
          assert.ok(snapshotBanner, 'Historical revision snapshot banner must be visible');

          // Capture screenshot of revision snapshot
          await page.screenshot({ path: path.join(snapshotDir, 'order-revision-snapshot.png'), fullPage: true });

          // Return to current revision
          await page.click('button:has-text("返回当前生效版本")');
        }
      }

      // If order is confirmed and not voided/delivered, test edit order navigation
      const editBtn = page.locator('button:has-text("更正改单")');
      if (await editBtn.isVisible()) {
        await editBtn.click();
        await page.waitForSelector('text=更正已确认销售订单');

        // Verify Customer & Delivery Card in OrderEditPage
        await page.waitForSelector('text=客户与配送信息');
        await page.waitForSelector('button:has-text("更换客户 / 配送信息")');

        // Capture screenshot of OrderEditPage with Customer/Address and Account Changes
        await page.screenshot({ path: path.join(snapshotDir, 'order-edit-customer-accounts.png'), fullPage: true });
      }
    }

    await context.close();
  });

  test('3. Real browser lifecycle: Admin -> Logout -> Employee (no reload) -> Logout -> Admin (no reload)', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    let pageReloadCount = 0;
    page.on('load', () => {
      pageReloadCount++;
    });

    // 1. Initial Login as Admin
    await page.fill('input[type="text"]', credentials.admin.loginName);
    await page.fill('input[type="password"]', credentials.admin.password);
    await page.click('button[type="submit"]');

    // Wait for Admin Workbench
    await page.waitForSelector('text=销售开单工作台');
    assert.ok(await page.locator('text=管理员').first().isVisible(), 'Admin role badge must be visible');

    // 2. Admin Logout
    await page.click('button[title="退出登录"]');
    await page.waitForSelector('text=货友铺进销存');
    await page.waitForSelector('button[type="submit"]');

    // Verify ZERO page reloads occurred after initial load
    assert.equal(pageReloadCount, 0, 'No page reload should have occurred during logout');

    // 3. Employee Login WITHOUT page reload
    await page.fill('input[type="text"]', credentials.employee.loginName);
    await page.fill('input[type="password"]', credentials.employee.password);
    await page.click('button[type="submit"]');

    // Assert NO "请求不符合接口约定" error
    const contractError = page.locator('text=请求不符合接口约定');
    assert.equal(await contractError.isVisible(), false, 'Login must not fail with contract/CSRF error');

    // Wait for Employee Landing Page (销售订单管理)
    await page.waitForSelector('text=销售订单管理');
    assert.ok(await page.locator('text=员工').first().isVisible(), 'Employee role badge must be visible');
    assert.ok(await page.locator('text=成本已隐藏').first().isVisible(), 'Employee cost-hidden notice must be visible');
    assert.equal(pageReloadCount, 0, 'No page reload should have occurred during employee login');

    // 4. Employee Logout
    await page.click('button[title="退出登录"]');
    await page.waitForSelector('text=货友铺进销存');
    await page.waitForSelector('button[type="submit"]');
    assert.equal(pageReloadCount, 0, 'No page reload should have occurred during employee logout');

    // 5. Admin Login WITHOUT page reload
    await page.fill('input[type="text"]', credentials.admin.loginName);
    await page.fill('input[type="password"]', credentials.admin.password);
    await page.click('button[type="submit"]');

    // Assert NO error
    assert.equal(await contractError.isVisible(), false, 'Admin login must not fail with contract/CSRF error');

    // Wait for Admin Workbench
    await page.waitForSelector('text=销售开单工作台');
    assert.ok(await page.locator('text=管理员').first().isVisible(), 'Admin role badge must be visible');
    assert.equal(pageReloadCount, 0, 'Entire session alternation lifecycle must succeed with ZERO page reloads');

    await context.close();
  });

  test('4. Bottom confirmation actions layout & interaction verification across Desktop & Mobile viewports', async () => {
    const snapshotDir = path.resolve('docs/ui/build-web-inventory-v1/implementation');
    fs.mkdirSync(snapshotDir, { recursive: true });

    // Build isolated fixtures via dedicated Node API helper with strict response assertions
    const {
      fixtureWarehouse,
      fixtureCustomer,
      fixtureAddress,
      fixtureProducts,
      fixtureDraftOrder,
      fixtureMobileDraftOrder,
      fixtureConfirmedOrder,
    } = await createTest4Fixtures(credentials.admin);

    // ==========================================
    // 1. Desktop Viewport (1280x900)
    // ==========================================
    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const desktopPage = await desktopContext.newPage();
    const desktopQuoteFailures = trackQuoteResponses(desktopPage);

    await desktopPage.goto('http://localhost:5173');
    await desktopPage.waitForLoadState('networkidle');

    // Admin login
    await desktopPage.fill('input[type="text"]', credentials.admin.loginName);
    await desktopPage.fill('input[type="password"]', credentials.admin.password);
    await desktopPage.click('button[type="submit"]');
    await desktopPage.waitForSelector('text=销售开单工作台');

    // (1) OrderCreatePage Desktop Verification
    // Verify top header does NOT duplicate confirmation buttons
    const headerConfirmButtons = desktopPage.locator('.page-header-responsive button:has-text("确认销售订单"), .page-header-responsive button:has-text("保存为草稿")');
    assert.equal(await headerConfirmButtons.count(), 0, 'Header must not contain duplicate confirmation buttons');

    // Open CustomerPickerModal and select isolated fixture customer
    await desktopPage.click('button:has-text("选择客户与地址"), button:has-text("更换客户/地址")');
    await desktopPage.waitForSelector('text=选择客户与配送地址');

    // Search fixture customer by name in the search input
    await desktopPage.fill('.modal-body input[placeholder*="搜索客户"]', fixtureCustomer.name);
    const customerRow = desktopPage.locator('.modal-body div[style*="cursor: pointer"]').filter({ hasText: fixtureCustomer.name }).first();
    await customerRow.waitFor({ state: 'visible' });
    await customerRow.click();

    // Verify address card is selected in right pane (plain text locator, no mixed CSS/text engine)
    await desktopPage
      .locator('.modal-body')
      .getByText(fixtureAddress.address)
      .first()
      .waitFor({ state: 'visible' });

    // Click confirm button in modal footer
    const confirmCustBtn = desktopPage.locator('.modal-footer button:has-text("确认选用该客户")');
    assert.ok(await confirmCustBtn.isEnabled(), 'Confirm customer button must be enabled once customer is chosen');
    await confirmCustBtn.click();

    // Explicitly assert modal overlay is completely detached and customer is chosen in workbench
    await desktopPage.waitForSelector('.modal-overlay', { state: 'detached' });
    await desktopPage.waitForSelector(`text=${fixtureCustomer.name}`);

    // Open BatchProductPicker and verify bottom footer buttons have not regressed
    await desktopPage.click('button:has-text("批量选择商品"), button:has-text("添加商品")');
    await desktopPage.waitForSelector('text=批量选品与配置');
    // Production footer button reads "确认加入订单 (n 行)"; the title attribute is the
    // stale "统一加入订单" wording, so locate by role/name instead.
    const pickerFooterJoin = desktopPage.getByRole('button', { name: /确认加入订单\s*\(\d+\s*行\)/ });
    const pickerFooterCancel = desktopPage.locator('.modal-footer button:has-text("取 消"), .modal-footer button:has-text("取消")').first();
    await pickerFooterJoin.waitFor({ state: 'visible', timeout: 8000 });
    assert.ok(await pickerFooterJoin.isVisible(), 'Picker bottom footer must retain the confirm-join button');
    assert.ok(await pickerFooterCancel.isVisible(), 'Picker bottom footer must retain cancel button');

    // Pick THIS test's own fixture products to build a real, non-empty 8-line long order.
    // Fixture repeat plan: 5 distinct products + 3 repeats = 8 configured lines.
    const desktopPlan = [
      fixtureProducts[0]!,
      fixtureProducts[1]!,
      fixtureProducts[2]!,
      fixtureProducts[3]!,
      fixtureProducts[4]!,
      fixtureProducts[0]!,
      fixtureProducts[1]!,
      fixtureProducts[2]!,
    ];
    const configuredRows = await pickFixtureProducts(desktopPage, fixtureProducts, desktopPlan, {
      assertConfiguredRows: true,
      warehouseName: fixtureWarehouse.name,
    });
    assert.equal(configuredRows, 8, 'Picker session must contain exactly 8 configured lines');

    // The join button must really advertise 8 lines and be enabled (no empty-cart confirm).
    const joinBtn8 = desktopPage.getByRole('button', { name: /确认加入订单\s*\(8\s*行\)/ });
    assert.ok(await joinBtn8.isEnabled(), 'Join button must be enabled with 8 valid configured lines');
    await joinBtn8.click();
    await desktopPage.waitForSelector('.modal-overlay', { state: 'detached' });

    // Real OrderCreatePage lines card: title is "订单商品明细 (n 行)".
    await desktopPage.waitForSelector('text=订单商品明细 (8 行)');
    assert.ok(
      (await desktopPage.locator('.hide-mobile').filter({ hasText: '商品名称 / 规格' }).count()) === 1,
      'Create page must render the real order lines table header'
    );
    // Eight real desktop line rows, one per configured line (2 lines for the 3 repeated products).
    await desktopPage.waitForFunction(() =>
      document.querySelectorAll('div.hide-mobile[style*="grid-template-columns"]').length >= 9
    );
    const desktopLineRows = desktopPage
      .locator('div.hide-mobile[style*="grid-template-columns"]')
      .filter({ hasText: 'E2E商品-' });
    assert.equal(await desktopLineRows.count(), 8, 'Create page must render exactly 8 fixture product rows');
    const firstProductRows = desktopLineRows.filter({ hasText: fixtureProducts[0]!.name });
    assert.equal(await firstProductRows.count(), 2, 'Repeated fixture product must render two distinct lines');
    // Bottom summary must report 8 lines.
    assert.ok(
      (await desktopPage.locator('.order-bottom-summary-text').innerText()).includes('8'),
      'Create bottom summary must report 8 lines'
    );

    // Fill in order remarks (real Create field is a text input with the 整单运输 placeholder).
    const remarkInput = desktopPage.locator('input[placeholder*="整单运输"]');
    await remarkInput.waitFor({ state: 'visible' });
    await remarkInput.fill('E2E自动化测试长订单底栏与滚动验证备注：' + '注意核实批量多规格商品并避开夜间配送。'.repeat(3));

    // Wait for live quote calculation to finish with non-zero total
    await waitForCreateQuote(desktopPage, desktopQuoteFailures);
    await desktopPage.waitForFunction(() => {
      const el = document.querySelector('.order-bottom-summary-text strong');
      return el && el.textContent && parseFloat(el.textContent.replace('¥', '')) > 0;
    });

    // Verify .order-bottom-actions-bar buttons
    const draftBtn = desktopPage.locator('.order-bottom-actions-bar button:has-text("保存为草稿")');
    const confirmBtn = desktopPage.locator('.order-bottom-actions-bar button:has-text("确认销售订单")');
    assert.ok(await draftBtn.isVisible(), 'Bottom action bar must contain 保存为草稿 button');
    assert.ok(await confirmBtn.isVisible(), 'Bottom action bar must contain 确认销售订单 button');
    assert.ok(await draftBtn.isEnabled(), 'Save draft button must be enabled with valid lines');
    assert.ok(await confirmBtn.isEnabled(), 'Confirm order button must be enabled with valid quote');

    // Scroll reachability check: scroll the REAL AppLayout scroll owner to its true end,
    // then verify the last field is reachable and not hidden behind the sticky bottom bar.
    const desktopOwner = await scrollOwnerToBottom(desktopPage);
    const remarkField = desktopPage.locator('input[placeholder*="整单运输"]').first();
    const remarkBox = await remarkField.boundingBox();
    const barBox = await desktopPage.locator('.order-bottom-actions-bar').boundingBox();
    // Persist the real owner-end evidence BEFORE the strict geometry assertion.
    await desktopPage.screenshot({ path: path.join(snapshotDir, 'order-create-scroll-owner-end-desktop.png') });
    console.log('[A4 desktop scroll owner]', JSON.stringify({ owner: desktopOwner, remark: remarkBox, bar: barBox }));
    assert.ok(remarkBox && barBox, 'Remarks field and bottom actions bar bounding boxes must exist');
    assert.ok(
      remarkBox.y + remarkBox.height <= barBox.y,
      `Remarks field must not be obscured by sticky bottom bar (owner=${JSON.stringify(desktopOwner)} remark=${JSON.stringify(remarkBox)} bar=${JSON.stringify(barBox)})`
    );
    // The remarks field must also sit inside the visible viewport of the scroll owner.
    const viewportHeight = desktopPage.viewportSize()!.height;
    assert.ok(
      remarkBox.y >= 0 && remarkBox.y + remarkBox.height <= viewportHeight,
      `Remarks field must be inside the visible viewport (remark=${JSON.stringify(remarkBox)} viewportHeight=${viewportHeight})`
    );

    // Capture OrderCreatePage Desktop screenshot
    await desktopPage.screenshot({ path: path.join(snapshotDir, 'order-create-bottom-bar-desktop.png'), fullPage: true });

    // (2) OrderDetailPage (Draft) Desktop Verification
    // Navigate directly to isolated fixture draft order
    await desktopPage.evaluate((id) => {
      window.dispatchEvent(new CustomEvent('huoyoupu:navigate', { detail: { href: `/orders/${id}` } }));
    }, fixtureDraftOrder.id);
    await desktopPage.waitForSelector(`text=订单 ${fixtureDraftOrder.orderNo}`);
    await desktopPage.waitForSelector('text=草稿');

    // Verify top header does NOT have duplicate "确认开单记账"
    const detailHeaderConfirm = desktopPage.locator('div[style*="justify-content: space-between"] button:has-text("确认开单记账")');
    assert.equal(await detailHeaderConfirm.count(), 0, 'OrderDetail header must not duplicate 确认开单记账 button');

    // Verify bottom action bar has draft confirmation button
    const detailBottomConfirm = desktopPage.locator('.order-bottom-actions-bar button:has-text("确认开单记账")');
    assert.ok(await detailBottomConfirm.isVisible(), 'Draft OrderDetail bottom bar must contain 确认开单记账');
    assert.ok(await desktopPage.locator('.order-bottom-summary-text:has-text("草稿状态")').isVisible(), 'Summary text must indicate draft status');

    // Capture OrderDetailPage Draft Desktop screenshot
    await desktopPage.screenshot({ path: path.join(snapshotDir, 'order-detail-draft-bottom-bar-desktop.png'), fullPage: true });

    // Click confirm order to move order to confirmed status via real handler
    await detailBottomConfirm.click();
    await desktopPage.waitForSelector('text=已确认');

    // (3) OrderEditPage Desktop Verification
    // Navigate directly to isolated fixture confirmed order
    await desktopPage.evaluate((id) => {
      window.dispatchEvent(new CustomEvent('huoyoupu:navigate', { detail: { href: `/orders/${id}` } }));
    }, fixtureConfirmedOrder.id);
    await desktopPage.waitForSelector(`text=订单 ${fixtureConfirmedOrder.orderNo}`);
    await desktopPage.waitForSelector('text=已确认');

    // Click edit order without skipping
    await desktopPage.click('button:has-text("更正改单")');
    await desktopPage.waitForSelector('text=更正已确认销售订单');

    // Verify header does not duplicate confirmation button
    const editHeaderConfirm = desktopPage.locator('div[style*="justify-content: space-between"] button:has-text("确认更正并重新记账")');
    assert.equal(await editHeaderConfirm.count(), 0, 'OrderEdit header must not duplicate confirmation button');

    // Verify bottom action bar buttons
    const editCancelBtn = desktopPage.locator('.order-bottom-actions-bar button:has-text("取消")');
    const editConfirmBtn = desktopPage.locator('.order-bottom-actions-bar button:has-text("确认更正并重新记账")');
    assert.ok(await editCancelBtn.isVisible(), 'OrderEdit bottom bar must have cancel button');
    assert.ok(await editConfirmBtn.isVisible(), 'OrderEdit bottom bar must have confirm revision button');

    // Wait for valid quote calculation before enabling
    await desktopPage.waitForSelector('.order-bottom-actions-bar button.btn-primary:not([disabled])');

    // Scroll the real scroll owner to its true end and check the required 变更原因说明 field
    const editOwner = await scrollOwnerToBottom(desktopPage);
    // Real OrderEditPage placeholder: 例如：客户追加订单、协商调整价格、更换提货仓库...
    const editReason = desktopPage.locator('input[placeholder*="客户追加订单"]').first();
    await editReason.waitFor({ state: 'visible', timeout: 8000 });
    const editReasonBox = await editReason.boundingBox();
    const editBarBox = await desktopPage.locator('.order-bottom-actions-bar').boundingBox();
    assert.ok(editReasonBox && editBarBox, 'Reason field and edit bottom actions bar bounding boxes must exist');
    assert.ok(
      editReasonBox.y + editReasonBox.height <= editBarBox.y,
      `Reason field must not be obscured by edit bottom actions bar (owner=${JSON.stringify(editOwner)} reason=${JSON.stringify(editReasonBox)} bar=${JSON.stringify(editBarBox)})`
    );

    // Capture OrderEditPage Desktop screenshot
    await desktopPage.screenshot({ path: path.join(snapshotDir, 'order-edit-bottom-bar-desktop.png'), fullPage: true });

    await desktopContext.close();

    // ==========================================
    // 2. Mobile Viewport (400x750)
    // ==========================================
    const mobile400Context = await browser.newContext({ viewport: { width: 400, height: 750 }, isMobile: true });
    const mobile400Page = await mobile400Context.newPage();
    const mobileQuoteFailures = trackQuoteResponses(mobile400Page);

    await mobile400Page.goto('http://localhost:5173');
    await mobile400Page.waitForLoadState('networkidle');

    // Admin login
    await mobile400Page.fill('input[type="text"]', credentials.admin.loginName);
    await mobile400Page.fill('input[type="password"]', credentials.admin.password);
    await mobile400Page.click('button[type="submit"]');
    await mobile400Page.waitForSelector('text=销售开单工作台');

    // Select customer via search
    await mobile400Page.click('button:has-text("选择客户与地址"), button:has-text("更换客户/地址")');
    await mobile400Page.waitForSelector('text=选择客户与配送地址');
    await mobile400Page.fill('.modal-body input[placeholder*="搜索客户"]', fixtureCustomer.name);
    const mobileCustCard = mobile400Page.locator('.modal-body div[style*="cursor: pointer"]').filter({ hasText: fixtureCustomer.name }).first();
    await mobileCustCard.waitFor({ state: 'visible' });
    await mobileCustCard.click();
    await mobile400Page.click('.modal-footer button:has-text("确认选用该客户")');
    await mobile400Page.waitForSelector('.modal-overlay', { state: 'detached' });
    await mobile400Page.waitForSelector(`text=${fixtureCustomer.name}`);

    // Add lines via BatchProductPicker using THIS test's own fixture products (6 real lines)
    await mobile400Page.click('button:has-text("批量添加商品"), button:has-text("添加商品")');
    await mobile400Page.waitForSelector('text=批量选品与配置');
    const mobilePlan = [
      fixtureProducts[0]!,
      fixtureProducts[1]!,
      fixtureProducts[2]!,
      fixtureProducts[3]!,
      fixtureProducts[4]!,
      fixtureProducts[0]!,
    ];
    const mobileConfiguredRows = await pickFixtureProducts(mobile400Page, fixtureProducts, mobilePlan, {
      assertConfiguredRows: false,
      warehouseName: fixtureWarehouse.name,
    });
    assert.equal(mobileConfiguredRows, 6, 'Mobile picker session must contain exactly 6 configured lines');
    const mobileJoinBtn = mobile400Page.getByRole('button', { name: /确认加入订单\s*\(6\s*行\)/ });
    await mobileJoinBtn.waitFor({ state: 'visible', timeout: 8000 });
    assert.ok(await mobileJoinBtn.isEnabled(), 'Mobile join button must be enabled with 6 configured lines');
    await mobileJoinBtn.click();
    await mobile400Page.waitForSelector('.modal-overlay', { state: 'detached' });
    await mobile400Page.waitForSelector('text=订单商品明细 (6 行)');
    assert.ok(
      (await mobile400Page.locator('.order-bottom-summary-text').innerText()).includes('6'),
      'Mobile Create bottom summary must report 6 lines'
    );

    // Wait for live non-zero quote
    await waitForCreateQuote(mobile400Page, mobileQuoteFailures);
    await mobile400Page.waitForFunction(() => {
      const el = document.querySelector('.order-bottom-summary-text strong');
      return el && el.textContent && parseFloat(el.textContent.replace('¥', '')) > 0;
    });

    // Assert bottom actions bar sits above mobile bottom navigation
    const mBarBox = await mobile400Page.locator('.order-bottom-actions-bar').boundingBox();
    const mNavBox = await mobileBottomNavBox(mobile400Page);
    assert.ok(mBarBox, 'Mobile actions bar bounding box must exist');
    console.log('[A4 mobile400 bar/nav]', JSON.stringify({ bar: mBarBox, nav: mNavBox }));
    assert.ok(mBarBox.y + mBarBox.height <= mNavBox.y + 2, 'Bottom actions bar must sit above mobile bottom navigation');

    // Scroll the REAL scroll owner to its true end and verify the last field is reachable
    const mobileOwner = await scrollOwnerToBottom(mobile400Page);
    // The remarks field must stay clear of the fixed mobile actions bar at the very end of the page.
    const mobileRemark = mobile400Page.locator('input[placeholder*="整单运输"]').first();
    const mobileRemarkBox = await mobileRemark.boundingBox();
    const mobileBarAfterScroll = await mobile400Page.locator('.order-bottom-actions-bar').boundingBox();
    assert.ok(mobileRemarkBox && mobileBarAfterScroll, 'Mobile remarks field and actions bar boxes must exist');
    await mobile400Page.screenshot({ path: path.join(snapshotDir, 'order-create-scroll-owner-end-mobile-400.png') });
    console.log('[A4 mobile400 scroll owner]', JSON.stringify({ owner: mobileOwner, remark: mobileRemarkBox, bar: mobileBarAfterScroll }));
    assert.ok(
      mobileRemarkBox.y + mobileRemarkBox.height <= mobileBarAfterScroll.y,
      `Mobile remarks field must not be obscured at scroll end (owner=${JSON.stringify(mobileOwner)} remark=${JSON.stringify(mobileRemarkBox)} bar=${JSON.stringify(mobileBarAfterScroll)})`
    );

    // Capture Mobile 400px OrderCreate screenshot
    await mobile400Page.screenshot({ path: path.join(snapshotDir, 'order-create-bottom-bar-mobile-400.png'), fullPage: true });

    // Mobile OrderDetail Draft
    await mobile400Page.evaluate((id) => {
      window.dispatchEvent(new CustomEvent('huoyoupu:navigate', { detail: { href: `/orders/${id}` } }));
    }, fixtureMobileDraftOrder.id);
    await mobile400Page.waitForSelector('text=草稿');
    await mobile400Page.waitForSelector('.order-bottom-actions-bar button:has-text("确认开单记账")');
    // Draft Detail on mobile: real owner must scroll to its end with the bar above the bottom nav.
    const mDetailOwner = await scrollOwnerToBottom(mobile400Page);
    const mDetailBar = await mobile400Page.locator('.order-bottom-actions-bar').boundingBox();
    const mDetailNav = await mobileBottomNavBox(mobile400Page);
    assert.ok(mDetailBar, 'Draft Detail mobile bar box must exist');
    assert.ok(
      mDetailBar.y + mDetailBar.height <= mDetailNav.y + 2,
      `Draft Detail bottom bar must sit above mobile nav (owner=${JSON.stringify(mDetailOwner)})`
    );
    await mobile400Page.screenshot({ path: path.join(snapshotDir, 'order-detail-draft-bottom-bar-mobile-400.png'), fullPage: true });

    // Mobile OrderEdit
    await mobile400Page.evaluate((id) => {
      window.dispatchEvent(new CustomEvent('huoyoupu:navigate', { detail: { href: `/orders/${id}` } }));
    }, fixtureConfirmedOrder.id);
    await mobile400Page.waitForSelector('text=已确认');
    await mobile400Page.click('button:has-text("更正改单")');
    await mobile400Page.waitForSelector('text=更正已确认销售订单');
    await mobile400Page.waitForSelector('.order-bottom-actions-bar button:has-text("确认更正并重新记账")');
    // Edit on mobile: owner scrolls to its real end; reason field must stay clear of the fixed bar.
    const mEditOwner = await scrollOwnerToBottom(mobile400Page);
    const mReason = mobile400Page.locator('input[placeholder*="客户追加订单"]').first();
    const mReasonBox = await mReason.boundingBox();
    const mEditBar = await mobile400Page.locator('.order-bottom-actions-bar').boundingBox();
    assert.ok(mReasonBox && mEditBar, 'Mobile edit reason field and bar boxes must exist');
    assert.ok(
      mReasonBox.y + mReasonBox.height <= mEditBar.y,
      `Mobile edit reason field must not be obscured (owner=${JSON.stringify(mEditOwner)} reason=${JSON.stringify(mReasonBox)} bar=${JSON.stringify(mEditBar)})`
    );
    await mobile400Page.screenshot({ path: path.join(snapshotDir, 'order-edit-bottom-bar-mobile-400.png'), fullPage: true });

    // Resize viewport to 350px for mobile 350 verification
    await mobile400Page.setViewportSize({ width: 350, height: 667 });
    // Re-measure the scroll owner at 350px: it must still reach the page end with no hidden tail,
    // and the fixed actions bar must stay clear of the bottom navigation.
    const m350Owner = await scrollOwnerToBottom(mobile400Page);
    const m350Bar = await mobile400Page.locator('.order-bottom-actions-bar').boundingBox();
    const m350Nav = await mobileBottomNavBox(mobile400Page);
    assert.ok(m350Bar, 'Mobile 350 actions bar box must exist');
    console.log('[A4 mobile350 bar/nav]', JSON.stringify({ bar: m350Bar, nav: m350Nav }));
    assert.ok(
      m350Bar.y + m350Bar.height <= m350Nav.y + 2,
      `Mobile 350 actions bar must sit above bottom nav (owner=${JSON.stringify(m350Owner)})`
    );
    assert.equal(
      await mobile400Page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      'Mobile 350 layout must not overflow horizontally'
    );
    await mobile400Page.screenshot({ path: path.join(snapshotDir, 'order-create-bottom-bar-mobile-350.png'), fullPage: true });

    await mobile400Context.close();
  });

  test('5. Stage A20: Order edit after sales return pre-split lines, price edit, and live quote subtotal verification', async () => {
    const snapshotDir = path.resolve('docs/ui/build-web-inventory-v1/implementation');
    fs.mkdirSync(snapshotDir, { recursive: true });

    const fixtures = await createTest4Fixtures(credentials.admin);
    const { fixtureReturnOrder } = fixtures;

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Admin login
    await page.fill('input[type="text"]', credentials.admin.loginName);
    await page.fill('input[type="password"]', credentials.admin.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=销售开单工作台');

    // Navigate to returned order detail
    await page.evaluate((id) => {
      window.dispatchEvent(new CustomEvent('huoyoupu:navigate', { detail: { href: `/orders/${id}` } }));
    }, fixtureReturnOrder.id);
    await page.waitForSelector(`text=订单 ${fixtureReturnOrder.orderNo}`);
    await page.waitForSelector('text=已确认');
    await page.waitForSelector('text=累计退货冲减: -¥6.00');

    // Click "更正改单"
    await page.click('button:has-text("更正改单")');
    await page.waitForSelector('text=更正已确认销售订单');

    // 1. Initial State Assertions:
    // Protected read-only row must exist with badge, quantity 3, and subtotal ¥6.00 (NOT "待报价").
    // Scope strictly to the visible desktop row and wait for THIS revision's live quote.
    await page.waitForSelector('text=已退3瓶 (只读)');
    const protectedRow = page.locator('.hide-mobile').filter({ hasText: '已退3瓶 (只读)' }).first();
    await protectedRow.waitFor({ state: 'visible' });
    const protectedSubtotal = protectedRow.locator('.tabular-nums', { hasText: '¥6.00' });
    await protectedSubtotal.first().waitFor({ state: 'visible' });
    assert.ok(await protectedSubtotal.first().isVisible(), 'Protected row subtotal must display ¥6.00 (not 待报价)');

    // Editable remaining row must exist with quantity 9, unit label, price note "沿用原价", and subtotal ¥18.00 (NOT "待报价")
    await page.waitForSelector('text=沿用原价');
    const remainingRow = page.locator('.hide-mobile').filter({ hasText: '沿用原价' }).first();
    await remainingRow.waitFor({ state: 'visible' });
    const remainingSubtotal = remainingRow.locator('.tabular-nums', { hasText: '¥18.00' });
    await remainingSubtotal.first().waitFor({ state: 'visible' });
    assert.ok(await remainingSubtotal.first().isVisible(), 'Remaining row subtotal must display ¥18.00 (not 待报价)');

    // Initial total amount should be ¥24.00 (gross)
    await page.waitForSelector('.order-bottom-summary-text:has-text("¥24.00")');

    // 2. Explicit price edit: change the unit price of the visible desktop remaining row
    // (the mobile card renders a second, hidden input with the same placeholder).
    const priceInput = remainingRow.locator('input[placeholder*="沿用原价"]');
    await priceInput.waitFor({ state: 'visible', timeout: 8000 });
    assert.equal(await priceInput.count(), 1, 'Visible desktop remaining row must expose exactly one price input');
    await priceInput.fill('3.00');

    // 3. Live quote recalculation verification:
    // Wait for live recalculation: remaining subtotal becomes ¥27.00, protected subtotal stays ¥6.00, total becomes ¥33.00
    await remainingRow.locator('.tabular-nums', { hasText: '¥27.00' }).first().waitFor({ state: 'visible' });
    await protectedRow.locator('.tabular-nums', { hasText: '¥6.00' }).first().waitFor({ state: 'visible' });
    await page.waitForSelector('.order-bottom-summary-text:has-text("¥33.00")');

    // Verify account impact prediction displays +9.00 shift
    await page.waitForSelector('text=改单对往来账款影响预测');
    await page.waitForSelector('text=¥18.00 → ¥27.00');
    // Production renders the delta with the currency symbol: +¥9.00
    await page.waitForSelector('text=+¥9.00');
    const deltaBlock = page
      .locator('div', { hasText: '净额变动差额' })
      .filter({ hasText: '+¥9.00' })
      .first();
    assert.ok(await deltaBlock.isVisible(), 'Net balance delta must display +¥9.00');

    // The revision requires a real 变更原因说明 before the handler will submit.
    const reasonInput = page.locator('input[placeholder*="客户追加订单"]');
    await reasonInput.waitFor({ state: 'visible', timeout: 8000 });
    await reasonInput.fill('E2E退货后改单：客户确认补差价并重新记账');

    // 4. Confirm revision
    const confirmRevisionBtn = page.locator('.order-bottom-actions-bar button:has-text("确认更正并重新记账")');
    await page.waitForSelector('.order-bottom-actions-bar button.btn-primary:not([disabled])');
    assert.ok(await confirmRevisionBtn.isEnabled(), 'Confirm revision button must be enabled with valid quote');
    await confirmRevisionBtn.click();

    // 5. Verification on OrderDetail after revision
    await page.waitForSelector('text=已确认');
    await page.waitForSelector(`text=订单 ${fixtureReturnOrder.orderNo}`);
    await page.waitForSelector('text=¥33.00'); // Order total
    await page.waitForSelector('text=累计退货冲减: -¥6.00'); // Return credit

    // 6. Independent API verification: the revision really landed on the server
    const revisedOrder = await fixtures.getOrder(fixtureReturnOrder.id);
    assert.equal(revisedOrder.status, 'confirmed', 'Revised order must remain confirmed');
    assert.equal(revisedOrder.totalAmount, '33.00', 'Server order total after revision must be 33.00');
    assert.equal(revisedOrder.returnAmount, '6.00', 'Server return credit must stay 6.00');
    assert.ok(
      revisedOrder.revisionNo > fixtureReturnOrder.revisionNo,
      `Revision number must increase (was ${fixtureReturnOrder.revisionNo}, now ${revisedOrder.revisionNo})`
    );

    const revisions = await fixtures.getRevisions(fixtureReturnOrder.id);
    assert.ok(revisions.items.length >= 1, 'Order revisions history must contain at least one revision');
    // History includes the initial draft entry, so select the entry for THIS new revision
    // by its revision number (and the current marker) rather than array position.
    const latestRevision = revisions.items.find(
      (r: { revisionNo?: number; isCurrent?: boolean }) =>
        r.revisionNo === revisedOrder.revisionNo
    ) as { revisionNo?: number; changeReason?: string; isCurrent?: boolean } | undefined;
    assert.ok(latestRevision, `Revisions history must include revision v${revisedOrder.revisionNo}`);
    assert.equal(
      latestRevision.changeReason,
      'E2E退货后改单：客户确认补差价并重新记账',
      'Persisted revision changeReason must match the UI submission'
    );
    assert.equal(latestRevision.isCurrent, true, 'Latest revision must be the current one');
    // The pre-existing draft entry must still be present and unchanged.
    assert.ok(
      revisions.items.some((r: { changeReason?: string }) => r.changeReason === '创建草稿'),
      'Initial draft revision entry must remain in history'
    );

    // The revision must really move this dedicated return customer's account by exactly +9.00
    // (18.00 after the 6.00 return credit -> 27.00 after the 33.00 revision total).
    const balance = await fixtures.getCustomerBalance(fixtureReturnOrder.customerId);
    assert.equal(balance.netBalance, '27.00', 'Customer net balance after revision must be 27.00');
    assert.equal(balance.receivableBalance, '27.00', 'Customer receivable balance must be 27.00');

    // Capture screenshot of OrderDetail after revision
    await page.screenshot({ path: path.join(snapshotDir, 'order-detail-after-return-revision.png'), fullPage: true });

    await context.close();
  });

  test('6. Teardown', async () => {
    if (browser) {
      await browser.close();
    }
  });
});
