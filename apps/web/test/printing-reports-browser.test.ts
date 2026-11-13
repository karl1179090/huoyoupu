import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { parseSchema } from '@huoyoupu/contracts';
import { getDefaultPrintConfig } from '../src/pages/printing/printConfigLogic.js';
import type { PrintTemplate, PrintTemplateVersion } from '../src/api/types.js';

const CREDS_PATH = process.env.HYP_CREDENTIALS_FILE || '/tmp/huoyoupu-dev-mTw6IP/credentials.json';
const BASE_URL = process.env.HYP_BASE_URL || 'http://localhost:5173';
const API_BASE = process.env.HYP_API_BASE || 'http://127.0.0.1:3000/api/v1';
const ORIGIN = BASE_URL;

interface Account {
  loginName: string;
  password: string;
}
interface Credentials {
  admin: Account;
  employee: Account;
}

function getLaunchOptions(extraArgs: string[] = []): Parameters<typeof chromium.launch>[0] {
  const edgeMac = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
  const edgeLinux = '/usr/bin/microsoft-edge';
  let executablePath: string | undefined;

  if (fs.existsSync(edgeMac)) {
    executablePath = edgeMac;
  } else if (fs.existsSync(edgeLinux)) {
    executablePath = edgeLinux;
  }

  return {
    headless: true,
    executablePath,
    args: extraArgs,
  };
}

function writeHeaders(csrf: string, cookie: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Origin: ORIGIN,
    Cookie: cookie,
    'X-CSRF-Token': csrf,
    'Idempotency-Key': crypto.randomUUID(),
  };
}

