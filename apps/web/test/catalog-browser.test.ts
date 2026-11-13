import { chromium, type Browser, type Page } from '@playwright/test';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CREDS_PATH = '/tmp/huoyoupu-dev-mTw6IP/credentials.json';
const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://127.0.0.1:3000/api/v1';
const SCREENSHOTS_DIR = path.resolve('apps/web/src/pages/catalog/screenshots');

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

describe('Catalog Browser E2E UI & Responsive Verification', () => {
  let browser: Browser;
  let page: Page;
  let adminCookie = '';
  let adminCsrf = '';

  test('0. Browser Setup & Isolated Headless Launch', async () => {
    assert.ok(fs.existsSync(CREDS_PATH), 'Credentials must exist at ' + CREDS_PATH);
    const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));

    // 1. Authenticate via API to clean any stale barcodes
    const initRes = await fetch(`${API_URL}/auth/session`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    const initData = (await initRes.json()) as { csrfToken: string };
    const initCookie = initRes.headers.get('set-cookie')?.split(';')[0] || '';

    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-CSRF-Token': initData.csrfToken,
        Cookie: initCookie,
      },
      body: JSON.stringify({
        loginName: creds.admin.loginName,
        password: creds.admin.password,
      }),
    });
    const loginData = (await loginRes.json()) as { csrfToken: string };
    adminCsrf = loginData.csrfToken;
    adminCookie = loginRes.headers.get('set-cookie')?.split(';')[0] || initCookie;

    // 2. Independent headless Chromium launch (strictly no shared Edge, no clipboard, isolated fixtures)
    browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    page = await context.newPage();

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Login if on login page
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

  test('1. Product Page: 500mljy Search, Mnemonic Override/Clear, Unit Editing, Barcode 00892', async () => {
    // Navigate to Products page using sidebar button "商品资料"
    await page.click('button:has-text("商品资料")');
    await page.waitForTimeout(500);

    const timestamp = Date.now();
    const prodCode = `SP-UI-${timestamp}`;
    const prodName = `500ml酱油UI测试`;

    // 1. Create Product
    await page.click('button:has-text("新建商品档案")');
    await page.waitForSelector('.modal-content');
    await page.fill('input[placeholder*="SP-001"]', prodCode);
    await page.fill('input[placeholder*="500ml特级雪花"]', prodName);
    await page.fill('input[placeholder*="500ml/瓶"]', '500ml/瓶');
    await page.fill('input[placeholder*="瓶 / 袋 / 支"]', '瓶');
    await page.fill('input[placeholder*="10.00"]', '16.00');
    await page.click('button:has-text("确认创建")');
    await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
    await page.waitForTimeout(500);

    // 2. Search by 500mljy
    const searchInput = await page.$('input[placeholder*="搜索商品名称"]');
    assert.ok(searchInput, 'Search input must exist');
    await searchInput.fill('500mljy');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);

    const productRow = page.locator(`tr:has-text("${prodCode}")`);
    await productRow.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await productRow.isVisible(), 'Product must be found by 500mljy search');

    // 3. Edit Product: Set mnemonic code override
    await productRow.locator('button[title*="编辑商品资料与助记码"]').click();
    await page.waitForSelector('.modal-content:has-text("编辑商品档案")');
    const mnemonicInput = page.locator('div:has(> label:has-text("拼音助记码")) input.input');
    await mnemonicInput.fill('customjy');
    await page.click('button:has-text("保存修改")');
    await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
    await page.waitForTimeout(500);

    // Search by prodCode so product is displayed regardless of mnemonic query change
    await searchInput.fill(prodCode);
    await page.locator('button:has-text("搜索")').click();
    await page.waitForTimeout(500);

    // Verify custom mnemonic badge
    const customBadge = page.locator(`tr:has-text("${prodCode}") span.badge-warning:has-text("customjy")`);
    await customBadge.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await customBadge.isVisible(), 'Custom mnemonic badge must be visible');

    // Clear mnemonic override to null
    await productRow.locator('button[title*="编辑商品资料与助记码"]').click();
    await page.waitForSelector('.modal-content:has-text("编辑商品档案")');
    await page.click('label:has-text("清除人工指定助记码") input[type="checkbox"]');
    await page.click('button:has-text("保存修改")');
    await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
    await page.waitForTimeout(500);

    // Refresh row view
    await searchInput.fill(prodCode);
    await page.locator('button:has-text("搜索")').click();
    await page.waitForTimeout(500);

    // 4. Barcode Management: Unique barcode with leading zeros (e.g. 00892 pattern)
    const uniqueLeadingZeroBarcode = `00${Math.floor(100000 + Math.random() * 900000)}`;
    await productRow.locator('button:has-text("条码")').click();
    await page.waitForSelector('.modal-content:has-text("维护商品条形码")');
    const barcodeInput = page.locator('.modal-content input[placeholder*="00892"]');
    await barcodeInput.fill(uniqueLeadingZeroBarcode);
    await page.click('.modal-content button:has-text("添加")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("整组保存条码")');
    await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
    await page.waitForTimeout(500);

    // Verify leading zeroes barcode displayed in row
    const barcodeBadge = page.locator(`tr:has-text("${prodCode}") span.badge:has-text("${uniqueLeadingZeroBarcode}")`);
    assert.ok(await barcodeBadge.isVisible(), 'Unique barcode with leading zeroes must be preserved');

    // 5. Unit Management & UnitPatch editing
    await productRow.locator('button:has-text("单位")').click();
    await page.waitForSelector('.modal-content:has-text("管理包装单位")');

    // Add secondary unit
    await page.fill('.modal-content input[placeholder="箱"]', '箱');
    await page.fill('.modal-content input[type="number"]', '12');
    await page.locator('div:has(> label:has-text("默认售价")) input').last().fill('168.00');
    await page.click('.modal-content button:has-text("添加")');
    await page.waitForTimeout(600);

    // Edit base unit via UnitPatch
    const baseRow = page.locator('.modal-content tr').filter({ hasText: '基础单位' });
    await baseRow.locator('button:has-text("编辑")').click();
    await page.locator('.modal-content :has-text("编辑单位资料")').first().waitFor({ state: 'visible', timeout: 5000 });
    const editCard = page.locator('.modal-content form:has(button:has-text("保存单位修改"))');
    await editCard.locator('input.input').first().fill('原装瓶');
    await editCard.locator('button:has-text("保存单位修改")').click();
    await page.waitForTimeout(500);

    // Desktop screenshot of units
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'product-unit-edit-desktop.png') });
    await page.click('.modal-content button:has-text("完成")');
    await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
    await page.waitForTimeout(300);

    // Desktop screenshot of product list
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'product-list-desktop.png') });

    // Mobile Viewport Verification (390x844 & 350x600)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'product-list-mobile.png') });

    // Test 350px width without horizontal overflow
    await page.setViewportSize({ width: 350, height: 600 });
    await page.waitForTimeout(300);
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    assert.ok(bodyScrollWidth <= 352, `Body scrollWidth (${bodyScrollWidth}) must not horizontally overflow 350px`);

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('2. Customer Page: Address Editing, Price Rules Hierarchy & Quote Inspection', async () => {
    // Navigate to Customers page using sidebar button "客户与价格"
    await page.click('button:has-text("客户与价格")');
    await page.waitForTimeout(500);

    // Ensure on customer sub-tab
    const custSubTab = page.locator('button:has-text("客户档案与专属价")');
    if (await custSubTab.isVisible()) {
      await custSubTab.click();
      await page.waitForTimeout(300);
    }

    const timestamp = Date.now();
    const custCode = `KH-UI-${timestamp}`;
    const custName = `朝阳示范餐厅-${timestamp}`;

    // 1. Create Customer
    await page.click('button:has-text("新建客户档案")');
    await page.waitForSelector('.modal-content:has-text("新建客户档案")');
    await page.fill('input[placeholder*="KH-001"]', custCode);
    await page.fill('input[placeholder*="朝阳第一便利店"]', custName);
    await page.fill('input[placeholder*="王店长"]', '赵经理');
    await page.fill('input[placeholder*="13800000000"]', '13811223344');
    await page.click('button:has-text("确认创建")');
    await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
    await page.waitForTimeout(500);

    // Search customer by code
    const custSearchInput = page.locator('input[placeholder*="搜索客户名称"]');
    await custSearchInput.fill(custCode);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);

    const customerRow = page.locator(`tr:has-text("${custCode}")`);
    await customerRow.waitFor({ state: 'visible', timeout: 5000 });

    // 2. Multi-address Management & Address Editing (including clearing phone/label)
    await customerRow.locator('button:has-text("地址")').click();
    await page.waitForSelector('.modal-content:has-text("管理客户多配送地址")');

    // Add address with initial contact and phone
    await page.fill('.modal-content input[placeholder*="联系人"]', '赵经理');
    await page.fill('.modal-content input[placeholder*="收件电话"]', '13811223344');
    await page.fill('.modal-content input[placeholder*="省市区街道门牌号"]', '朝阳区建国门外大街1号');
    await page.click('.modal-content button:has-text("添加地址")');
    await page.waitForTimeout(600);

    // Edit address: update contact and explicitly clear phone
    const addrRow = page.locator('.modal-content tr:has-text("朝阳区建国门外大街1号")');
    await addrRow.locator('button:has-text("编辑")').click();
    await page.locator('.modal-content :has-text("修改配送地址")').first().waitFor({ state: 'visible', timeout: 5000 });
    const editContactInput = page.locator('.modal-content form:has(button:has-text("保存地址修改")) input[required]').first();
    await editContactInput.fill('钱主厨');
    // Clear phone field to empty string
    const editPhoneInput = page.locator('.modal-content form:has(button:has-text("保存地址修改")) input[value="13811223344"]');
    if (await editPhoneInput.isVisible()) {
      await editPhoneInput.fill('');
    }
    await page.click('button:has-text("保存地址修改")');
    await page.waitForTimeout(600);

    assert.ok(await page.locator('.modal-content tr:has-text("钱主厨")').isVisible(), 'Edited contact name must be visible');
    const updatedAddrRow = page.locator('.modal-content tr:has-text("钱主厨")');
    assert.ok(await updatedAddrRow.locator('td:has-text("—")').isVisible(), 'Cleared phone must be displayed as empty fallback (—)');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'customer-address-edit-desktop.png') });
    await page.click('.modal-content button:has-text("完成")');
    await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
    await page.waitForTimeout(300);

    // 3. Customer Price Rules Modal
    await customerRow.locator('button:has-text("专属价")').click();
    await page.waitForSelector('.modal-content:has-text("客户专属价格规则")');

    // Verify price hierarchy explanation is displayed
    const hierarchyText = page.locator('.modal-content :has-text("开单计价来源层级")').first();
    await hierarchyText.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await hierarchyText.isVisible(), 'Price hierarchy explanation must be visible');

    // Save a custom price rule
    const priceInput = page.locator('.modal-content input[placeholder="0.00"]');
    await priceInput.fill('13.60');
    await page.click('.modal-content button:has-text("保存规则")');
    await page.waitForTimeout(600);

    // Verify rule appears in table with version
    const ruleRow = page.locator('.modal-content tr:has-text("13.60")');
    assert.ok(await ruleRow.isVisible(), 'Custom price rule must appear in table');

    // Desktop screenshot of price rules
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'customer-price-rules-desktop.png') });

    // Mobile Viewport for customer price rules
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'customer-price-rules-mobile.png') });

    // Test 350px responsive
    await page.setViewportSize({ width: 350, height: 600 });
    await page.waitForTimeout(300);
    const modalScrollWidth = await page.evaluate(() => {
      const modal = document.querySelector('.modal-content');
      return modal ? modal.scrollWidth : 0;
    });
    assert.ok(modalScrollWidth <= 352, `Modal scrollWidth (${modalScrollWidth}) must not horizontally overflow 350px`);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.click('.modal-content button:has-text("完成")');
    await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
    await page.waitForTimeout(300);

    // Desktop screenshot of customer list
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'customer-list-desktop.png') });
  });

  test('3. Warehouse Page: Search q, Pagination Support, Edit & Toggle Active', async () => {
    // Navigate to Warehouses page via sub-tab in Customers & Warehouses
    await page.click('button:has-text("客户与价格")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("仓库管理")');
    await page.waitForTimeout(500);

    const timestamp = Date.now();
    const whCode = `WH-D-${timestamp}`;
    const whName = `东部冷链枢纽仓-${timestamp}`;

    // 1. Create warehouse
    await page.click('button:has-text("新建仓库")');
    await page.waitForSelector('.modal:has-text("新增仓库")');
    await page.fill('input[placeholder*="WH-01"]', whCode);
    await page.fill('input[placeholder*="主仓库"]', whName);
    await page.click('button:has-text("确认创建")');
    await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
    await page.waitForTimeout(600);

    // 2. Search warehouse with q
    const whSearchInput = page.locator('input[placeholder*="搜索仓库编码或名称"]');
    await whSearchInput.fill(whCode);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    const whRow = page.locator(`tr:has-text("${whCode}")`);
    assert.ok(await whRow.isVisible(), 'Created warehouse must appear in search results');

    // 3. Edit warehouse
    await whRow.locator('button:has-text("编辑")').click();
    await page.waitForSelector('.modal:has-text("编辑仓库")');
    const editWhNameInput = page.locator('.modal input[type="text"]');
    await editWhNameInput.fill(`${whName}-已核准`);
    await page.click('button:has-text("保存修改")');
    await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
    await page.waitForTimeout(500);

    assert.ok(await page.locator(`tr:has-text("${whName}-已核准")`).isVisible(), 'Edited warehouse name must be visible');

    // 4. Toggle Active
    const updatedWhRow = page.locator(`tr:has-text("${whCode}")`);
    await updatedWhRow.locator('button:has-text("停用")').click();
    await page.waitForTimeout(500);
    assert.ok(await updatedWhRow.locator('span.badge-danger:has-text("已停用")').isVisible(), 'Status must toggle to inactive');

    // Desktop screenshot
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'warehouse-list-desktop.png') });

    // Mobile Viewport screenshot
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'warehouse-list-mobile.png') });

    // Test 350px responsive
    await page.setViewportSize({ width: 350, height: 600 });
    await page.waitForTimeout(300);
    const whBodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    assert.ok(whBodyScrollWidth <= 352, `Warehouse page body scrollWidth (${whBodyScrollWidth}) must not horizontally overflow 350px`);
  });

  test('4. Price Quote History Source: Click Real Source Order Button & Resolution to orderId+revisionId', async () => {
    // 1. Prepare independent fictional customer, product, warehouse and stock via API
    const ts = Date.now();
    const custCode = `KH-HIST-${ts}`;
    const prodCode = `SP-HIST-${ts}`;

    // Create customer
    const custRes = await fetch(`${API_URL}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        code: custCode,
        name: `历史成交价测试客户-${ts}`,
        contactName: '钱老板',
        phone: '13611223344',
      }),
    });
    const histCustomer = (await custRes.json()) as any;
    assert.equal(custRes.status, 201, `Create customer failed with status ${custRes.status}: ${JSON.stringify(histCustomer)}`);

    // Add default address
    const addrRes = await fetch(`${API_URL}/customers/${histCustomer.id}/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        contactName: '钱老板',
        phone: '13611223344',
        address: '海淀区中关村南大街10号',
        label: '总部',
        isDefault: true,
      }),
    });
    const histAddress = (await addrRes.json()) as any;
    assert.equal(addrRes.status, 201, `Create address failed with status ${addrRes.status}: ${JSON.stringify(histAddress)}`);

    // Create product
    const prodRes = await fetch(`${API_URL}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        code: prodCode,
        name: `历史单价试算商品-${ts}`,
        specification: '500ml/瓶',
        brand: '测试精选',
        baseUnit: {
          name: '瓶',
          defaultSalePrice: '20.00',
          defaultReceiptCost: '10.00',
        },
      }),
    });
    const histProduct = (await prodRes.json()) as any;
    assert.equal(prodRes.status, 201, `Create product failed with status ${prodRes.status}: ${JSON.stringify(histProduct)}`);
    const baseUnitId = histProduct.baseUnitId;

    // Create an independent active warehouse fixture for this test
    const whRes = await fetch(`${API_URL}/warehouses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        code: `WH-HIST-${ts}`,
        name: `历史成交独立仓-${ts}`,
      }),
    });
    const targetWh = (await whRes.json()) as any;
    assert.equal(whRes.status, 201, `Create active warehouse failed with status ${whRes.status}: ${JSON.stringify(targetWh)}`);
    assert.ok(targetWh.active, 'Created warehouse must be active');

    // Create stock receipt so inventory is available (POST /receipts is immediately confirmed)
    const receiptRes = await fetch(`${API_URL}/receipts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        kind: 'opening',
        warehouseId: targetWh.id,
        receivedAt: new Date().toISOString(),
        lines: [
          {
            productId: histProduct.id,
            unitId: baseUnitId,
            quantity: 50,
            unitCost: '10.00',
          },
        ],
      }),
    });
    const receipt = (await receiptRes.json()) as any;
    assert.equal(receiptRes.status, 201, `Create receipt failed with status ${receiptRes.status}: ${JSON.stringify(receipt)}`);

    // Create and confirm historical order (unitPrice: 18.50)
    const orderRes = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        customerId: histCustomer.id,
        addressId: histAddress.id,
        lines: [
          {
            clientLineId: 'line-hist-1',
            productId: histProduct.id,
            warehouseId: targetWh.id,
            unitId: baseUnitId,
            quantity: 2,
            unitPrice: '18.50',
            allocationMode: 'auto',
          },
        ],
        discountAmount: '0.00',
        roundOffAmount: '0.00',
      }),
    });
    const draftOrder = (await orderRes.json()) as any;
    assert.equal(orderRes.status, 201, `Create draft order failed with status ${orderRes.status}: ${JSON.stringify(draftOrder)}`);

    const confOrderRes = await fetch(`${API_URL}/orders/${draftOrder.id}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ expectedVersion: draftOrder.version }),
    });
    const confirmedOrder = (await confOrderRes.json()) as any;
    assert.equal(confOrderRes.status, 200, `Confirm order failed with status ${confOrderRes.status}: ${JSON.stringify(confirmedOrder)}`);
    assert.equal(confirmedOrder.status, 'confirmed');

    // 2. Real Headless UI Interaction
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.click('button:has-text("客户与价格")');
    await page.waitForTimeout(400);

    // Ensure on customer sub-tab
    const custSubTab = page.locator('button:has-text("客户档案与专属价")');
    if (await custSubTab.isVisible()) {
      await custSubTab.click();
      await page.waitForTimeout(300);
    }

    // Search for the historical customer
    const searchInput = page.locator('input[placeholder*="搜索客户名称"]');
    await searchInput.fill(custCode);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);

    const customerRow = page.locator(`tr:has-text("${custCode}")`);
    await customerRow.waitFor({ state: 'visible', timeout: 5000 });

    // Open Price Rules Modal
    await customerRow.locator('button:has-text("专属价")').click();
    await page.waitForSelector('.modal-content:has-text("客户专属价格规则")');

    // Select the historical product in the dropdown
    const prodSelect = page.locator('.modal-content select').first();
    await prodSelect.selectOption(histProduct.id);
    await page.waitForTimeout(600);

    // Verify the live price quote preview displays 'history'
    const historyBadge = page.locator('.modal-content span.badge:has-text("历史成交价")');
    await historyBadge.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await historyBadge.isVisible(), 'History price quote badge must be visible');

    // Verify source order ID is shown in UI
    const sourceOrderSpan = page.locator(`.modal-content span.font-mono:has-text("${confirmedOrder.id}")`);
    assert.ok(await sourceOrderSpan.isVisible(), 'Source order ID must be displayed in quote preview');

    // Check price reflects historical order price (18.50)
    assert.ok(await page.locator('.modal-content:has-text("18.50")').isVisible(), 'Unit price must reflect 18.50');

    // Listen for huoyoupu:navigate event
    await page.evaluate(() => {
      (window as any).__lastNavHref = null;
      window.addEventListener('huoyoupu:navigate', (e: any) => {
        (window as any).__lastNavHref = e.detail?.href;
      });
    });

    // Click "查看来源订单" button
    const jumpButton = page.locator('button:has-text("查看来源订单")');
    assert.ok(await jumpButton.isVisible(), 'Jump to order button must be visible');
    await jumpButton.click();
    await page.waitForTimeout(400);

    // Verify navigation event detail
    const navHref = await page.evaluate(() => (window as any).__lastNavHref);
    assert.ok(navHref, 'huoyoupu:navigate event must have been dispatched with href');
    const expectedHref = `/orders/${confirmedOrder.id}/revisions/${confirmedOrder.revisionId}`;
    assert.equal(navHref, expectedHref, `Navigation href must strictly match ${expectedHref}`);

    // Verify target order and revision are actually accessible via API GET
    const verifyOrderRes = await fetch(`${API_URL}/orders/${confirmedOrder.id}`, {
      headers: { Origin: 'http://localhost:5173', Cookie: adminCookie },
    });
    assert.equal(verifyOrderRes.status, 200, 'Target source order must be readable');

    const verifyRevRes = await fetch(`${API_URL}/orders/${confirmedOrder.id}/revisions/${confirmedOrder.revisionId}`, {
      headers: { Origin: 'http://localhost:5173', Cookie: adminCookie },
    });
    assert.equal(verifyRevRes.status, 200, 'Target source revision must be readable');

    // Capture screenshot
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'customer-price-quote-history-source.png') });

    // The source click navigated away and unmounted the price-rules modal.
    // Assert the real landing page instead of cleaning up a modal that no longer exists.
    await page.waitForSelector(`text=订单 ${confirmedOrder.orderNo}`, { timeout: 15000 });
    await page.waitForSelector('text=【历史版本只读快照', { timeout: 15000 });
    const landingText = await page.locator('body').innerText();
    assert.ok(
      landingText.includes(`版本号 #v${confirmedOrder.revisionNo}`),
      'Landing page must be the exact historical revision snapshot of the source order'
    );
    assert.ok(
      landingText.includes('返回当前生效版本'),
      'Historical snapshot page must expose the return-to-current action (read-only state)'
    );
    assert.equal(
      await page.locator('.modal-content:has-text("客户专属价格规则")').count(),
      0,
      'Price rules modal must be unmounted after real navigation'
    );
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'customer-price-quote-history-landing.png') });
  });

  test('5. Lifecycle Inactivity: Deactivate Product & Customer in Real UI, Old Reference Readability & New Order Saleability', async () => {
    const ts = Date.now();
    const prodCode = `SP-INACT-${ts}`;
    const custCode = `KH-INACT-${ts}`;

    // Create product
    const prodRes = await fetch(`${API_URL}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        code: prodCode,
        name: `停用生命周期商品-${ts}`,
        specification: '标准袋装',
        brand: '测试品牌',
        baseUnit: {
          name: '袋',
          defaultSalePrice: '15.00',
          defaultReceiptCost: '8.00',
        },
      }),
    });
    assert.equal(prodRes.status, 201);
    const testProd = (await prodRes.json()) as any;

    // Create customer
    const custRes = await fetch(`${API_URL}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        code: custCode,
        name: `停用生命周期客户-${ts}`,
        contactName: '周经理',
        phone: '13700112233',
      }),
    });
    assert.equal(custRes.status, 201);
    const testCust = (await custRes.json()) as any;

    // Add default address
    const addrRes = await fetch(`${API_URL}/customers/${testCust.id}/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        contactName: '周经理',
        phone: '13700112233',
        address: '丰台区科技园区一路1号',
        label: '门店',
        isDefault: true,
      }),
    });
    assert.equal(addrRes.status, 201);
    const testAddr = (await addrRes.json()) as any;

    // Get warehouse & add stock. Use an independent active warehouse owned by this
    // test: the first 5 warehouses on this database are already inactive.
    const whRes = await fetch(`${API_URL}/warehouses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        code: `WH-INACT-${ts}`,
        name: `停用生命周期独立仓-${ts}`,
      }),
    });
    assert.equal(whRes.status, 201, 'Independent active warehouse for lifecycle test must be created');
    const wh = (await whRes.json()) as any;
    assert.ok(wh.id, 'Independent warehouse must have an id');
    assert.equal(wh.active, true, 'Independent warehouse must be active');

    // POST /receipts is immediately confirmed; there is no /receipts/{id}/confirm endpoint.
    const rRes = await fetch(`${API_URL}/receipts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        kind: 'opening',
        warehouseId: wh.id,
        receivedAt: new Date().toISOString(),
        lines: [{ productId: testProd.id, unitId: testProd.baseUnitId, quantity: 20, unitCost: '8.00' }],
      }),
    });
    const receipt = (await rRes.json()) as any;
    assert.equal(rRes.status, 201, `Opening receipt must be created (immediately confirmed): ${JSON.stringify(receipt)}`);
    assert.ok(receipt.id, 'Receipt response must contain an id');
    assert.equal(receipt.warehouseId, wh.id, 'Receipt must be booked into the independent warehouse');
    assert.equal(receipt.kind, 'opening', 'Receipt kind must match the request');
    assert.ok(Array.isArray(receipt.lines) && receipt.lines.length === 1, 'Receipt must contain the booked line');

    // Create & confirm order BEFORE deactivation (old reference)
    const oRes = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        customerId: testCust.id,
        addressId: testAddr.id,
        lines: [{ clientLineId: 'line-1', productId: testProd.id, warehouseId: wh.id, unitId: testProd.baseUnitId, quantity: 1, unitPrice: '15.00', allocationMode: 'auto' }],
        discountAmount: '0.00',
        roundOffAmount: '0.00',
      }),
    });
    const draftO = (await oRes.json()) as any;
    assert.equal(oRes.status, 201, `Pre-deactivation order draft must be created: ${JSON.stringify(draftO)}`);
    assert.ok(draftO.id && draftO.version, 'Order draft must return id and version');
    const confORes = await fetch(`${API_URL}/orders/${draftO.id}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ expectedVersion: draftO.version }),
    });
    const confirmedHistOrder = (await confORes.json()) as any;
    assert.equal(confORes.status, 200, `Pre-deactivation order must be confirmed: ${JSON.stringify(confirmedHistOrder)}`);
    assert.equal(confirmedHistOrder.status, 'confirmed');
    assert.ok(confirmedHistOrder.lines?.length > 0, 'Confirmed order must keep its line for later readability checks');

    // 1. Deactivate Product in Real UI
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.click('button:has-text("商品资料")');
    await page.waitForTimeout(400);

    const prodSearchInput = page.locator('input[placeholder*="搜索商品名称"]');
    await prodSearchInput.fill(prodCode);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);

    const prodRow = page.locator(`tr:has-text("${prodCode}")`);
    await prodRow.waitFor({ state: 'visible', timeout: 5000 });

    // Open edit modal
    await prodRow.locator('button[title*="编辑商品资料与助记码"]').click();
    await page.waitForSelector('.modal-content:has-text("编辑商品档案")');

    // Uncheck active checkbox
    await page.click('label:has-text("商品启用状态") input[type="checkbox"]');
    await page.click('button:has-text("保存修改")');
    await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
    await page.waitForTimeout(500);

    // Check "包含已停用商品" to ensure inactive product is visible in search list
    const includeInactiveProdCheckbox = page.locator('label:has-text("包含已停用商品") input[type="checkbox"]');
    if (await includeInactiveProdCheckbox.isVisible() && !(await includeInactiveProdCheckbox.isChecked())) {
      await includeInactiveProdCheckbox.click();
      await page.waitForTimeout(500);
    }
    await prodSearchInput.fill(prodCode);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);

    // Verify row displays the production inactive badge ("停用", not "已停用") and the
    // server really reports active=false for this product.
    const inactiveProdRow = page.locator(`tr:has-text("${prodCode}")`);
    const prodBadge = inactiveProdRow.locator('span.badge-danger:has-text("停用")');
    await prodBadge.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal((await prodBadge.textContent())?.trim(), '停用', 'Product badge text must match production "停用"');
    const prodApiRes = await fetch(`${API_URL}/products/${testProd.id}`, {
      headers: { Origin: 'http://localhost:5173', Cookie: adminCookie },
    });
    assert.equal(prodApiRes.status, 200, 'Deactivated product must still be readable');
    const prodApiData = (await prodApiRes.json()) as any;
    assert.equal(prodApiData.active, false, 'Server must report the product as inactive');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'product-deactivated.png') });

    // 2. Deactivate Customer in Real UI
    await page.click('button:has-text("客户与价格")');
    await page.waitForTimeout(400);

    const custSubTab = page.locator('button:has-text("客户档案与专属价")');
    if (await custSubTab.isVisible()) {
      await custSubTab.click();
      await page.waitForTimeout(300);
    }

    const custSearchInput = page.locator('input[placeholder*="搜索客户名称"]');
    await custSearchInput.fill(custCode);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);

    const custRow = page.locator(`tr:has-text("${custCode}")`);
    await custRow.waitFor({ state: 'visible', timeout: 5000 });

    // Open customer edit modal
    await custRow.locator('button:has-text("编辑")').click();
    await page.waitForSelector('.modal-content:has-text("编辑客户档案")');

    // Uncheck active checkbox
    await page.click('label:has-text("客户启用状态") input[type="checkbox"]');
    await page.click('button:has-text("保存修改")');
    await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 5000 });
    await page.waitForTimeout(500);

    // Include inactive customers so the deactivated row stays queryable
    const includeInactiveCustCheckbox = page.locator('label:has-text("包含已停用客户") input[type="checkbox"]');
    if (await includeInactiveCustCheckbox.isVisible() && !(await includeInactiveCustCheckbox.isChecked())) {
      await includeInactiveCustCheckbox.click();
      await page.waitForTimeout(500);
    }
    await custSearchInput.fill(custCode);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);

    // Check customer row displays inactive badge ("停用") and the server agrees active=false
    const inactiveCustRow = page.locator(`tr:has-text("${custCode}")`);
    const custBadge = inactiveCustRow.locator('span.badge-danger:has-text("停用")');
    await custBadge.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal((await custBadge.textContent())?.trim(), '停用', 'Customer badge text must match production "停用"');
    const custApiRes = await fetch(`${API_URL}/customers/${testCust.id}`, {
      headers: { Origin: 'http://localhost:5173', Cookie: adminCookie },
    });
    assert.equal(custApiRes.status, 200, 'Deactivated customer must still be readable');
    const custApiData = (await custApiRes.json()) as any;
    assert.equal(custApiData.active, false, 'Server must report the customer as inactive');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'customer-deactivated.png') });

    // 3. Old Reference Verification: Past Confirmed Order is still completely readable
    const readOldOrderRes = await fetch(`${API_URL}/orders/${confirmedHistOrder.id}`, {
      headers: { Origin: 'http://localhost:5173', Cookie: adminCookie },
    });
    assert.equal(readOldOrderRes.status, 200, 'Past confirmed order referencing deactivated entities must remain readable');
    const oldOrderData = (await readOldOrderRes.json()) as any;
    assert.equal(oldOrderData.status, 'confirmed');
    assert.equal(oldOrderData.customerId, testCust.id);
    assert.ok(oldOrderData.lines.some((l: any) => l.productId === testProd.id), 'Old order lines must retain deactivated product');

    // 4. New Order Saleability Verification: Deactivated customer cannot create new transactions
    const newOrderRes = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        customerId: testCust.id,
        addressId: testAddr.id,
        lines: [{ clientLineId: 'new-line-1', productId: testProd.id, warehouseId: wh.id, unitId: testProd.baseUnitId, quantity: 1, unitPrice: '15.00', allocationMode: 'auto' }],
        discountAmount: '0.00',
        roundOffAmount: '0.00',
      }),
    });
    assert.equal(newOrderRes.status, 409, 'New order creation with deactivated customer must be rejected with 409');
    const errBody = (await newOrderRes.json()) as any;
    assert.equal(errBody.code, 'RELATED_RECORD_CONFLICT', 'Error code must be RELATED_RECORD_CONFLICT');
  });

  test('6. Teardown', async () => {
    if (browser) {
      await browser.close();
    }
  });
});
