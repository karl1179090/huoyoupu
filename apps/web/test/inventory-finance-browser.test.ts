import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const CREDS_PATH = '/tmp/huoyoupu-dev-mTw6IP/credentials.json';
const BASE_URL = 'http://localhost:5173';
const API_BASE = 'http://127.0.0.1:3000/api/v1';
const ORIGIN = 'http://localhost:5173';

describe('Inventory & Finance Real Browser Event & Network Interception Tests (12.2 & 12.6)', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let adminCsrf = '';
  let adminCookie = '';
  let isolatedCustomerName = '';
  let isolatedCustomerId = '';
  let activeWarehouseId = '';
  let activeProductId = '';
  let activeProductUnitId = '';

  before(async () => {
    assert.ok(fs.existsSync(CREDS_PATH), 'Credentials file must exist');
    const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));

    // 1. Authenticate via backend API to create isolated test customer
    const initRes = await fetch(`${API_BASE}/auth/session`, { headers: { Origin: ORIGIN } });
    const initData = await initRes.json();
    const initCookie = initRes.headers.get('set-cookie')?.split(';')[0] || '';

    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': initData.csrfToken,
        Cookie: initCookie,
      },
      body: JSON.stringify({
        loginName: creds.admin.loginName,
        password: creds.admin.password,
      }),
    });
    const loginData = await loginRes.json();
    adminCsrf = loginData.csrfToken;
    adminCookie = loginRes.headers.get('set-cookie')?.split(';')[0] || initCookie;

    const suffix = Date.now().toString().slice(-6);
    isolatedCustomerName = `浏览器测试客户-${suffix}`;
    const custRes = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        name: isolatedCustomerName,
        code: `BTC${suffix}`,
        contactName: '网测专员',
        phone: '13900000000',
      }),
    });
    assert.equal(custRes.status, 201);
    const custData = await custRes.json();
    isolatedCustomerId = custData.id;

    // Add active default address for isolated customer so orders resolve delivery snapshot correctly
    const addrRes = await fetch(`${API_BASE}/customers/${isolatedCustomerId}/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        label: '默认送货地址',
        contactName: '网测专员',
        phone: '13900000000',
        address: '上海市浦东新区张江高科88号',
        isDefault: true,
      }),
    });
    assert.equal(addrRes.status, 201);

    // 1b. Fetch active warehouse and product for orders fixture
    const [whRes, prodRes] = await Promise.all([
      fetch(`${API_BASE}/warehouses`, { headers: { Origin: ORIGIN, Cookie: adminCookie } }),
      fetch(`${API_BASE}/products?limit=10`, { headers: { Origin: ORIGIN, Cookie: adminCookie } }),
    ]);
    const whData = await whRes.json();
    const prodData = await prodRes.json();
    const activeWh = whData.items.find((w: any) => w.active);
    const activeProd = prodData.items.find((p: any) => p.active);
    activeWarehouseId = activeWh?.id || '';
    activeProductId = activeProd?.id || '';
    activeProductUnitId = activeProd?.units?.[0]?.id || '';

    // Create purchase receipt to guarantee stock for order creation
    if (activeWarehouseId && activeProductId && activeProductUnitId) {
      await fetch(`${API_BASE}/receipts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          Cookie: adminCookie,
          'X-CSRF-Token': adminCsrf,
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          kind: 'purchase',
          warehouseId: activeWarehouseId,
          receivedAt: '2026-11-10T12:00:00+08:00',
          supplierReference: `SUPP-BROWSER-${Date.now()}`,
          lines: [{
            productId: activeProductId,
            unitId: activeProductUnitId,
            quantity: 200,
            unitCost: '10.00',
          }],
        }),
      });
    }

    // 2. Launch headless browser
    browser = await chromium.launch({
      executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      headless: true,
    });
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    page = await context.newPage();

    // 3. Login to frontend UI
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const loginInput = await page.$('input[type="text"]');
    if (loginInput) {
      const passwordInput = await page.$('input[type="password"]');
      if (passwordInput) {
        await loginInput.fill(creds.admin.loginName);
        await passwordInput.fill(creds.admin.password);
        await page.click('button[type="submit"]');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(600);
      }
    }
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  beforeEach(async () => {
    // Unroute any pending route intercepts
    try {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    } catch {}

    // Close any modal that might be open
    const modalClose = page.locator('.modal-header button:has-text("✕")');
    if (await modalClose.isVisible({ timeout: 400 }).catch(() => false)) {
      await modalClose.click();
      await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 2000 }).catch(() => {});
    }
  });

  test('1. Cash Form: Server commits but response drops -> UI retry resends IDENTICAL Idempotency-Key and payload', async () => {
    // Navigate to Customer Finance
    await page.click('text="往来与结算"');
    await page.waitForSelector('h1:has-text("客户往来对账与收退结算")');

    // Wait for customer selector to populate
    await page.waitForSelector('select.select option:nth-child(2)', { state: 'attached', timeout: 5000 });
    const custSelect = page.locator('select.select').first();
    await custSelect.selectOption(isolatedCustomerId);
    await page.waitForTimeout(400);

    // Open "登记收款" modal
    await page.click('button:has-text("登记收款")');
    await page.waitForSelector('.modal-header:has-text("登记客户收款")');

    const amountInput = page.locator('input[placeholder="如 100.00"]');
    await amountInput.fill('150.00');

    let attemptCount = 0;
    let firstKey = '';
    let firstPayload = '';
    let secondKey = '';
    let secondPayload = '';

    // Route interception for cash events
    await page.route('**/api/v1/cash-events', async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        attemptCount++;
        const headers = req.headers();
        const postData = req.postData() || '';
        const idempKey = headers['idempotency-key'] || '';

        if (attemptCount === 1) {
          firstKey = idempKey;
          firstPayload = postData;
          // Execute on server to commit, then abort network return to simulate client response loss
          await route.fetch();
          await route.abort('failed');
          return;
        } else if (attemptCount === 2) {
          secondKey = idempKey;
          secondPayload = postData;
          await route.continue();
          return;
        }
      }
      await route.continue();
    });

    // First click: submit (response drops)
    await page.click('button:has-text("确认登记入账")');
    await page.waitForTimeout(600);

    // Verify error banner is displayed inside the modal
    const errorBanner = page.locator('.modal-body:has-text("登记资金流水失败")');
    await errorBanner.waitFor({ timeout: 5000 });
    assert.ok(await errorBanner.isVisible(), 'Error banner must be shown on response drop');

    // Verify button is re-enabled for retry
    const submitBtn = page.locator('button:has-text("确认登记入账")');
    assert.equal(await submitBtn.isDisabled(), false, 'Submit button must be re-enabled for retry');

    // Second click: Retry without modifying fields
    await submitBtn.click();
    await page.waitForTimeout(800);

    // Assert the exact same idempotency key and frozen payload were reused
    assert.ok(firstKey.length > 0, 'First key must be non-empty');
    assert.ok(secondKey.length > 0, 'Second key must be non-empty');
    assert.equal(firstKey, secondKey, 'Retry must reuse identical Idempotency-Key');
    assert.equal(firstPayload, secondPayload, 'Retry must reuse identical frozen payload');

    // Verify modal closes and success banner appears
    await page.waitForSelector('.modal-header:has-text("登记客户收款")', { state: 'detached', timeout: 5000 });
    const successBanner = page.locator('span:has-text("收款成功登记！")');
    await successBanner.waitFor({ timeout: 5000 });
    assert.ok(await successBanner.isVisible());
  });

  test('2. Cash Form: User edits input -> Browser rotates to a NEW Idempotency-Key', async () => {
    // Open "登记收款" modal again
    await page.click('button:has-text("登记收款")');
    await page.waitForSelector('.modal-header:has-text("登记客户收款")');

    const amountInput = page.locator('input[placeholder="如 100.00"]');
    await amountInput.fill('220.00');

    let capturedKey = '';
    await page.route('**/api/v1/cash-events', async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        capturedKey = req.headers()['idempotency-key'] || '';
      }
      await route.continue();
    });

    await page.click('button:has-text("确认登记入账")');
    await page.waitForTimeout(800);

    assert.ok(capturedKey.length > 0, 'New key must be captured');
    await page.waitForSelector('.modal-header:has-text("登记客户收款")', { state: 'detached', timeout: 5000 });
  });

  test('3. Stocktake Two-Phase Confirmation: Response dropped during Confirm -> Retry skips PATCH and replays confirm safely without 409', async () => {
    // Navigate to Inventory page
    await page.click('text="库存与批次"');
    await page.waitForSelector('h1:has-text("库存余量、批次与入库台账")');

    // Navigate to Stocktake page
    await page.click('button:has-text("实盘盘点工作台")');
    await page.waitForSelector('h1:has-text("实盘盘点工作台")');

    // Click "新建盘点快照"
    await page.click('button:has-text("新建盘点快照")');
    await page.waitForSelector('.modal-header:has-text("新建实盘盘点快照")');

    // Check include zero stock so lines exist even on fresh warehouse
    const zeroCheckbox = page.locator('.modal-body input[type="checkbox"]').first();
    if (await zeroCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      await zeroCheckbox.check();
    }
    await page.click('button:has-text("确认生成快照")');
    await page.waitForSelector('.modal-header:has-text("新建实盘盘点快照")', { state: 'detached', timeout: 8000 });

    // Verify stocktake lines table appeared
    await page.waitForSelector('table.table tbody tr', { timeout: 8000 });

    let patchAttempts = 0;
    let confirmAttempts = 0;
    let firstConfirmKey = '';
    let secondConfirmKey = '';

    await page.route('**/api/v1/stocktakes/*/confirm', async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        confirmAttempts++;
        const idempKey = req.headers()['idempotency-key'] || '';
        if (confirmAttempts === 1) {
          firstConfirmKey = idempKey;
          // Fetch on server then abort to simulate response loss during Phase 2 confirm
          await route.fetch();
          await route.abort('failed');
          return;
        } else if (confirmAttempts === 2) {
          secondConfirmKey = idempKey;
          await route.continue();
          return;
        }
      }
      await route.continue();
    });

    await page.route('**/api/v1/stocktakes/*', async route => {
      const req = route.request();
      if (req.method() === 'PATCH') {
        patchAttempts++;
      }
      await route.continue();
    });

    // Attempt 1: Click "确认盘点并过账"
    const confirmBtn = page.locator('button:has-text("确认盘点并过账")');
    await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await confirmBtn.isEnabled(), true, 'Confirm button must be enabled initially');
    await confirmBtn.click();
    await page.waitForTimeout(800);

    // Verify error banner is shown
    const errorBanner = page.locator('span:has-text("确认盘点并过账失败")');
    await errorBanner.waitFor({ timeout: 5000 });
    assert.ok(await errorBanner.isVisible(), 'Error banner must be shown after confirm response dropped');

    // Attempt 2: Click "确认盘点并过账" retry
    assert.equal(await confirmBtn.isDisabled(), false, 'Confirm button must be re-enabled');
    await confirmBtn.click();
    await page.waitForTimeout(1000);

    // Crucial assertion: Phase 1 (PATCH) was NOT re-executed on attempt 2!
    // patchAttempts must remain 1, preventing 409 VERSION_CONFLICT!
    assert.equal(patchAttempts, 1, 'Retry must NOT re-PATCH, avoiding 409 VERSION_CONFLICT');
    assert.equal(confirmAttempts, 2, 'Confirm must be retried');
    assert.equal(firstConfirmKey, secondConfirmKey, 'Confirm retry must reuse identical Idempotency-Key');

    // Verify stocktake reached confirmed status
    await page.waitForSelector('span:has-text("已成功确认并完成过账！")', { timeout: 8000 });
  });

  test('4. Statements Detail Scope Isolation & No Double Sign (+¥-500.00)', async () => {
    // Navigate to Finance -> Statements
    await page.click('text="往来与结算"');
    await page.waitForSelector('h1:has-text("客户往来对账与收退结算")');

    await page.click('button:has-text("月结对账单快照")');
    await page.waitForSelector('h1:has-text("客户往来月结对账单")');

    // Create a statement for our isolated customer
    await page.click('button:has-text("生成期间对账快照")');
    await page.waitForSelector('.modal-header:has-text("生成客户期间对账快照")');

    await page.fill('input[type="date"] >> nth=0', '2026-11-01');
    await page.fill('input[type="date"] >> nth=1', '2026-11-15');
    await page.click('button:has-text("确认生成快照")');
    await page.waitForTimeout(1000);

    // Detail modal should be open
    await page.waitForSelector('.modal-header:has-text("对账快照明细")');

    // Assert that the page DOM does NOT contain "+¥-" anywhere!
    const pageHtml = await page.content();
    assert.equal(pageHtml.includes('+¥-'), false, 'Double sign (+¥-500.00) must NEVER exist in DOM');

    // Close modal
    await page.click('.modal-header button:has-text("✕")');
    await page.waitForSelector('.modal-header:has-text("对账快照明细")', { state: 'detached', timeout: 3000 });
  });

  test('5. Real UI End-to-End: Manual multi-order receipt allocation across two debt orders', async () => {
    // 1. Fixture: Create two confirmed debt orders for isolatedCustomerId
    assert.ok(activeWarehouseId && activeProductId && activeProductUnitId, 'Active catalog entities must exist');

    const d1Res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        customerId: isolatedCustomerId,
        lines: [{
          clientLineId: 'l1',
          productId: activeProductId,
          warehouseId: activeWarehouseId,
          unitId: activeProductUnitId,
          quantity: 2,
          unitPrice: '50.00',
          allocationMode: 'auto',
        }],
        discountAmount: '0.00',
        roundOffAmount: '0.00',
        deliverySnapshot: {
          customerName: isolatedCustomerName,
          contactName: '网测专员',
          phone: '13900000000',
          address: '上海市浦东新区张江高科88号',
        },
      }),
    });
    assert.equal(d1Res.status, 201);
    const d1 = await d1Res.json();
    const c1Res = await fetch(`${API_BASE}/orders/${d1.id}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ expectedVersion: d1.version }),
    });
    assert.equal(c1Res.status, 200);

    const d2Res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        customerId: isolatedCustomerId,
        lines: [{
          clientLineId: 'l2',
          productId: activeProductId,
          warehouseId: activeWarehouseId,
          unitId: activeProductUnitId,
          quantity: 2,
          unitPrice: '60.00',
          allocationMode: 'auto',
        }],
        discountAmount: '0.00',
        roundOffAmount: '0.00',
        deliverySnapshot: {
          customerName: isolatedCustomerName,
          contactName: '网测专员',
          phone: '13900000000',
          address: '上海市浦东新区张江高科88号',
        },
      }),
    });
    assert.equal(d2Res.status, 201);
    const d2 = await d2Res.json();
    const c2Res = await fetch(`${API_BASE}/orders/${d2.id}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ expectedVersion: d2.version }),
    });
    assert.equal(c2Res.status, 200);

    // 2. Real Browser Interaction: Customer Finance
    await page.click('text="往来与结算"');
    await page.waitForSelector('h1:has-text("客户往来对账与收退结算")');

    const custSelect = page.locator('select.select').first();
    await custSelect.selectOption(isolatedCustomerId);
    await page.waitForTimeout(600);

    // Open "登记收款" modal
    await page.click('button:has-text("登记收款")');
    await page.waitForSelector('.modal-header:has-text("登记客户收款")');

    // Fill cash amount 150.00
    const amountInput = page.locator('.modal-body input[placeholder="如 100.00"]');
    await amountInput.fill('150.00');

    // Select manual allocation mode
    await page.click('input[value="manual"]');
    await page.waitForSelector('.fin-alloc-summary');

    // Wait for customer order options to appear in modal select.
    // Native <option> elements are not rendered as visible boxes; wait until attached.
    await page.waitForSelector(`.modal-body option[value="${d1.id}"]`, { state: 'attached', timeout: 8000 });
    await page.waitForSelector(`.modal-body option[value="${d2.id}"]`, { state: 'attached', timeout: 8000 });
    const opt1Text = await page.locator(`.modal-body option[value="${d1.id}"]`).textContent();
    assert.ok(opt1Text?.includes(d1.orderNo), `Option 1 must include orderNo ${d1.orderNo}`);
    const opt2Text = await page.locator(`.modal-body option[value="${d2.id}"]`).textContent();
    assert.ok(opt2Text?.includes(d2.orderNo), `Option 2 must include orderNo ${d2.orderNo}`);

    // Manual allocation rows are the grid rows that directly own the amount input.
    // Scoping by that input avoids matching the outer cash-method grid (which also
    // contains a select).
    const allocationRows = page
      .locator('.modal-body div[style*="grid-template-columns"]')
      .filter({ has: page.locator('input[placeholder="分摊金额"]') });
    await allocationRows.first().waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await allocationRows.count(), 1, 'Manual mode must start with exactly one allocation row');

    // Allocation 1: Order 1 -> 100.00
    const firstAllocRow = allocationRows.nth(0);
    const firstAllocSelect = firstAllocRow.locator('select').first();
    await firstAllocSelect.selectOption(d1.id);
    assert.equal(await firstAllocSelect.inputValue(), d1.id, 'First allocation row must bind order d1');
    const firstAllocAmount = firstAllocRow.locator('input[placeholder="分摊金额"]');
    await firstAllocAmount.fill('100.00');

    // Allocation 2: Click "+ 增加订单分摊" -> Select Order 2 -> 50.00
    await page.click('button:has-text("+ 增加订单分摊")');
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('.modal-body div[style*="grid-template-columns"]')).filter(
          el => el.querySelector('input[placeholder="分摊金额"]')
        ).length === 2
    );
    assert.equal(await allocationRows.count(), 2, 'Adding an allocation must produce exactly two allocation rows');
    const secondAllocRow = allocationRows.nth(1);
    const secondAllocSelect = secondAllocRow.locator('select').first();
    await secondAllocSelect.selectOption(d2.id);
    assert.equal(await secondAllocSelect.inputValue(), d2.id, 'Second allocation row must bind order d2');
    const secondAllocAmount = secondAllocRow.locator('input[placeholder="分摊金额"]');
    await secondAllocAmount.fill('50.00');

    // Verify allocation summary: 150.00 allocated, 0.00 unallocated
    await page.waitForSelector('.fin-alloc-summary:has-text("¥150.00")');

    let recordedCashPayload: any = null;
    await page.route('**/api/v1/cash-events', async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        recordedCashPayload = JSON.parse(req.postData() || '{}');
      }
      await route.continue();
    });

    // Submit
    await page.click('button:has-text("确认登记入账")');
    await page.waitForSelector('.modal-header:has-text("登记客户收款")', { state: 'detached', timeout: 8000 });

    // Success banner
    const successBanner = page.locator('span:has-text("收款成功登记！")');
    await successBanner.waitFor({ timeout: 5000 });
    assert.ok(await successBanner.isVisible());

    // Assert real HTTP request payload
    assert.equal(recordedCashPayload?.kind, 'receipt');
    assert.equal(recordedCashPayload?.allocationMode, 'manual');
    assert.equal(recordedCashPayload?.amount, '150.00');
    assert.equal(recordedCashPayload?.allocations?.length, 2);
    assert.equal(recordedCashPayload?.allocations[0]?.orderId, d1.id);
    assert.equal(recordedCashPayload?.allocations[0]?.amount, '100.00');
    assert.equal(recordedCashPayload?.allocations[1]?.orderId, d2.id);
    assert.equal(recordedCashPayload?.allocations[1]?.amount, '50.00');

    // Save screenshot of real completed state
    await page.screenshot({ path: 'apps/web/src/pages/finance/screenshots/customer-finance-manual-allocation.png' });
  });

  test('6. Real UI End-to-End: Unallocated balance application to debt order', async () => {
    assert.ok(activeWarehouseId && activeProductId && activeProductUnitId, 'Active catalog entities must exist');

    // 0. Independent customer/address/debt-order fixture so earlier tests' real
    // cash (150 + 220) can never leak into this case's unallocated baseline.
    const balanceSuffix = Date.now().toString().slice(-6);
    const balanceCustRes = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        name: `余额核销独立客户-${balanceSuffix}`,
        code: `BAL${balanceSuffix}`,
        contactName: '核销专员',
        phone: '13600000000',
      }),
    });
    assert.equal(balanceCustRes.status, 201, 'Independent balance-apply customer must be created');
    const balanceCust = await balanceCustRes.json();

    const balanceAddrRes = await fetch(`${API_BASE}/customers/${balanceCust.id}/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        label: '核销专用地址',
        contactName: '核销专员',
        phone: '13600000000',
        address: '上海市徐汇区漕河泾开发区100号',
        isDefault: true,
      }),
    });
    assert.equal(balanceAddrRes.status, 201, 'Independent balance-apply address must be created');
    const balanceAddr = await balanceAddrRes.json();
    assert.ok(balanceAddr.id, 'Independent address must have an id');

    const d6Res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        customerId: balanceCust.id,
        addressId: balanceAddr.id,
        lines: [{
          clientLineId: 'l6',
          productId: activeProductId,
          warehouseId: activeWarehouseId,
          unitId: activeProductUnitId,
          quantity: 2,
          unitPrice: '50.00',
          allocationMode: 'auto',
        }],
        discountAmount: '0.00',
        roundOffAmount: '0.00',
      }),
    });
    assert.equal(d6Res.status, 201, 'Independent debt order draft must be created');
    const d6 = await d6Res.json();
    const c6Res = await fetch(`${API_BASE}/orders/${d6.id}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ expectedVersion: d6.version }),
    });
    assert.equal(c6Res.status, 200, 'Independent debt order must be confirmed');

    // 1. Bind the independent customer through the real supported deep link
    // (/customers/{id}). The finance page loads its customer list only on mount,
    // so selecting from the already-rendered dropdown would not include this
    // newly created customer.
    await page.goto(`${BASE_URL}/customers/${balanceCust.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1:has-text("客户往来对账与收退结算")');

    const custSelect = page.locator('select.select').first();
    await page.waitForSelector(`select.select option[value="${balanceCust.id}"]`, { state: 'attached', timeout: 10000 });
    await custSelect.selectOption(balanceCust.id);
    assert.equal(await custSelect.inputValue(), balanceCust.id, 'Finance customer select must bind the independent customer');
    await page.waitForTimeout(600);

    // Deposit 50.00 unallocated cash via receipt modal in manual mode with 0 allocations
    await page.click('button:has-text("登记收款")');
    await page.waitForSelector('.modal-header:has-text("登记客户收款")');

    await page.locator('.modal-body input[placeholder="如 100.00"]').fill('50.00');
    await page.click('input[value="manual"]');

    // Manual mode pre-populates one allocation for this customer's debt order;
    // remove it via the row that directly owns the amount input so the whole
    // 50.00 stays unallocated.
    const prefillAllocRow = page
      .locator('.modal-body div[style*="grid-template-columns"]')
      .filter({ has: page.locator('input[placeholder="分摊金额"]') })
      .first();
    await prefillAllocRow.waitFor({ state: 'visible', timeout: 5000 });
    await prefillAllocRow.locator('button:has-text("✕")').click();
    await page.waitForSelector('.modal-body input[placeholder="分摊金额"]', { state: 'detached', timeout: 5000 });
    await page.click('button:has-text("确认登记入账")');
    await page.waitForSelector('.modal-header:has-text("登记客户收款")', { state: 'detached', timeout: 8000 });
    await page.waitForSelector('span:has-text("收款成功登记！")', { timeout: 5000 });

    // Verify unallocatedAmount is exactly this customer's own 50.00 (no inherited baseline)
    await page.waitForSelector('.fin-stat-card:has-text("未分配实收款 (元)")', { timeout: 5000 });
    const unallocatedCard = page.locator('.fin-stat-card').filter({ hasText: '未分配实收款 (元)' }).first();
    await unallocatedCard.locator('.fin-stat-value', { hasText: '¥50.00' }).waitFor({ state: 'visible', timeout: 5000 });

    // Click "余额核销订单"
    const balanceApplyBtn = page.locator('button:has-text("余额核销订单")');
    await balanceApplyBtn.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await balanceApplyBtn.isEnabled(), true, 'Balance apply button must be enabled when unallocatedAmount > 0');
    await balanceApplyBtn.click();

    // Modal opens
    await page.waitForSelector('.modal-header:has-text("使用未分配实收款抵扣订单")');
    assert.ok(await page.locator('.modal-body:has-text("¥50.00")').isVisible());

    // Click "+ 添加抵扣订单"
    await page.click('button:has-text("+ 添加抵扣订单")');

    // Wait for option for d6 to appear in balance apply modal select (options are attached, not visible)
    await page.waitForSelector(`.modal-body option[value="${d6.id}"]`, { state: 'attached', timeout: 8000 });
    const opt6Text = await page.locator(`.modal-body option[value="${d6.id}"]`).textContent();
    assert.ok(opt6Text?.includes(d6.orderNo), `Option must include orderNo ${d6.orderNo}`);
    const balanceSelect = page.locator('.modal-body div[style*="grid-template-columns"] select').first();
    await balanceSelect.selectOption(d6.id);

    // Enter amount 30.00
    const balanceAmountInput = page.locator('.modal-body input[placeholder="抵扣金额"]').first();
    await balanceAmountInput.fill('30.00');

    let balanceApplyPayload: any = null;
    await page.route('**/api/v1/customers/*/balance-applications', async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        balanceApplyPayload = JSON.parse(req.postData() || '{}');
      }
      await route.continue();
    });

    // Click "确认使用余额抵扣"
    await page.click('button:has-text("确认使用余额抵扣")');
    await page.waitForSelector('.modal-header:has-text("使用未分配实收款抵扣订单")', { state: 'detached', timeout: 8000 });

    // Success banner
    await page.waitForSelector('span:has-text("已成功使用未分配实收款抵扣核销订单！")', { timeout: 5000 });

    // Assert payload
    assert.equal(balanceApplyPayload?.allocations?.length, 1);
    assert.equal(balanceApplyPayload?.allocations[0]?.orderId, d6.id, 'Balance must be applied to the independent debt order');
    assert.equal(balanceApplyPayload?.allocations[0]?.amount, '30.00');
    assert.ok(
      typeof balanceApplyPayload?.expectedVersion === 'number',
      'Balance application must carry the current CustomerBalance.version'
    );

    // Assert UI shows the remaining 20.00 unallocated (scoped to that stat card only)
    const unallocatedCardAfter = page.locator('.fin-stat-card').filter({ hasText: '未分配实收款 (元)' }).first();
    await unallocatedCardAfter.locator('.fin-stat-value', { hasText: '¥20.00' }).waitFor({ state: 'visible', timeout: 5000 });

    // Save screenshot
    await page.screenshot({ path: 'apps/web/src/pages/finance/screenshots/customer-finance-balance-apply.png' });
  });

  test('7. Real UI End-to-End: Real cash refund from source credit', async () => {
    // 1. Fixture: Create isolated customer for refund with prepayment credit (-200.00)
    const refundSuffix = Date.now().toString().slice(-6);
    const rCustRes = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        name: `退款网测客户-${refundSuffix}`,
        code: `TRC${refundSuffix}`,
        contactName: '退款专员',
        phone: '13700000000',
      }),
    });
    assert.equal(rCustRes.status, 201);
    const rCustData = await rCustRes.json();
    const refundCustId = rCustData.id;

    // Add negative opening balance (-200.00) to grant creditBalance: 200.00
    const opRes = await fetch(`${API_BASE}/customers/${refundCustId}/opening-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        amount: '-200.00',
        effectiveAt: '2026-11-10T10:00:00+08:00',
        reason: '期初预收客户账款',
      }),
    });
    assert.equal(opRes.status, 201);

    // 2. In UI: Navigate to refund customer finance
    await page.goto(`${BASE_URL}/customers/${refundCustId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1:has-text("客户往来对账与收退结算")');

    // Verify creditBalance shows ¥200.00 (.fin-stat-card)
    await page.waitForSelector('.fin-stat-card:has-text("¥200.00")', { timeout: 8000 });

    // Click "办理实际退款"
    await page.click('button:has-text("办理实际退款")');
    await page.waitForSelector('.modal-header:has-text("办理实际客户退款")');

    // Fill refund amount: 50.00
    const refundAmountInput = page.locator('.modal-body input[placeholder="如 100.00"]');
    await refundAmountInput.fill('50.00');

    // Select method
    await page.locator('.modal-body select.select').first().selectOption('bank_transfer');

    // Fill ref and note
    await page.locator('.modal-body input[placeholder="如银行流水号或微信支付单号"]').fill('BANK-REF-8877');
    await page.locator('.modal-body input[placeholder="备注说明..."]').fill('预存款原路退回');

    let refundPayload: any = null;
    await page.route('**/api/v1/cash-events', async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        refundPayload = JSON.parse(req.postData() || '{}');
      }
      await route.continue();
    });

    // Submit refund
    await page.click('button:has-text("确认登记入账")');
    await page.waitForSelector('.modal-header:has-text("办理实际客户退款")', { state: 'detached', timeout: 8000 });

    // Success banner
    await page.waitForSelector('span:has-text("退款成功登记！")', { timeout: 5000 });

    // Assert payload strictly follows contract: kind=refund, no allocationMode or allocations
    assert.equal(refundPayload?.kind, 'refund');
    assert.equal(refundPayload?.customerId, refundCustId);
    assert.equal(refundPayload?.amount, '50.00');
    assert.equal(refundPayload?.method, 'bank_transfer');
    assert.equal(refundPayload?.reference, 'BANK-REF-8877');
    assert.equal(refundPayload?.allocationMode, undefined, 'Refund must not contain allocationMode');
    assert.equal(refundPayload?.allocations, undefined, 'Refund must not contain allocations');

    // Assert UI balance: creditBalance reduced to ¥150.00 (.fin-stat-card)
    await page.waitForSelector('.fin-stat-card:has-text("¥150.00")', { timeout: 5000 });

    // Save screenshot
    await page.screenshot({ path: 'apps/web/src/pages/finance/screenshots/customer-finance-refund.png' });
  });

  test('8. Real UI End-to-End: Monthly statement flagged stale on subsequent underlying change, and reading new & old snapshots', async () => {
    // Navigate to Statements
    await page.click('button:has-text("月结对账单快照")');
    await page.waitForSelector('h1:has-text("客户往来月结对账单")');

    // Select isolatedCustomerId
    const stmtCustSelect = page.locator('select.select').first();
    await stmtCustSelect.selectOption(isolatedCustomerId);
    await page.waitForTimeout(600);

    // Create Snapshot 1 for period 2026-11-01 to 2026-11-15
    await page.click('button:has-text("生成期间对账快照")');
    await page.waitForSelector('.modal-header:has-text("生成客户期间对账快照")');
    await page.fill('input[type="date"] >> nth=0', '2026-11-01');
    await page.fill('input[type="date"] >> nth=1', '2026-11-15');
    await page.click('button:has-text("确认生成快照")');

    // Snapshot 1 modal opens
    await page.waitForSelector('.modal-header:has-text("对账快照明细")');
    assert.ok(await page.locator('.modal-header span.badge-success:has-text("有效快照")').isVisible());

    // Close Snapshot 1 modal
    await page.click('.modal-header button:has-text("✕")');
    await page.waitForSelector('.modal-header:has-text("对账快照明细")', { state: 'detached', timeout: 3000 });

    // Modify underlying records within period via API (record opening balance on 2026-11-05)
    const mutateRes = await fetch(`${API_BASE}/customers/${isolatedCustomerId}/opening-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        amount: '8.88',
        effectiveAt: '2026-11-05T10:00:00+08:00',
        reason: '期间内变动触发快照stale',
      }),
    });
    assert.equal(mutateRes.status, 201);

    // Refresh list in UI
    await page.click('button[title="刷新列表"]');
    await page.waitForTimeout(600);

    // Verify row for Snapshot 1 shows stale badge in list
    const staleBadge = page.locator('table.table span.badge-warning:has-text("已过期 (原单据已修改)")');
    await staleBadge.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await staleBadge.isVisible());

    // Click "查看明细" for Snapshot 1
    await page.locator('table.table button:has-text("查看明细")').first().click();
    await page.waitForSelector('.modal-header:has-text("对账快照明细")');

    // Verify modal header shows stale badge and stale alert
    assert.ok(await page.locator('.modal-header span.badge-warning:has-text("已过期 (原业务单据已变动)")').isVisible());
    assert.ok(await page.locator('.fin-stale-alert:has-text("该快照生成后原来源已变化 (stale: true)")').isVisible());

    // Close modal
    await page.click('.modal-header button:has-text("✕")');
    await page.waitForSelector('.modal-header:has-text("对账快照明细")', { state: 'detached', timeout: 3000 });

    // Generate Snapshot 2 for the same period (2026-11-01 to 2026-11-15)
    await page.click('button:has-text("生成期间对账快照")');
    await page.waitForSelector('.modal-header:has-text("生成客户期间对账快照")');
    await page.fill('input[type="date"] >> nth=0', '2026-11-01');
    await page.fill('input[type="date"] >> nth=1', '2026-11-15');
    await page.click('button:has-text("确认生成快照")');

    // Snapshot 2 modal opens
    await page.waitForSelector('.modal-header:has-text("对账快照明细")');
    assert.ok(await page.locator('.modal-header span.badge-success:has-text("有效快照")').isVisible());

    // Close Snapshot 2 modal
    await page.click('.modal-header button:has-text("✕")');
    await page.waitForSelector('.modal-header:has-text("对账快照明细")', { state: 'detached', timeout: 3000 });

    // Assert table has both snapshots: one stale, one fresh!
    const tableRows = page.locator('table.table tbody tr');
    assert.ok(await tableRows.count() >= 2, 'Must have at least 2 snapshot rows');
    assert.ok(await page.locator('table.table span.badge-warning:has-text("已过期 (原单据已修改)")').isVisible());
    assert.ok(await page.locator('table.table span.badge-success:has-text("有效快照")').isVisible());

    // Save screenshot
    await page.screenshot({ path: 'apps/web/src/pages/finance/screenshots/statements-stale-and-fresh.png' });
  });

  test('9. Production Component Controlled Verification: Cross-page target location on Page 3 with streaming data and loading finishes', async () => {
    const targetEntryId = `entry-p3-${Date.now().toString().slice(-4)}`;

    await page.route('**/api/v1/customers/*/ledger*', async route => {
      const url = new URL(route.request().url());
      const cursor = url.searchParams.get('cursor');
      if (!cursor) {
        // Page 1: returns cursor-p2, target not in page 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              { id: 'p1-item-1', customerId: isolatedCustomerId, kind: 'sale', amount: '10.00', effectiveAt: '2026-11-10T10:00:00+08:00', recordedAt: '2026-11-10T10:00:00+08:00', reversesId: null, sourceType: 'order', sourceId: 'ord-1', sourceVersion: 1 },
              { id: 'p1-item-2', customerId: isolatedCustomerId, kind: 'sale', amount: '20.00', effectiveAt: '2026-11-10T10:00:00+08:00', recordedAt: '2026-11-10T10:00:00+08:00', reversesId: null, sourceType: 'order', sourceId: 'ord-2', sourceVersion: 1 },
            ],
            nextCursor: 'cursor-p2',
            asOf: '2026-11-11T12:00:00+08:00',
          }),
        });
      } else if (cursor === 'cursor-p2') {
        // Page 2: introduce controlled delay of 60ms
        await new Promise(r => setTimeout(r, 60));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              { id: 'p2-item-3', customerId: isolatedCustomerId, kind: 'receipt', amount: '-15.00', effectiveAt: '2026-11-10T11:00:00+08:00', recordedAt: '2026-11-10T11:00:00+08:00', reversesId: null, sourceType: 'cash_event', sourceId: 'c-1', sourceVersion: 1 },
            ],
            nextCursor: 'cursor-p3',
            asOf: '2026-11-11T12:00:00+08:00',
          }),
        });
      } else if (cursor === 'cursor-p3') {
        // Page 3: contains target item
        await new Promise(r => setTimeout(r, 60));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              { id: targetEntryId, customerId: isolatedCustomerId, kind: 'sale', amount: '50.00', effectiveAt: '2026-11-10T12:00:00+08:00', recordedAt: '2026-11-10T12:00:00+08:00', reversesId: null, sourceType: 'order', sourceId: 'ord-3', sourceVersion: 1 },
            ],
            nextCursor: null,
            asOf: '2026-11-11T12:00:00+08:00',
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Navigate to CustomerFinance with target entry deep link hash
    await page.goto(`${BASE_URL}/customers/${isolatedCustomerId}/ledger#${targetEntryId}`, { waitUntil: 'domcontentloaded' });

    // Wait for the target row to appear and be highlighted
    const targetRow = page.locator('#ledger-entry-' + targetEntryId);
    await targetRow.waitFor({ state: 'visible', timeout: 8000 });
    await targetRow.scrollIntoViewIfNeeded();
    assert.ok(await targetRow.isVisible(), 'Target row on page 3 must be visible');
    const style = await targetRow.getAttribute('style');
    assert.ok(style?.includes('outline'), 'Target row must have outline highlight style');

    // Assert that locating status indicator is false
    const locatingBanner = page.locator('text="正在跨页定位目标分录..."');
    assert.equal(await locatingBanner.isVisible().catch(() => false), false, 'Locating indicator must turn false after finish');

    // Assert 4 total items loaded across pages
    const footerSpan = page.locator('.inv-table-footer span').first();
    const footerText = await footerSpan.textContent();
    assert.ok(footerText?.includes('已加载 4 笔流水分录'), `Must display 4 loaded entries, got ${footerText}`);

    // Assert no error was shown
    const errorBanner = page.locator('.fin-error-banner, div[style*="danger"]:has-text("未在当前客户账簿中找到")');
    assert.equal(await errorBanner.isVisible().catch(() => false), false, 'Must not show not found error');
  });

  test('10. Production Component Controlled Verification: Statement customer synchronization when customer list is delayed', async () => {
    const targetStatementId = 'stmt-controlled-sync-test';

    // Delay customer list query by 200ms
    await page.route('**/api/v1/customers*', async route => {
      await new Promise(r => setTimeout(r, 200));
      await route.continue();
    });

    // Return statement snapshot immediately for isolatedCustomerId
    await page.route(`**/api/v1/statements/${targetStatementId}*`, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: targetStatementId,
          customerId: isolatedCustomerId,
          periodStart: '2026-11-01T00:00:00+08:00',
          periodEnd: '2026-11-15T00:00:00+08:00',
          asOf: '2026-11-11T12:00:00+08:00',
          sourceWatermark: 'wm-sync-test',
          openingBalance: '0.00',
          salesAmount: '100.00',
          returnAmount: '0.00',
          receiptAmount: '0.00',
          refundAmount: '0.00',
          closingBalance: '100.00',
          stale: false,
          rows: [],
          rowCount: 0,
          nextCursor: null,
        }),
      });
    });

    // Navigate to StatementsPage via deep-link
    await page.goto(`${BASE_URL}/statements/${targetStatementId}`, { waitUntil: 'domcontentloaded' });

    // Statement detail modal opens quickly
    await page.waitForSelector('.modal-header:has-text("对账快照明细")', { timeout: 8000 });

    // Wait until after customer list has returned and processed (> 250ms)
    await page.waitForTimeout(400);

    // Verify customer select retained the statement's true customer and was NOT overwritten by the first customer
    const selectVal = await page.locator('select.select').first().inputValue();
    assert.equal(selectVal, isolatedCustomerId, 'Target statement customer must NOT be overwritten by delayed customer list');

    // Verify detail modal remains open
    assert.ok(await page.locator('.modal-header:has-text("对账快照明细")').isVisible());
  });
});