async function loginAs(context: BrowserContext, account: Account): Promise<Page> {
  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const loginName = page.locator('input[type="text"]').first();
  await loginName.waitFor({ state: 'visible', timeout: 10000 });
  await loginName.fill(account.loginName);
  const password = page.locator('input[type="password"]').first();
  await password.waitFor({ state: 'visible', timeout: 10000 });
  await password.fill(account.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  // Real login must land on the authenticated shell, not remain on the form.
  await page.locator('text="打印单据"').first().waitFor({ state: 'visible', timeout: 15000 });
  return page;
}

async function openPrintPreview(page: Page, orderNo: string): Promise<void> {
  await page.locator('text="打印单据"').first().click();
  const search = page.locator('input[placeholder*="搜索订单号"]').first();
  await search.waitFor({ state: 'visible', timeout: 10000 });
  await search.fill(orderNo);
  await page.locator('form button:has-text("搜索")').first().click();
  const row = page.locator('tbody tr').filter({ hasText: orderNo }).first();
  await row.waitFor({ state: 'visible', timeout: 10000 });
  await row.locator('button[title="打印单据"]').click();
  await page.waitForSelector('.printable-sheet', { timeout: 15000 });
}

describe('Printing & Reports Real Browser Acceptance Tests (Tasks 12.7, 12.8, 13.3)', () => {
  let browser: Browser;
  let creds: Credentials;
  let adminCsrf = '';
  let adminCookie = '';

  // Independent, self-confirmed + self-corrected order fixture (own data only).
  let fixtureOrderId = '';
  let fixtureOrderNo = '';
  let currentRevisionId = '';
  let oldRevisionId = '';
  let fixtureProductId = '';
  let fixtureWarehouseId = '';
  let fixtureUnitId = '';

  // Templates: A is published twice (old + new version), B stays on its initial version.
  let tplA: PrintTemplate;
  let oldTemplateVersionId = '';
  let tplB: PrintTemplate;
  let originalDefaultId = '';

  before(async () => {
    assert.ok(fs.existsSync(CREDS_PATH), `Credentials file must exist at ${CREDS_PATH}`);
    creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8')) as Credentials;

    // 1. Admin API session (real challenge + login + CSRF).
    const initRes = await fetch(`${API_BASE}/auth/session`, { headers: { Origin: ORIGIN } });
    const initData = (await initRes.json()) as { csrfToken: string };
    const initCookie = initRes.headers.get('set-cookie')?.split(';')[0] || '';

    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': initData.csrfToken,
        Cookie: initCookie,
      },
      body: JSON.stringify({ loginName: creds.admin.loginName, password: creds.admin.password }),
    });
    assert.equal(loginRes.status, 200, 'Admin API login must succeed');
    const loginData = (await loginRes.json()) as { csrfToken: string };
    adminCsrf = loginData.csrfToken;
    adminCookie = loginRes.headers.get('set-cookie')?.split(';')[0] || initCookie;

    const readAllTemplates = async (): Promise<PrintTemplate[]> => {
      const all: PrintTemplate[] = [];
      let cursor: string | undefined = undefined;
      do {
        const url = new URL(`${API_BASE}/print-templates`);
        url.searchParams.set('limit', '50');
        if (cursor) url.searchParams.set('cursor', cursor);
        const res = await fetch(url.toString(), { headers: { Origin: ORIGIN, Cookie: adminCookie } });
        assert.equal(res.status, 200, 'Template page read must succeed');
        const pageData = (await res.json()) as { items: PrintTemplate[]; nextCursor: string | null };
        all.push(...pageData.items);
        cursor = pageData.nextCursor || undefined;
      } while (cursor);
      return all;
    };

    // 2. Full-cursor baseline of the real default template.
    const initialTpls = await readAllTemplates();
    const initialDefaults = initialTpls.filter(t => t.isDefault);
    assert.equal(initialDefaults.length, 1, 'Exactly one default template must exist before the test');
    originalDefaultId = initialDefaults[0]!.id;

    // 3. Own catalog/stock fixtures: independent customer, product, warehouse, opening receipt.
    const suffix = Date.now().toString().slice(-6);

    const custRes = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: writeHeaders(adminCsrf, adminCookie),
      body: JSON.stringify({
        code: `KH-PRT-${suffix}`,
        name: `打印验收独立客户-${suffix}`,
        contactName: '验收联系人',
        phone: '13600001111',
      }),
    });
    assert.equal(custRes.status, 201, 'Customer fixture creation must succeed');
    const customer = (await custRes.json()) as { id: string };

    const addrRes = await fetch(`${API_BASE}/customers/${customer.id}/addresses`, {
      method: 'POST',
      headers: writeHeaders(adminCsrf, adminCookie),
      body: JSON.stringify({
        contactName: '验收联系人',
        phone: '13600001111',
        address: '验收测试配送地址1号',
        label: '默认',
        isDefault: true,
      }),
    });
    assert.equal(addrRes.status, 201, 'Address fixture creation must succeed');
    const address = (await addrRes.json()) as { id: string };

    const prodRes = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: writeHeaders(adminCsrf, adminCookie),
      body: JSON.stringify({
        code: `SP-PRT-${suffix}`,
        name: `打印验收独立商品-${suffix}`,
        specification: '500ml/瓶',
        brand: '验收品牌',
        baseUnit: { name: '瓶', defaultSalePrice: '20.00', defaultReceiptCost: '10.00' },
      }),
    });
    assert.equal(prodRes.status, 201, 'Product fixture creation must succeed');
    const product = (await prodRes.json()) as { id: string; baseUnitId: string };
    fixtureProductId = product.id;
    fixtureUnitId = product.baseUnitId;

    const whRes = await fetch(`${API_BASE}/warehouses`, {
      method: 'POST',
      headers: writeHeaders(adminCsrf, adminCookie),
      body: JSON.stringify({ code: `WH-PRT-${suffix}`, name: `打印验收独立仓-${suffix}` }),
    });
    assert.equal(whRes.status, 201, 'Warehouse fixture creation must succeed');
    const warehouse = (await whRes.json()) as { id: string; active: boolean };
    assert.ok(warehouse.active, 'Fixture warehouse must be active');
    fixtureWarehouseId = warehouse.id;

    const receiptRes = await fetch(`${API_BASE}/receipts`, {
      method: 'POST',
      headers: writeHeaders(adminCsrf, adminCookie),
      body: JSON.stringify({
        kind: 'opening',
        warehouseId: fixtureWarehouseId,
        receivedAt: new Date().toISOString(),
        lines: [{ productId: fixtureProductId, unitId: fixtureUnitId, quantity: 50, unitCost: '10.00' }],
      }),
    });
    assert.equal(receiptRes.status, 201, 'Opening receipt fixture creation must succeed');

    // 4. Own order: draft -> confirm -> one real correction, producing >= 2 revisions
    // where the older revision is genuinely non-current with a distinct UUID.
    const orderRes = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: writeHeaders(adminCsrf, adminCookie),
      body: JSON.stringify({
        customerId: customer.id,
        addressId: address.id,
        lines: [
          {
            clientLineId: 'e2e-print-line-1',
            productId: fixtureProductId,
            warehouseId: fixtureWarehouseId,
            unitId: fixtureUnitId,
            quantity: 2,
            unitPrice: '18.50',
            allocationMode: 'auto',
          },
        ],
        discountAmount: '0.00',
        roundOffAmount: '0.00',
      }),
    });
    assert.equal(orderRes.status, 201, 'Draft order fixture creation must succeed');
    const draftOrder = (await orderRes.json()) as { id: string; version: number };

    const confirmRes = await fetch(`${API_BASE}/orders/${draftOrder.id}/confirm`, {
      method: 'POST',
      headers: writeHeaders(adminCsrf, adminCookie),
      body: JSON.stringify({ expectedVersion: draftOrder.version }),
    });
    assert.equal(confirmRes.status, 200, 'Fixture order confirmation must succeed');
    const confirmed = (await confirmRes.json()) as {
      id: string;
      orderNo: string;
      status: string;
      version: number;
      revisionId: string;
    };
    assert.equal(confirmed.status, 'confirmed');
    fixtureOrderId = confirmed.id;
    fixtureOrderNo = confirmed.orderNo;
    oldRevisionId = confirmed.revisionId;

    const reviseRes = await fetch(`${API_BASE}/orders/${fixtureOrderId}/revisions`, {
      method: 'POST',
      headers: writeHeaders(adminCsrf, adminCookie),
      body: JSON.stringify({
        expectedVersion: confirmed.version,
        reason: 'E2E 验收：更正配送数量',
        lineChanges: [
          {
            op: 'add',
            line: {
              clientLineId: 'e2e-print-line-2',
              productId: fixtureProductId,
              warehouseId: fixtureWarehouseId,
              unitId: fixtureUnitId,
              quantity: 1,
              unitPrice: '18.50',
              allocationMode: 'auto',
            },
          },
        ],
      }),
    });
    assert.equal(reviseRes.status, 201, 'Fixture order correction must succeed');
    const revised = (await reviseRes.json()) as { revisionId: string; status: string };
    assert.equal(revised.status, 'confirmed');
    currentRevisionId = revised.revisionId;
    assert.notEqual(currentRevisionId, oldRevisionId, 'Corrected revision UUID must differ from the confirmed one');

    const revsRes = await fetch(`${API_BASE}/orders/${fixtureOrderId}/revisions`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(revsRes.status, 200, 'Fixture order revisions must be readable');
    const revsData = (await revsRes.json()) as {
      items: { revisionId: string; revisionNo: number; isCurrent: boolean }[];
    };
    const oldRev = revsData.items.find(r => r.revisionId === oldRevisionId);
    const newRev = revsData.items.find(r => r.revisionId === currentRevisionId);
    assert.ok(oldRev, 'Confirmed revision must be present in revision history');
    assert.ok(newRev, 'Corrected revision must be present in revision history');
    assert.equal(oldRev!.isCurrent, false, 'Confirmed revision must be non-current after correction');
    assert.equal(newRev!.isCurrent, true, 'Corrected revision must be the current revision');
    assert.ok(revsData.items.length >= 2, 'Correction must yield at least two revisions');

    // 5. Two real isolated templates; A keeps its initial version UUID for the old reprint.
    const createTemplate = async (name: string): Promise<PrintTemplate> => {
      const payload = parseSchema('TemplateCreate', { name, config: getDefaultPrintConfig() });
      const res = await fetch(`${API_BASE}/print-templates`, {
        method: 'POST',
        headers: writeHeaders(adminCsrf, adminCookie),
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 201, `Template creation must succeed: ${name}`);
      return (await res.json()) as PrintTemplate;
    };

    tplA = await createTemplate(`E2E打印独立非默认模板A-${suffix}`);
    assert.equal(tplA.isDefault, false, 'Template A must be non-default');
    oldTemplateVersionId = tplA.currentTemplateVersionId;
    assert.ok(oldTemplateVersionId, 'Template A initial version UUID must be captured');

    tplB = await createTemplate(`E2E打印独立非默认模板B-${suffix}`);
    assert.equal(tplB.isDefault, false, 'Template B must be non-default');
    assert.notEqual(tplB.id, tplA.id, 'Templates A and B must be distinct');

    // 6. Creating fixtures must not change the default template across full pagination.
    const afterTpls = await readAllTemplates();
    const afterDefaults = afterTpls.filter(t => t.isDefault);
    assert.equal(afterDefaults.length, 1, 'Fixture templates must not add or remove defaults');
    assert.equal(afterDefaults[0]!.id, originalDefaultId, 'Original default template ID must remain unchanged');
    assert.ok(afterTpls.some(t => t.id === tplA.id), 'Template A must be discoverable by full pagination');
    assert.ok(afterTpls.some(t => t.id === tplB.id), 'Template B must be discoverable by full pagination');

    browser = await chromium.launch(getLaunchOptions());
  });

  after(async () => {
    if (browser) {
      await browser.close().catch(() => {});
    }
  });

  test('1. Template editing (4 areas), published version verification & true old order revision + old template version reprint', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    // Headless cannot show the native dialog: stub only the software print dialog,
    // the production print-job API call below stays real.
    await context.addInitScript(() => {
      Object.defineProperty(window, 'print', { value: () => {}, configurable: true });
    });
    const page = await loginAs(context, creds.admin);

    try {
      const readAllTemplates = async (): Promise<PrintTemplate[]> => {
        const all: PrintTemplate[] = [];
        let cursor: string | undefined = undefined;
        do {
          const url = new URL(`${API_BASE}/print-templates`);
          url.searchParams.set('limit', '50');
          if (cursor) url.searchParams.set('cursor', cursor);
          const res = await fetch(url.toString(), { headers: { Origin: ORIGIN, Cookie: adminCookie } });
          assert.equal(res.status, 200, 'Template page read must succeed');
          const pageData = (await res.json()) as { items: PrintTemplate[]; nextCursor: string | null };
          all.push(...pageData.items);
          cursor = pageData.nextCursor || undefined;
        } while (cursor);
        return all;
      };

      const beforePublish = await readAllTemplates();
      const beforeDefaults = beforePublish.filter(t => t.isDefault);
      assert.equal(beforeDefaults.length, 1);
      assert.equal(beforeDefaults[0]!.id, originalDefaultId, 'Default template must be stable before publishing');

      await openPrintPreview(page, fixtureOrderNo);

      // 1.2 Open the real template manager and select the isolated template.
      await page.locator('button:has-text("模板配置")').click();
      await page.waitForSelector('.print-template-grid', { timeout: 10000 });
      const tplOption = page.locator('.print-template-grid').getByText(tplA.name, { exact: true });
      await tplOption.waitFor({ state: 'visible', timeout: 8000 });
      await tplOption.click();
      await page.waitForSelector('text=1. 纸张与边距配置 (Paper)', { timeout: 8000 });

      // 1.3 Real UI edits across all 4 configuration areas.
      await page.locator('.card:has-text("1. 纸张与边距配置") select').first().selectOption('A5');
      await page.locator('.card:has-text("1. 纸张与边距配置") select').nth(1).selectOption('landscape');
      await page.locator('.card:has-text("1. 纸张与边距配置") input[type="number"]').first().fill('6');

      const addCompanyAddressBtn = page.locator(
        '.card:has-text("2. 表头信息白名单与顺序") button:has-text("+ 企业地址")'
      );
      await addCompanyAddressBtn.waitFor({ state: 'visible', timeout: 8000 });
      await addCompanyAddressBtn.click();
      await page
        .locator('.card:has-text("2. 表头信息白名单与顺序") span:has-text("(companyAddress)")')
        .first()
        .waitFor({ state: 'visible' });

      await page
        .locator('.card:has-text("3. 表格列配置与列宽顺序") table tbody tr:first-child input[type="number"]')
        .fill('36');
      await page.locator('.card:has-text("4. 最小行高与单据备注") input[type="number"]').fill('12');

      // 1.4 Save via the real UI and capture the authentic POST version response.
      const savePromise = page.waitForResponse(
        res =>
          res.url().includes(`/print-templates/${tplA.id}/versions`) &&
          res.request().method() === 'POST' &&
          res.status() === 201,
        { timeout: 15000 }
      );
      await page.locator('button:has-text("保存并发布为新版本")').click();
      const saveRes = await savePromise;
      assert.equal(saveRes.status(), 201, 'Saving a new template version via UI must return HTTP 201');
      const savedTpl = (await saveRes.json()) as PrintTemplate;
      const newVersionId = savedTpl.currentTemplateVersionId;
      assert.ok(newVersionId, 'Newly published template version UUID must be present');
      assert.notEqual(newVersionId, oldTemplateVersionId, 'Published version must differ from the initial version');
      await page.waitForSelector('text=新版本已成功创建发布', { timeout: 8000 });

      // 1.5 Server verification: every one of the 4 saved areas matches item by item.
      const verListRes = await fetch(`${API_BASE}/print-templates/${tplA.id}/versions`, {
        headers: { Origin: ORIGIN, Cookie: adminCookie },
      });
      assert.equal(verListRes.status, 200);
      const verListData = (await verListRes.json()) as { items: PrintTemplateVersion[] };
      const serverVersion = verListData.items.find(v => v.id === newVersionId);
      assert.ok(serverVersion, 'Persisted version must exist in the server version list');
      const oldServerVersion = verListData.items.find(v => v.id === oldTemplateVersionId);
      assert.ok(oldServerVersion, 'Initial version must still exist for the old-template reprint');
      assert.notEqual(oldServerVersion!.id, newVersionId, 'Old version UUID must differ from the published one');
      assert.notEqual(
        oldServerVersion!.config.paper.size,
        serverVersion!.config.paper.size,
        'Old version config must genuinely differ from the newly published config'
      );
      assert.equal(serverVersion!.config.paper.size, 'A5', 'Saved paper size must be A5');
      assert.equal(serverVersion!.config.paper.orientation, 'landscape', 'Saved orientation must be landscape');
      assert.equal(serverVersion!.config.paper.marginMm, 6, 'Saved margin must be 6mm');
      assert.equal(serverVersion!.config.minRowHeightMm, 12, 'Saved min row height must be 12mm');
      assert.equal(serverVersion!.config.columns[0]?.widthMm, 36, 'Saved column[0] width must be 36mm');
      assert.ok(serverVersion!.config.headerFields.includes('companyAddress'), 'Saved header fields must include companyAddress');
      assert.equal(
        serverVersion!.config.headerFields.filter(f => f === 'companyAddress').length,
        1,
        'companyAddress must appear exactly once'
      );

      // Default template must be unchanged across the full cursor after publishing.
      const afterPublish = await readAllTemplates();
      const afterDefaults = afterPublish.filter(t => t.isDefault);
      assert.equal(afterDefaults.length, 1, 'Publishing must not add or remove defaults');
      assert.equal(afterDefaults[0]!.id, originalDefaultId, 'Default template ID must be unchanged after publishing');
      assert.ok(afterPublish.some(t => t.id === tplA.id), 'Template A must remain reachable via full pagination');

      // 1.6 Close the manager and bind the genuinely old order revision + old template version.
      await page.locator('button:has-text("关闭")').first().click();
      await page.waitForSelector('.printable-sheet', { timeout: 10000 });

      const tplSelect = page
        .locator('.print-version-bar > div')
        .filter({ has: page.locator('span', { hasText: '出库模板：' }) })
        .locator('select');
      await tplSelect.selectOption(tplA.id);
      await page.waitForTimeout(600);

      // Record real print-data traffic so a miss reports the actual URLs instead of a bare timeout.
      const printDataTraffic: string[] = [];
      const onPrintDataResponse = (res: any) => {
        if (res.url().includes('/print-data')) printDataTraffic.push(`${res.status()} ${res.url()}`);
      };
      page.on('response', onPrintDataResponse);

      const revSelect = page
        .locator('.print-version-bar > div')
        .filter({ has: page.locator('span', { hasText: '订单版本：' }) })
        .locator('select');
      await revSelect.waitFor({ state: 'visible', timeout: 8000 });

      const revisionBoundPromise = page.waitForResponse(
        res =>
          res.url().includes('/print-data') &&
          res.url().includes(`revisionId=${oldRevisionId}`) &&
          res.status() === 200,
        { timeout: 15000 }
      );
      await revSelect.selectOption(oldRevisionId);
      let revisionBoundRes;
      try {
        revisionBoundRes = await revisionBoundPromise;
      } catch {
        throw new Error(
          `Old order revision print-data was not observed. Traffic: ${JSON.stringify(printDataTraffic)}; ` +
            `revisionOptions=${JSON.stringify(await revSelect.locator('option').evaluateAll(opts => opts.map(o => (o as HTMLOptionElement).value)))}; ` +
            `selectedValue=${await revSelect.inputValue()}`
        );
      }
      assert.equal(revisionBoundRes.status(), 200, 'Old order revision print-data must return 200');

      const verSelect = page
        .locator('.print-version-bar > div')
        .filter({ has: page.locator('span', { hasText: '模板版本：' }) })
        .locator('select');
      await verSelect.waitFor({ state: 'visible', timeout: 8000 });
      // The old version must be a real, selectable option in the version dropdown.
      await verSelect
        .locator(`option[value="${oldTemplateVersionId}"]`)
        .waitFor({ state: 'attached', timeout: 10000 });

      // If the dropdown already shows the old version, move it to the published one
      // first so the old-version selection below is a genuine change event.
      if ((await verSelect.inputValue()) === oldTemplateVersionId) {
        const newVersionPromise = page.waitForResponse(
          res =>
            res.url().includes('/print-data') &&
            res.url().includes(`templateVersionId=${newVersionId}`) &&
            res.url().includes(`revisionId=${oldRevisionId}`) &&
            res.status() === 200,
          { timeout: 15000 }
        );
        await verSelect.selectOption(newVersionId);
        assert.equal((await newVersionPromise).status(), 200, 'New version + old revision print-data must return 200');
      }

      // Keep recording real print-data traffic for the version selection too.
      printDataTraffic.length = 0;
      const printDataPromise = page.waitForResponse(
        res =>
          res.url().includes('/print-data') &&
          res.url().includes(`templateVersionId=${oldTemplateVersionId}`) &&
          res.url().includes(`revisionId=${oldRevisionId}`) &&
          res.status() === 200,
        { timeout: 15000 }
      );
      await verSelect.selectOption(oldTemplateVersionId);
      let printDataRes;
      try {
        printDataRes = await printDataPromise;
      } catch {
        throw new Error(
          `Old template version print-data request was not observed. Traffic: ${JSON.stringify(printDataTraffic)}; ` +
            `selectedTemplateVersion=${oldTemplateVersionId}; selectedRevision=${oldRevisionId}`
        );
      }
      assert.equal(printDataRes.status(), 200);
      const requestUrl = printDataRes.request().url();
      assert.ok(requestUrl.includes(`templateVersionId=${oldTemplateVersionId}`), 'Request must pin the old template version UUID');
      assert.ok(requestUrl.includes(`revisionId=${oldRevisionId}`), 'Request must pin the old order revision UUID');

      const printData = parseSchema('PrintData', await printDataRes.json());
      assert.equal(printData.templateVersionId, oldTemplateVersionId, 'PrintData must bind the old template version UUID');
      assert.equal(printData.order.revisionId, oldRevisionId, 'PrintData must bind the old order revision UUID');
      assert.notEqual(printData.order.revisionId, currentRevisionId, 'Bound revision must not be the current one');
      assert.equal(printData.isCurrentOrderRevision, false, 'Old revision must be reported as non-current');
      // The old template version's own persisted config must be what is rendered/printed.
      const oldConfig = oldServerVersion!.config;
      assert.equal(printData.config.paper.size, oldConfig.paper.size, 'PrintData paper size must match the old version config');
      assert.equal(
        printData.config.paper.orientation,
        oldConfig.paper.orientation,
        'PrintData orientation must match the old version config'
      );
      assert.equal(printData.config.paper.marginMm, oldConfig.paper.marginMm, 'PrintData margin must match the old version config');
      assert.equal(
        printData.config.minRowHeightMm,
        oldConfig.minRowHeightMm,
        'PrintData min row height must match the old version config'
      );
      assert.equal(
        printData.config.columns[0]?.widthMm,
        oldConfig.columns[0]?.widthMm,
        'PrintData column[0] width must match the old version config'
      );
      assert.deepEqual(
        printData.config.headerFields,
        oldConfig.headerFields,
        'PrintData header fields must match the old version config'
      );

      const pageStyle = await page.evaluate(
        () => document.getElementById('dynamic-order-print-page-style')?.textContent
      );
      assert.ok(
        pageStyle?.includes(`${oldConfig.paper.size} ${oldConfig.paper.orientation}`),
        `Injected @page style must reflect the old version page rule (${oldConfig.paper.size} ${oldConfig.paper.orientation})`
      );
      assert.ok(
        pageStyle?.includes(`margin: ${oldConfig.paper.marginMm}mm`),
        `Injected @page style must reflect the old version margin (${oldConfig.paper.marginMm}mm)`
      );

      // 1.7 Production print handler: a real print-job POST pinned to both old UUIDs.
      const jobRequestPromise = page.waitForRequest(
        req => req.url().includes(`/orders/${fixtureOrderId}/print-jobs`) && req.method() === 'POST',
        { timeout: 15000 }
      );
      const jobResponsePromise = page.waitForResponse(
        res =>
          res.url().includes(`/orders/${fixtureOrderId}/print-jobs`) &&
          res.request().method() === 'POST' &&
          (res.status() === 200 || res.status() === 201),
        { timeout: 15000 }
      );
      await page.locator('button:has-text("调起打印机")').click();
      const jobRequest = await jobRequestPromise;
      const jobResponse = await jobResponsePromise;
      const jobBody = parseSchema('PrintJobInput', jobRequest.postDataJSON());
      assert.equal(jobBody.orderRevisionId, oldRevisionId, 'Print job must pin the old order revision UUID');
      assert.equal(jobBody.templateVersionId, oldTemplateVersionId, 'Print job must pin the old template version UUID');
      const job = parseSchema('PrintJob', await jobResponse.json());
      assert.equal(job.status, 'requested', 'Print job must start as requested (software print chain only)');
      assert.equal(job.orderRevisionId, oldRevisionId);
      assert.equal(job.templateVersionId, oldTemplateVersionId);

      // Cancel through the UI so no dangling requested job remains.
      const cancelPromise = page.waitForResponse(
        res => res.url().includes(`/print-jobs/${job.id}/status`) && res.request().method() === 'PATCH' && res.status() === 200,
        { timeout: 15000 }
      );
      await page.locator('button:has-text("取消出纸")').click();
      const cancelled = parseSchema('PrintJob', await (await cancelPromise).json());
      assert.equal(cancelled.status, 'user_cancelled', 'Manual cancel must persist on the print job');
    } finally {
      await context.close();
    }
  });

  test('1b. Admin A→B template switch: a late template-A versions response never overwrites template B', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await loginAs(context, creds.admin);

    try {
      const readAllTemplates = async (): Promise<PrintTemplate[]> => {
        const all: PrintTemplate[] = [];
        let cursor: string | undefined = undefined;
        do {
          const url = new URL(`${API_BASE}/print-templates`);
          url.searchParams.set('limit', '50');
          if (cursor) url.searchParams.set('cursor', cursor);
          const res = await fetch(url.toString(), { headers: { Origin: ORIGIN, Cookie: adminCookie } });
          assert.equal(res.status, 200, 'Template page read must succeed');
          const pageData = (await res.json()) as { items: PrintTemplate[]; nextCursor: string | null };
          all.push(...pageData.items);
          cursor = pageData.nextCursor || undefined;
        } while (cursor);
        return all;
      };

      // Real current template states from the API (A already has 2 versions, B has 1).
      const allTpls = await readAllTemplates();
      const tplAState = allTpls.find(t => t.id === tplA.id);
      const tplBState = allTpls.find(t => t.id === tplB.id);
      assert.ok(tplAState, 'Template A must exist');
      assert.ok(tplBState, 'Template B must exist');
      assert.notEqual(tplAState!.config.paper.size, tplBState!.config.paper.size, 'A and B must differ in paper config for this check');

      await openPrintPreview(page, fixtureOrderNo);
      await page.locator('button:has-text("模板配置")').click();
      await page.waitForSelector('.print-template-grid', { timeout: 10000 });

      // Delay only template A's real versions response; keep fetching the real API.
      let releaseA: () => void = () => {};
      const releasePromise = new Promise<void>(resolve => {
        releaseA = resolve;
      });
      let delayedAResponses = 0;
      const delayedRoute = `**/api/v1/print-templates/${tplA.id}/versions*`;
      await page.route(delayedRoute, async route => {
        delayedAResponses++;
        const response = await route.fetch();
        await releasePromise;
        await route.fulfill({ response });
      });

      const aRequestPromise = page.waitForRequest(
        req => req.url().includes(`/print-templates/${tplA.id}/versions`),
        { timeout: 15000 }
      );
      const aOption = page.locator('.print-template-grid').getByText(tplA.name, { exact: true });
      await aOption.waitFor({ state: 'visible', timeout: 8000 });
      await aOption.click();
      await aRequestPromise;

      // Switch to B while A's response is still held back.
      const bVersionsPromise = page.waitForResponse(
        res => res.url().includes(`/print-templates/${tplB.id}/versions`) && res.status() === 200,
        { timeout: 15000 }
      );
      const bOption = page.locator('.print-template-grid').getByText(tplB.name, { exact: true });
      await bOption.waitFor({ state: 'visible', timeout: 8000 });
      await bOption.click();
      assert.equal((await bVersionsPromise).status(), 200, 'Template B versions must load from the real API');
      await page.getByText(`当前配置版本: v${tplBState!.currentTemplateVersionNo}`).first().waitFor({ state: 'visible', timeout: 10000 });

      const paperCard = page.locator('.card:has-text("1. 纸张与边距配置") select').first();
      assert.equal(await paperCard.inputValue(), tplBState!.config.paper.size, 'Editor must show template B paper config');

      // Release the late A response and assert B remains fully selected.
      assert.ok(delayedAResponses >= 1, 'Template A versions request must have been intercepted');
      releaseA();
      await page.waitForTimeout(1200);

      await page.getByText(`当前配置版本: v${tplBState!.currentTemplateVersionNo}`).first().waitFor({ state: 'visible', timeout: 5000 });
      assert.equal(await paperCard.inputValue(), tplBState!.config.paper.size, 'Late A response must not overwrite B config');
      const managerText = await page.locator('.print-template-grid').innerText();
      assert.ok(managerText.includes(tplB.name), 'Template B must remain selected after the late A response');
      // A's published v2 row must never appear under B (B has exactly one version).
      assert.ok(!/v2\s*\(/.test(managerText), 'Late A versions must not be rendered under template B');

      await page.unroute(delayedRoute);
    } finally {
      await context.close();
    }
  });

  test('2. AI clarification free-text, review snapshot via the same run ID, and authentic source navigation', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await loginAs(context, creds.admin);

    try {
      // 2.1 Authentic live report run and its real sources.
      const repRes = await fetch(`${API_BASE}/reports/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          'X-CSRF-Token': adminCsrf,
          Cookie: adminCookie,
        },
        body: JSON.stringify({ kind: 'sales_summary', period: { mode: 'mtd_previous' } }),
      });
      assert.equal(repRes.status, 200, 'Real baseline report snapshot must be created');
      const realReport = (await repRes.json()) as Record<string, any>;
      assert.ok(realReport.id, 'Real report must have an ID');

      const sourcesRes = await fetch(`${API_BASE}/report-runs/${realReport.id}/sources`, {
        headers: { Origin: ORIGIN, Cookie: adminCookie },
      });
      assert.equal(sourcesRes.status, 200);
      const realSources = (await sourcesRes.json()) as { items: any[] };
      assert.ok(Array.isArray(realSources.items), 'Real sources items must be an array');
      const orderSource = realSources.items.find(
        s => s.entityType === 'order_revision' || s.href?.includes('/orders/')
      );
      assert.ok(orderSource, 'Authentic report sources must include at least one order reference');

      // 2.2 Contract-validated AI fixtures built from the real report/sources.
      const clarificationRunId = crypto.randomUUID();
      const candidateClarification = {
        id: clarificationRunId,
        status: 'needs_clarification' as const,
        question: '您好，为了更精准地提供统计数据，请选择或补充具体的统计维度：',
        choices: [
          { id: 'c1', label: '按商品汇总' },
          { id: 'c2', label: '按客户汇总' },
        ],
      };
      const validatedClarification = parseSchema('AiResult', candidateClarification);
      assert.equal(validatedClarification.status, 'needs_clarification');

      const answerRunId = crypto.randomUUID();
      const candidateAiAnswer = {
        id: answerRunId,
        status: 'answered' as const,
        summary: '2026年11月累计商品销售统计结果已生成，重点客户订购量稳定，无异常退货集中风险。',
        query: realReport.query ?? realReport.normalizedQuery ?? { kind: 'sales_summary', period: { mode: 'mtd_previous' } },
        report: realReport,
        evidence: realSources.items,
      };
      const validatedAiAnswer = parseSchema('AiResult', candidateAiAnswer);
      assert.equal(validatedAiAnswer.status, 'answered');

      // 2.3 First ask -> clarification; free-text reply -> answered.
      let askCallCount = 0;
      let capturedClarificationPayload: any = null;
      const aiRoute = '**/api/v1/ai/queries';
      await page.route(aiRoute, async route => {
        askCallCount++;
        if (askCallCount === 1) {
          await route.fulfill({ json: validatedClarification });
        } else {
          capturedClarificationPayload = JSON.parse(route.request().postData() || '{}');
          await route.fulfill({ json: validatedAiAnswer });
        }
      });

      await page.locator('text="AI 智能统计"').first().click();
      await page.waitForSelector('input[placeholder*="例如："]', { timeout: 10000 });

      const initialQuestionText = '分析上月销售异常订单与客户情况';
      const qInput = page.locator('input[placeholder*="例如："]').first();
      await qInput.fill(initialQuestionText);
      await page.locator('button:has-text("提交统计问题")').click();
      await page.waitForSelector('text=需要进一步澄清统计口径', { timeout: 8000 });

      const freeTextReply = '重点核查食品百货大类且降幅超过20%的客户';
      const freeTextInput = page.locator('input[placeholder*="输入具体客户名称"]');
      await freeTextInput.waitFor({ state: 'visible', timeout: 8000 });
      await freeTextInput.fill(freeTextReply);
      await page.locator('button:has-text("提交补充说明")').click();
      await page.waitForSelector('text=AI 经营分析结论', { timeout: 10000 });

      assert.ok(capturedClarificationPayload, 'Free-text clarification request must be sent');
      assert.equal(capturedClarificationPayload.question, initialQuestionText, 'Clarification must bind the original question');
      assert.equal(capturedClarificationPayload.clarificationRunId, clarificationRunId, 'Clarification must send the exact run ID');
      assert.equal(capturedClarificationPayload.clarificationAnswer, freeTextReply, 'Clarification must send the exact free-text answer');
      await page.unroute(aiRoute);

      // 2.4 Review the same complete run ID: GET only, zero new POST /reports/query.
      let newPostQueryCount = 0;
      const postQueryMonitor = (req: any) => {
        if (req.url().includes('/reports/query') && req.method() === 'POST') newPostQueryCount++;
      };
      page.on('request', postQueryMonitor);

      const reportGetPromise = page.waitForResponse(
        res =>
          res.url().includes(`/report-runs/${realReport.id}`) &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 15000 }
      );
      await page.locator('button:has-text("在普通报表中复核此快照")').click();
      const reportGetRes = await reportGetPromise;
      const reportGetData = (await reportGetRes.json()) as { id: string };
      assert.equal(reportGetData.id, realReport.id, 'Loaded snapshot ID must match the authentic run ID');
      await page.waitForSelector('text=查看事实依据来源', { timeout: 10000 });
      assert.equal(newPostQueryCount, 0, 'Opening the snapshot must issue ZERO new POST /reports/query');
      page.off('request', postQueryMonitor);

      // 2.5 Real source drilldown to the exact order revision.
      await page.locator('button:has-text("查看事实依据来源")').click();
      await page.waitForSelector('.report-table', { timeout: 10000 });
      const orderSourceBtn = page.locator('.report-table tbody button').filter({ hasText: '/orders/' }).first();
      await orderSourceBtn.waitFor({ state: 'visible', timeout: 8000 });
      const targetSourceHref = (await orderSourceBtn.textContent())?.trim();
      assert.ok(targetSourceHref, 'Order source button must display a non-empty href');
      const hrefMatch = /^\/api\/v1\/orders\/([^/]+)\/revisions\/([^/?#]+)$/.exec(targetSourceHref!);
      assert.ok(hrefMatch, `Order source href must be an exact order revision path, got ${targetSourceHref}`);
      const sourceOrderId = hrefMatch![1]!;
      const sourceRevisionId = hrefMatch![2]!;

      const orderGetPromise = page.waitForResponse(
        res =>
          res.url().includes(`/orders/${sourceOrderId}/revisions/${sourceRevisionId}`) &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 15000 }
      );
      await orderSourceBtn.click();
      assert.equal((await orderGetPromise).status(), 200, 'Clicking the source must fetch the exact revision');
      await page.waitForSelector('text=【历史版本只读快照', { timeout: 15000 });
      const orderPageText = await page.evaluate(() => document.body.innerText);
      assert.ok(orderPageText.includes('版本号 #v'), 'Historical snapshot banner must show the revision number');
      assert.ok(orderPageText.includes('返回当前生效版本'), 'Historical snapshot page must expose the return-to-current action');
      assert.ok(!orderPageText.includes('订单不存在或已被删除'), 'Navigated order must load successfully');

      // 2.6 Real 503 boundary: AI provider unavailable must not fabricate data.
      await page.route(aiRoute, async route => {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'AI_PROVIDER_UNAVAILABLE', message: 'AI 模型服务暂不可用' }),
        });
      });
      await page.locator('text="AI 智能统计"').first().click();
      const fallbackQInput = page.locator('input[placeholder*="例如："]').first();
      await fallbackQInput.waitFor({ state: 'visible', timeout: 10000 });
      await fallbackQInput.fill('本月销售总额与毛利如何？');
      await page.locator('button:has-text("提交统计问题")').click();
      await page.waitForSelector('text=如遇 AI 模型未配置', { timeout: 10000 });
      await page.locator('button:has-text("转为固定业务报表查询")').first().waitFor({ state: 'visible', timeout: 8000 });
      await page.unroute(aiRoute);
    } finally {
      await context.close();
    }
  });

  test('3. Employee print preview: default print-data only, zero management requests, no cost leakage', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      Object.defineProperty(window, 'print', { value: () => {}, configurable: true });
    });
    const page = await loginAs(context, creds.employee);

    try {
      const managementRequests: string[] = [];
      page.on('request', req => {
        const url = req.url();
        if (url.includes('/print-templates')) managementRequests.push(url);
      });

      const printDataPromise = page.waitForResponse(
        res =>
          res.url().includes(`/orders/${fixtureOrderId}/print-data`) &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 20000 }
      );
      await openPrintPreview(page, fixtureOrderNo);
      const printDataRes = await printDataPromise;
      assert.equal(printDataRes.status(), 200, 'Employee default print-data must return 200');
      assert.ok(
        !printDataRes.request().url().includes('templateVersionId='),
        'Employee preview must use the server default template (no templateVersionId query)'
      );

      const printData = parseSchema('PrintData', await printDataRes.json());
      parseSchema('OrderPublic', printData.order);
      parseSchema('PrintConfig', printData.config);
      assert.equal(printData.order.status, 'confirmed', 'Employee preview must be printable for the confirmed order');
      assert.ok(printData.templateVersionId, 'Default template version must be present');
      assert.equal(printData.isCurrentOrderRevision, true, 'Employee default preview must bind the current revision');

      // Give the mount effects a moment to settle, then assert no management traffic.
      await page.waitForTimeout(800);
      assert.equal(managementRequests.length, 0, `Employee preview must issue ZERO template-management requests: ${managementRequests.join(',')}`);
      assert.equal(await page.locator('button:has-text("模板配置")').count(), 0, 'Employee must not see template management controls');
      assert.equal(await page.locator('text=已定义模板').count(), 0, 'Employee must not see the template management sidebar');

      // Cost/gross-margin must not appear inside the printable document itself.
      const sheetText = (await page.locator('.printable-sheet').first().innerText()).trim();
      assert.ok(!sheetText.includes('成本'), 'Printable document must not leak cost');
      assert.ok(!sheetText.includes('毛利'), 'Printable document must not leak gross margin');
      assert.ok(!/成本|毛利|进价/.test(JSON.stringify(printData)), 'Employee print-data payload must not contain cost fields');
      const serialized = JSON.stringify(printData);
      assert.ok(!/"unitCost"|"costPrice"|"grossMargin"/.test(serialized), 'Employee print-data payload must not contain cost keys');
    } finally {
      await context.close();
    }
  });
});
