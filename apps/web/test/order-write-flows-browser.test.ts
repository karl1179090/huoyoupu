import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createComparisonReportFixture } from '../../api/test/support/comparison-report-fixture.js';

const BASE_URL = process.env.HYP_BASE_URL || 'http://localhost:5173';
const SCREENSHOT_DIR = path.resolve('docs/ui/build-web-inventory-v1/implementation');

type Fixture = Awaited<ReturnType<typeof createComparisonReportFixture>>;

type Recorded = {
  method: string;
  path: string;
  key?: string;
  body?: any;
  status?: number;
  response?: any;
};

type AbortDecision = 'pass' | 'abort-before' | 'abort-after';

function getLaunchOptions(): Parameters<typeof chromium.launch>[0] {
  const edgeMac = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
  const edgeLinux = '/usr/bin/microsoft-edge';
  let executablePath: string | undefined;
  if (fs.existsSync(edgeMac)) executablePath = edgeMac;
  else if (fs.existsSync(edgeLinux)) executablePath = edgeLinux;
  return { headless: true, executablePath };
}

/** Forwards every page /api/v1/** call to the fixture's own PG+HTTP; aborts stay fixture-bound. */
async function installProxy(
  context: BrowserContext,
  fixture: Fixture,
  recorder: Recorded[],
  decide: (entry: Recorded) => AbortDecision
): Promise<void> {
  await context.route('**/api/v1/**', async route => {
    try {
      const request = route.request();
      const url = new URL(request.url());
      const target = new URL(url.pathname + url.search, fixture.apiOrigin);
      const headers = await request.allHeaders();
      let body: any;
      try {
        body = request.postDataJSON();
      } catch {
        body = undefined;
      }
      const entry: Recorded = {
        method: request.method(),
        path: url.pathname,
        key: headers['idempotency-key'],
        body,
      };
      recorder.push(entry);
      const decision = decide(entry);
      if (decision === 'abort-before') {
        // Never reaches any server: the write stays uncommitted.
        await route.abort('failed');
        return;
      }
      const response = await route.fetch({ url: target.toString() });
      entry.status = response.status();
      entry.response = await response.json().catch(() => undefined);
      if (decision === 'abort-after') {
        // Real write already committed on the fixture; only the browser response is lost.
        await route.abort('failed');
        return;
      }
      const responseHeaders = response.headers();
      for (const drop of ['content-encoding', 'content-length', 'transfer-encoding']) delete responseHeaders[drop];
      await route.fulfill({ status: response.status(), headers: responseHeaders, body: await response.body() });
    } catch (error) {
      // Context teardown can dispose an in-flight route; never surface that as a business failure.
      await route.abort('failed').catch(() => undefined);
      if (String(error).includes('disposed')) return;
      throw error;
    }
  });
}

/** Node-side admin API bound strictly to the fixture origin (never the shared dev API). */
function createAdminApi(fixture: Fixture) {
  const cookies = new Map<string, string>();
  let csrf = '';
  async function call<T = any>(method: string, endpoint: string, body?: object, expected = 200): Promise<T> {
    const headers: Record<string, string> = { origin: BASE_URL };
    if (csrf) headers['x-csrf-token'] = csrf;
    if (cookies.size) headers.cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    if (body) {
      headers['content-type'] = 'application/json';
      headers['idempotency-key'] = randomUUID();
    }
    const response = await fetch(fixture.apiOrigin + '/api/v1' + endpoint, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const index = pair!.indexOf('=');
      cookies.set(pair!.slice(0, index), pair!.slice(index + 1));
    }
    assert.equal(response.status, expected, `Fixture admin API ${method} ${endpoint}`);
    if (expected === 204) return undefined as T;
    return (await response.json()) as T;
  }
  return {
    async login(credentials: { loginName: string; password: string }) {
      csrf = ((await call('GET', '/auth/session')) as { csrfToken: string }).csrfToken;
      csrf = ((await call('POST', '/auth/login', credentials)) as { csrfToken: string }).csrfToken;
    },
    get: <T = any>(endpoint: string) => call<T>('GET', endpoint),
    post: <T = any>(endpoint: string, body: object, expected = 201) => call<T>('POST', endpoint, body, expected),
  };
}

async function loginAsAdmin(page: Page, credentials: { loginName: string; password: string }): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.locator('input[placeholder*="管理员或员工账号"]').fill(credentials.loginName);
  await page.locator('input[placeholder*="请输入密码"]').fill(credentials.password);
  await page.locator('button[type="submit"]').first().click();
  await page.locator('text=销售开单工作台').first().waitFor({ state: 'visible', timeout: 20000 });
}

async function navigateTo(page: Page, orderId: string): Promise<void> {
  await page.evaluate(id => {
    window.dispatchEvent(new CustomEvent('huoyoupu:navigate', { detail: { href: `/orders/${id}` } }));
  }, orderId);
}

async function selectCustomer(page: Page, customerName: string, addressText?: string): Promise<void> {
  await page.click('button:has-text("选择客户与地址"), button:has-text("更换客户/地址"), button:has-text("更换客户 / 配送信息")');
  await page.waitForSelector('text=选择客户与配送地址');
  await page.fill('.modal-body input[placeholder*="搜索客户"]', customerName);
  const row = page.locator('.modal-body div[style*="cursor: pointer"]').filter({ hasText: customerName }).first();
  await row.waitFor({ state: 'visible', timeout: 8000 });
  await row.click();
  if (addressText) {
    const addressCard = page.locator('.modal-body div[style*="cursor: pointer"]').filter({ hasText: addressText }).first();
    await addressCard.waitFor({ state: 'visible', timeout: 8000 });
    await addressCard.click();
  }
  await page.locator('.modal-footer button:has-text("确认选用该客户")').click();
  await page.waitForSelector('.modal-overlay', { state: 'detached' });
}

function createLineRows(page: Page, productName: string) {
  return page.locator('div.hide-mobile[style*="grid-template-columns"]').filter({ hasText: productName });
}

async function fillLine(page: Page, productName: string, index: number, values: { quantity?: string; price?: string }): Promise<void> {
  const row = createLineRows(page, productName).nth(index);
  await row.waitFor({ state: 'visible', timeout: 8000 });
  const inputs = row.locator('input.tabular-nums');
  if (values.quantity !== undefined) await inputs.nth(0).fill(values.quantity);
  if (values.price !== undefined) await inputs.nth(1).fill(values.price);
}

/** Adds N independent picker lines of the fixture SKU, each with its own price. */
async function addPickerLines(page: Page, fixture: Fixture, lines: { price: string }[]): Promise<void> {
  await page.click('button:has-text("批量添加商品")');
  await page.waitForSelector('text=批量选品与配置');
  const search = page.locator('.picker-modal-body input[placeholder*="搜索商品"]');
  await search.waitFor({ state: 'visible', timeout: 8000 });
  for (let i = 0; i < lines.length; i++) {
    await search.fill(fixture.product.name);
    const row = page
      .locator('.picker-catalog-col div[style*="cursor: pointer"]')
      .filter({ hasText: fixture.product.name })
      .first();
    await row.waitFor({ state: 'visible', timeout: 8000 });
    const addBtn = row.getByRole('button', { name: '添加' });
    await addBtn.click();
    await page.getByRole('button', { name: new RegExp(`确认加入订单\\s*\\(${i + 1}\\s*行\\)`) }).waitFor({ state: 'visible', timeout: 8000 });
    const card = page.locator('.picker-lines-scroll > div').nth(i);
    await card.waitFor({ state: 'visible', timeout: 8000 });
    const priceInput = card.locator('input.tabular-nums').nth(1);
    await priceInput.fill(lines[i]!.price);
    await priceInput.blur();
    assert.equal(await priceInput.inputValue(), lines[i]!.price, `Picker line ${i + 1} must keep the entered price`);
  }
  const join = page.getByRole('button', { name: new RegExp(`确认加入订单\\s*\\(${lines.length}\\s*行\\)`) });
  assert.ok(await join.isEnabled(), 'Picker join must be enabled for valid configured fixture lines');
  await join.click();
  await page.waitForSelector('.modal-overlay', { state: 'detached' });
  await page.waitForSelector(`text=订单商品明细 (${lines.length} 行)`);
}

async function fillDiscount(page: Page, value: string): Promise<void> {
  // The line unit-price inputs share the 0.00 placeholder, so anchor on the real label.
  const input = page.locator('xpath=//div[normalize-space(text())="整单优惠 (元)"]/following-sibling::input[1]');
  await input.waitFor({ state: 'visible', timeout: 8000 });
  await input.fill(value);
  await input.blur();
  assert.equal(await input.inputValue(), value, 'Discount input must keep the raw entered amount');
}

async function waitForCreateTotal(page: Page, expectedTotal: string): Promise<void> {
  await page.waitForFunction(
    total => {
      const element = document.querySelector('.order-bottom-summary-text');
      return Boolean(element && (element.textContent || '').includes('¥' + total));
    },
    expectedTotal,
    { timeout: 30000 }
  );
}

/** Waits for the newest successful /orders/quote response and returns its server total. */
async function latestQuoteTotal(recorder: Recorded[]): Promise<string> {
  const quote = entries(recorder, '/api/v1/orders/quote').filter(entry => entry.status === 200).at(-1);
  assert.ok(quote, 'A real successful quote response must have been captured');
  return quote!.response.calculation.totalAmount;
}

/** Waits until the fixture has answered at least one quote, then binds the UI total to that server total. */
async function waitForQuotedTotal(page: Page, recorder: Recorded[], expected: string): Promise<Recorded> {
  const deadline = Date.now() + 30000;
  let quote: Recorded | undefined;
  while (Date.now() < deadline) {
    quote = entries(recorder, '/api/v1/orders/quote')
      .filter(entry => entry.status === 200 && entry.response?.calculation?.totalAmount === expected)
      .at(-1);
    if (quote) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(quote, `No real server quote with total ${expected} was observed; quotes=${JSON.stringify(
    entries(recorder, '/api/v1/orders/quote').map(entry => [entry.status, entry.response?.calculation?.totalAmount])
  )}`);
  await waitForCreateTotal(page, expected);
  return quote!;
}

async function waitPrimaryIdle(page: Page, label: string): Promise<void> {
  await page.waitForFunction(
    text => {
      const buttons = Array.from(document.querySelectorAll('.order-bottom-actions-bar button')) as HTMLButtonElement[];
      const button = buttons.find(candidate => (candidate.textContent || '').includes(text));
      return Boolean(button && !button.disabled && !(button.textContent || '').includes('正在'));
    },
    label,
    { timeout: 30000 }
  );
}

async function mobileBottomNavBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('nav.hide-desktop')).filter(nav => {
        const rect = (nav as HTMLElement).getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length === 1,
    undefined,
    { timeout: 8000 }
  );
  const navs = page.locator('nav.hide-desktop');
  assert.equal(await navs.count(), 1, 'There must be exactly one mobile bottom nav container');
  const box = await navs.boundingBox();
  assert.ok(box, 'Mobile bottom nav must have a bounding box');
  return box;
}

function entries(recorder: Recorded[], pathname: string, method = 'POST'): Recorded[] {
  return recorder.filter(entry => entry.method === method && entry.path === pathname);
}

describe('12.3/12.4 order write-flow boundaries on an isolated PG+HTTP fixture', () => {
  let fixture: Fixture;
  let browser: Browser;
  let api: ReturnType<typeof createAdminApi>;

  test('0. Prepare isolated fixture (private PG + dynamic HTTP) before launching a browser', async t => {
    fixture = await createComparisonReportFixture({ frontendOrigin: BASE_URL, timers: t.mock.timers });
    assert.ok(fixture.apiOrigin, 'Fixture must expose its own dynamic API origin');
    assert.notEqual(new URL(fixture.apiOrigin).port, '3000', 'Fixture API must not be the shared dev API');
    assert.equal(fixture.orders.length, 5, 'Fixture seeds exactly five confirmed historical orders');
    api = createAdminApi(fixture);
    await api.login(fixture.admin);
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    browser = await chromium.launch(getLaunchOptions());
  });

  after(async () => {
    if (browser) await browser.close().catch(() => {});
    if (fixture) await fixture.close();
  });

  test('1. Joint shortage + discount + lost create response recovers with same idempotency key/body', async () => {
    const recorder: Recorded[] = [];
    let abortCreateAfter: boolean = false;
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installProxy(context, fixture, recorder, entry => {
      if (entry.method === 'POST' && entry.path === '/api/v1/orders' && abortCreateAfter) {
        abortCreateAfter = false;
        return 'abort-after';
      }
      return 'pass';
    });
    try {
      const page = await context.newPage();
      await loginAsAdmin(page, fixture.admin);

      const customer = fixture.customers.decline;
      const orderCountBefore = ((await api.get(`/orders?customerId=${customer.id}&limit=100`)) as { items: any[] }).items.length;
      const stockBefore = await stockQuantity(api, fixture);
      const balanceBefore = await netBalance(api, customer.id);

      await selectCustomer(page, customer.name, '虚构隔离地址');
      await addPickerLines(page, fixture, [{ price: '2' }, { price: '3' }]);
      assert.equal(await createLineRows(page, fixture.product.name).count(), 2, 'Create must render two independent fixture lines');

      // Joint shortage: each line alone (20) is under the 31 remaining, together (40) exceed it.
      await fillLine(page, fixture.product.name, 0, { quantity: '20' });
      await fillLine(page, fixture.product.name, 1, { quantity: '20' });
      await page.locator('text=报价提示').first().waitFor({ state: 'visible', timeout: 25000 });
      await page.locator('text=所选仓库库存不足或需要补选批次').first().waitFor({ state: 'visible', timeout: 25000 });
      const shortageQuote = entries(recorder, '/api/v1/orders/quote').find(entry => entry.status === 409);
      assert.ok(shortageQuote, 'Joint-shortage quote must be a real 409 from the fixture API');
      const confirmBtn = page.locator('.order-bottom-actions-bar button:has-text("确认销售订单")');
      assert.equal(await confirmBtn.isDisabled(), true, 'Confirm must be disabled while the joint quote is short');
      assert.equal(entries(recorder, '/api/v1/orders').length, 0, 'No order write may be sent for a short draft');

      // Legal qty 2+2 with a raw 1 discount: the UI must normalise it to Money 1.00.
      await fillLine(page, fixture.product.name, 0, { quantity: '2' });
      await fillLine(page, fixture.product.name, 1, { quantity: '2' });
      await fillDiscount(page, '1');
      const okQuote = await waitForQuotedTotal(page, recorder, '9.00');
      await waitPrimaryIdle(page, '确认销售订单');
      assert.equal(okQuote.body.discountAmount, '1.00', 'Raw discount 1 must be sent as strict Money 1.00');
      assert.equal(okQuote.body.roundOffAmount, '0.00');
      assert.equal(okQuote.response.calculation.subtotalAmount, '10.00', 'Server subtotal must be 10.00');
      assert.equal(okQuote.response.calculation.totalAmount, '9.00', 'Server total must be 9.00 after the 1.00 discount');

      // Invalid Money input must invalidate the old valid quote and block both API writes and confirm.
      const quoteCountBeforeInvalid = entries(recorder, '/api/v1/orders/quote').length;
      for (const invalid of ['1.001', '-1']) {
        await fillDiscount(page, invalid);
        await page.locator('text=报价提示').first().waitFor({ state: 'visible', timeout: 15000 });
        await page.locator('text=金额仅支持最多两位小数的非负数值').first().waitFor({ state: 'visible', timeout: 15000 });
        assert.equal(await confirmBtn.isDisabled(), true, `Confirm must be disabled for invalid Money ${invalid}`);
        assert.equal(
          entries(recorder, '/api/v1/orders/quote').length,
          quoteCountBeforeInvalid,
          `No quote request may be sent while the discount is ${invalid}`
        );
        assert.equal(entries(recorder, '/api/v1/orders').length, 0, `No order write may be sent while the discount is ${invalid}`);
        // The previous valid total must no longer be presented as the current quote.
        assert.equal(await page.locator('.order-bottom-summary-text:has-text("¥9.00")').count(), 0,
          'The stale valid quote total must disappear for invalid Money input');
      }

      // Restoring raw 1 must re-quote the real strict Money amount.
      await fillDiscount(page, '1');
      const recoveredQuote = await waitForQuotedTotal(page, recorder, '9.00');
      await waitPrimaryIdle(page, '确认销售订单');
      assert.equal(recoveredQuote.body.discountAmount, '1.00', 'Recovered quote must also send strict Money 1.00');
      assert.equal(recoveredQuote.response.calculation.totalAmount, '9.00');
      assert.equal(await page.locator('.order-bottom-actions-bar button:has-text("确认销售订单")').isEnabled(), true,
        'Confirm must be enabled again once the discount is valid');

      // First create really commits on the fixture, then the browser response is lost.
      abortCreateAfter = true;
      await confirmBtn.click();
      await waitPrimaryIdle(page, '确认销售订单');
      assert.ok(entries(recorder, '/api/v1/orders').length >= 1, 'The lost-response create must have reached the fixture');
      // UI retry: same content, so the same intent key/body must be replayed.
      await confirmBtn.click();
      // Real success signal: the confirm POST returns 200 and the app lands on the CONFIRMED detail.
      const confirmedDetail = await waitForConfirmedDetail(page, recorder, 'Case1');
      assert.ok(confirmedDetail.orderNo.length > 0);

      const createPosts = entries(recorder, '/api/v1/orders');
      assert.ok(createPosts.length >= 2, 'Retry must re-send the create request');
      assert.equal(createPosts[0]!.key, createPosts[1]!.key, 'Retried create must reuse the same idempotency key');
      assert.deepEqual(createPosts[0]!.body, createPosts[1]!.body, 'Retried create must send the identical body');
      assert.equal(createPosts[0]!.body.discountAmount, '1.00');
      assert.equal(createPosts[0]!.body.lines.length, 2);

      const orderAfter = ((await api.get(`/orders?customerId=${customer.id}&limit=100`)) as { items: any[] }).items;
      assert.equal(orderAfter.length, orderCountBefore + 1, 'Exactly one new order must exist after recovery');
      assert.equal(await stockQuantity(api, fixture), String(Number(stockBefore) - 4), 'Stock must be deducted exactly once (-4)');
      assert.equal(await netBalance(api, customer.id), addMoney(balanceBefore, '9.00'), 'Receivable must increase exactly once (+9.00)');
      const created = orderAfter.find(order => !['voided'].includes(order.status));
      assert.ok(created, 'The recovered order must be listed');
    } finally {
      await context.close();
    }
  });

  test('2. Lost confirm response replays the same confirm key/body without a second order or stock hit', async () => {
    const recorder: Recorded[] = [];
    let abortConfirmAfter: boolean = false;
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installProxy(context, fixture, recorder, entry => {
      if (entry.method === 'POST' && /^\/api\/v1\/orders\/[^/]+\/confirm$/.test(entry.path) && abortConfirmAfter) {
        abortConfirmAfter = false;
        return 'abort-after';
      }
      return 'pass';
    });
    try {
      const page = await context.newPage();
      await loginAsAdmin(page, fixture.admin);

      const customer = fixture.customers.zero;
      const orderCountBefore = ((await api.get(`/orders?customerId=${customer.id}&limit=100`)) as { items: any[] }).items.length;
      const stockBefore = await stockQuantity(api, fixture);
      const balanceBefore = await netBalance(api, customer.id);

      await selectCustomer(page, customer.name, '虚构隔离地址');
      await addPickerLines(page, fixture, [{ price: '2' }]);
      await waitForCreateTotal(page, '2.00');
      await waitPrimaryIdle(page, '确认销售订单');

      abortConfirmAfter = true;
      await page.locator('.order-bottom-actions-bar button:has-text("确认销售订单")').click();
      await waitPrimaryIdle(page, '确认销售订单');
      assert.equal(entries(recorder, '/api/v1/orders').length, 1, 'Exactly one create request on the first attempt');
      const confirmsAfterFirst = recorder.filter(
        entry => entry.method === 'POST' && /^\/api\/v1\/orders\/[^/]+\/confirm$/.test(entry.path)
      );
      assert.equal(confirmsAfterFirst.length, 1, 'The lost confirm request must have reached the fixture');

      await page.locator('.order-bottom-actions-bar button:has-text("确认销售订单")').click();
      // Case2: confirm response is lost, then the retry must really confirm this same order.
      const confirmedDetail = await waitForConfirmedDetail(page, recorder, 'Case2');
      assert.ok(confirmedDetail.orderNo.length > 0);
      assert.equal(confirmedDetail.entry.response.status, 'confirmed');

      const creates = entries(recorder, '/api/v1/orders');
      assert.equal(creates[0]!.key, creates[1]!.key, 'Retried create must reuse the same key');
      assert.deepEqual(creates[0]!.body, creates[1]!.body, 'Retried create must reuse the identical body');
      const confirms = recorder.filter(entry => entry.method === 'POST' && /^\/api\/v1\/orders\/[^/]+\/confirm$/.test(entry.path));
      assert.equal(confirms.length, 2, 'Retry must re-send the confirm request');
      assert.equal(confirms[0]!.key, confirms[1]!.key, 'Retried confirm must reuse the same idempotency key');
      assert.deepEqual(confirms[0]!.body, confirms[1]!.body, 'Retried confirm must reuse the identical body');

      const ordersAfter = ((await api.get(`/orders?customerId=${customer.id}&limit=100`)) as { items: any[] }).items;
      assert.equal(ordersAfter.length, orderCountBefore + 1, 'Confirm recovery must not duplicate the order');
      assert.equal(await stockQuantity(api, fixture), String(Number(stockBefore) - 1), 'Stock must be deducted exactly once (-1)');
      assert.equal(await netBalance(api, customer.id), addMoney(balanceBefore, '2.00'), 'Receivable must increase exactly once (+2.00)');
    } finally {
      await context.close();
    }
  });

  test('3. Pre-server create abort leaves no write; editing spins a new key and exactly one correct draft', async () => {
    const recorder: Recorded[] = [];
    let abortCreateBefore = true;
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installProxy(context, fixture, recorder, entry => {
      if (entry.method === 'POST' && entry.path === '/api/v1/orders' && abortCreateBefore) {
        abortCreateBefore = false;
        return 'abort-before';
      }
      return 'pass';
    });
    try {
      const page = await context.newPage();
      await loginAsAdmin(page, fixture.admin);

      const customer = fixture.customers.new;
      const stockBefore = await stockQuantity(api, fixture);

      await selectCustomer(page, customer.name, '虚构隔离地址');
      await addPickerLines(page, fixture, [{ price: '2' }]);
      await waitForCreateTotal(page, '2.00');
      await waitPrimaryIdle(page, '保存为草稿');

      await page.locator('.order-bottom-actions-bar button:has-text("保存为草稿")').click();
      await waitPrimaryIdle(page, '保存为草稿');
      const aborted = entries(recorder, '/api/v1/orders');
      assert.equal(aborted.length, 1, 'Exactly one create attempt was made');
      assert.equal(aborted[0]!.status, undefined, 'The pre-server abort must not have any response');
      const draftsAfterAbort = ((await api.get(`/orders?customerId=${customer.id}&status=draft&limit=100`)) as { items: any[] }).items;
      assert.equal(draftsAfterAbort.length, 0, 'The aborted create must not have committed any draft');

      // Real edit: quantity and price change, which must invalidate the old intent key.
      await fillLine(page, fixture.product.name, 0, { quantity: '2', price: '3' });
      await waitForCreateTotal(page, '6.00');
      await waitPrimaryIdle(page, '保存为草稿');
      await page.locator('.order-bottom-actions-bar button:has-text("保存为草稿")').click();
      await page.locator('.order-bottom-actions-bar button:has-text("确认开单记账")').waitFor({ state: 'visible', timeout: 30000 });

      const attempts = entries(recorder, '/api/v1/orders');
      assert.equal(attempts.length, 2, 'The retry must be exactly the second create request');
      assert.notEqual(attempts[0]!.key, attempts[1]!.key, 'Edited content must use a NEW idempotency key');
      assert.notDeepEqual(attempts[0]!.body, attempts[1]!.body, 'Edited content must change the request body');
      assert.equal(attempts[1]!.body.lines[0].quantity, 2);
      // UnitPrice deliberately keeps the raw "3" form the operator typed (Money padding never applies here).
      assert.equal(attempts[1]!.body.lines[0].unitPrice, '3', 'Edited unit price must be sent exactly as typed');
      assert.equal(
        compareUnitPrice(attempts[1]!.body.lines[0].unitPrice, '3'),
        true,
        'Sent unit price must equal 3.00 in value'
      );

      const drafts = ((await api.get(`/orders?customerId=${customer.id}&status=draft&limit=100`)) as { items: any[] }).items;
      assert.equal(drafts.length, 1, 'Exactly one correct draft must exist after the recovery');
      const draft = (await api.get(`/orders/${drafts[0]!.id}`)) as any;
      assert.equal(draft.lines.length, 1);
      assert.equal(draft.lines[0].quantityBase, 2);
      assert.equal(compareUnitPrice(draft.lines[0].unitPrice, '3'), true, 'Persisted unit price must equal 3.00 in value');
      assert.equal(await stockQuantity(api, fixture), stockBefore, 'A draft must not move stock');
    } finally {
      await context.close();
    }
  });

  test('4. Confirmed order migrates to another customer/address on mobile; old cash stays put', async () => {
    const recorder: Recorded[] = [];
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installProxy(context, fixture, recorder, () => 'pass');
    try {
      const oldCustomer = fixture.customers.decline;
      const newCustomer = fixture.customers.new;
      const sourceOrder = fixture.orders.find(order => order.customerId === oldCustomer.id && order.quantityBase === 4)!;
      assert.ok(sourceOrder, 'Fixture must expose the current-period qty4 order for the declining customer');

      // Dedicated, visibly different address on the target customer (预设 address would be identical text).
      const newAddress = (await api.post(`/customers/${newCustomer.id}/addresses`, {
        contactName: '迁移收货人',
        phone: '13900001111',
        address: '迁移目标地址-12.4',
        label: '迁移目标',
      })) as any;
      assert.equal(newAddress.address, '迁移目标地址-12.4');

      // Legal precondition: 2.00 manual cash receipt bound to THIS order, still owned by the old customer.
      const cash = (await api.post('/cash-events', {
        kind: 'receipt',
        customerId: oldCustomer.id,
        amount: '2.00',
        occurredAt: new Date().toISOString(),
        method: 'cash',
        allocationMode: 'manual',
        allocations: [{ orderId: sourceOrder.orderId, amount: '2.00' }],
      })) as any;
      assert.equal(cash.customerId, oldCustomer.id);

      const oldBefore = await netBalance(api, oldCustomer.id);
      const newBefore = await netBalance(api, newCustomer.id);
      const stockBefore = await stockQuantity(api, fixture);

      const page = await context.newPage();
      await loginAsAdmin(page, fixture.admin);
      await navigateTo(page, sourceOrder.orderId);
      await page.locator('text=已确认').first().waitFor({ state: 'visible', timeout: 20000 });
      await page.click('button:has-text("更正改单")');
      await page.locator('text=更正已确认销售订单').first().waitFor({ state: 'visible', timeout: 20000 });

      await page.locator('input[placeholder*="客户追加订单"]').fill('12.4 客户与配送迁移（真实UI）');
      await selectCustomer(page, newCustomer.name, '迁移目标地址-12.4');
      // Both account rows must be shown with real before/after balances from the server quote.
      await page.locator('text=改单对往来账款影响预测').first().waitFor({ state: 'visible', timeout: 25000 });
      await page.locator('text=共 2 个账户变动').first().waitFor({ state: 'visible', timeout: 25000 });
      await page.locator(`text=¥${oldBefore} → ¥`).first().waitFor({ state: 'visible', timeout: 25000 });
      await page.locator(`text=¥${newBefore} → ¥`).first().waitFor({ state: 'visible', timeout: 25000 });
      const quoteEntry = entries(recorder, '/api/v1/orders/quote').filter(entry => entry.status === 200).at(-1);
      assert.ok(quoteEntry, 'A real revision quote must have been captured');
      const changes = quoteEntry!.response.calculation.accountChanges as { customerId: string; beforeNetBalance: string; afterNetBalance: string }[];
      assert.equal(changes.length, 2, 'Revision quote must expose both accounts');
      const oldChange = changes.find(change => change.customerId === oldCustomer.id)!;
      const newChange = changes.find(change => change.customerId === newCustomer.id)!;
      assert.ok(oldChange && newChange, 'Both real accounts must appear in the quote');
      assert.equal(oldChange.beforeNetBalance, oldBefore, 'Old account before-balance must equal the real API balance');
      assert.equal(newChange.beforeNetBalance, newBefore, 'New account before-balance must equal the real API balance');
      const oldDelta = subtractMoney(oldChange.beforeNetBalance, oldChange.afterNetBalance);
      const newDelta = subtractMoney(newChange.afterNetBalance, newChange.beforeNetBalance);
      assert.equal(oldDelta, newDelta, 'The same amount must transfer between the two accounts');
      assert.equal(oldDelta, '8.00', 'The migrated 4 x 2.00 order value must move');

      // Mobile widths: valid quote, enabled main confirm, real geometry, then actually confirm at 350.
      await page.setViewportSize({ width: 400, height: 750 });
      await page.waitForSelector('.order-bottom-actions-bar button.btn-primary:not([disabled])', { timeout: 25000 });
      const bar400 = await page.locator('.order-bottom-actions-bar').boundingBox();
      const nav400 = await mobileBottomNavBox(page);
      assert.ok(bar400, 'Mobile 400 actions bar must have a box');
      assert.ok(bar400.y + bar400.height <= nav400.y + 2, 'Mobile 400 bar must sit above the real bottom nav');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'order-write-migrate-400.png') });

      await page.setViewportSize({ width: 350, height: 667 });
      await page.waitForSelector('.order-bottom-actions-bar button.btn-primary:not([disabled])', { timeout: 25000 });
      const bar350 = await page.locator('.order-bottom-actions-bar').boundingBox();
      const nav350 = await mobileBottomNavBox(page);
      assert.ok(bar350, 'Mobile 350 actions bar must have a box');
      assert.ok(bar350.y + bar350.height <= nav350.y + 2, 'Mobile 350 bar must sit above the real bottom nav');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'No horizontal overflow at 350');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'order-write-migrate-350.png') });

      await page.locator('.order-bottom-actions-bar button:has-text("确认更正并重新记账")').click();
      // The migration must really land on the fixture before asserting the persisted state.
      await pollUntil(
        'UI customer migration revision',
        () => api.get(`/orders/${sourceOrder.orderId}`) as Promise<any>,
        order => order.customerId === newCustomer.id
      );

      const migrated = (await api.get(`/orders/${sourceOrder.orderId}`)) as any;
      assert.equal(migrated.status, 'confirmed');
      assert.equal(migrated.customerId, newCustomer.id, 'Order must now belong to the target customer');
      assert.equal(migrated.deliverySnapshot?.address, '迁移目标地址-12.4', 'New delivery snapshot must be persisted');

      // old-version snapshot untouched
      const oldRevision = (await api.get(`/orders/${sourceOrder.orderId}/revisions/${sourceOrder.revisionId}`)) as any;
      assert.equal(oldRevision.customerId, oldCustomer.id, 'Historical revision must keep the old customer');
      assert.notEqual(oldRevision.deliverySnapshot?.address, '迁移目标地址-12.4', 'Historical revision must not adopt the new snapshot');

      assert.equal(await stockQuantity(api, fixture), stockBefore, 'Migration must not move stock');
      const cashForOld = (await api.get(`/cash-events?customerId=${oldCustomer.id}&limit=100`)) as { items: any[] };
      const keptCash = cashForOld.items.find(item => item.id === cash.id);
      assert.ok(keptCash, 'Cash record must remain visible under the old customer');
      assert.equal(keptCash.customerId, oldCustomer.id, 'Cash record must not migrate');
      assert.equal(keptCash.status, 'active', 'Cash record must not be reversed by the migration');
      const cashForNew = (await api.get(`/cash-events?customerId=${newCustomer.id}&limit=100`)) as { items: any[] };
      assert.equal(cashForNew.items.some(item => item.id === cash.id), false, 'Cash must not appear under the new customer');
      assert.equal(await netBalance(api, oldCustomer.id), oldChange.afterNetBalance, 'Old account must match the quoted after-balance');
      assert.equal(await netBalance(api, newCustomer.id), newChange.afterNetBalance, 'New account must match the quoted after-balance');
    } finally {
      await context.close();
    }
  });

  test('5. Real UI void of an undelivered confirmed order restores stock/receivable, keeps cash and history', async () => {
    const recorder: Recorded[] = [];
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installProxy(context, fixture, recorder, () => 'pass');
    try {
      const customer = fixture.customers.zero;
      // The qty3 baseline order of the zero-purchase customer.
      const sourceOrder = fixture.orders.find(order => order.customerId === customer.id && order.quantityBase === 3)!;
      assert.ok(sourceOrder, 'Fixture must expose the zero-customer qty3 order');
      const balanceBefore = await netBalance(api, customer.id);
      const stockBefore = await stockQuantity(api, fixture);
      const cashBefore = ((await api.get(`/cash-events?customerId=${customer.id}&limit=100`)) as { items: any[] }).items.length;

      const page = await context.newPage();
      await loginAsAdmin(page, fixture.admin);
      await navigateTo(page, sourceOrder.orderId);
      await page.locator('text=已确认').first().waitFor({ state: 'visible', timeout: 20000 });
      await page.click('button:has-text("作废订单")');
      await page.locator('text=作废未配送订单').first().waitFor({ state: 'visible', timeout: 20000 });
      await page.locator('text=作废将自动回补未配送的库存锁定量').first().waitFor({ state: 'visible' });
      await page.locator('input[placeholder="请输入作废原因..."]').fill('12.4 未配送真实UI作废验证');
      await page.locator('.modal-footer button:has-text("确认作废")').click();
      // The void is a real server write; wait for it before checking stock/receivable.
      await pollUntil(
        'UI void of the undelivered order',
        () => api.get(`/orders/${sourceOrder.orderId}`) as Promise<any>,
        order => order.status === 'voided'
      );
      await page.locator('text=已作废').first().waitFor({ state: 'visible', timeout: 30000 });

      const voided = (await api.get(`/orders/${sourceOrder.orderId}`)) as any;
      assert.equal(voided.status, 'voided');
      assert.equal(await netBalance(api, customer.id), subtractMoney(balanceBefore, '6.00'), 'Receivable must be reversed by the voided order value');
      assert.equal(await stockQuantity(api, fixture), String(Number(stockBefore) + 3), 'Stock must be restored to the original warehouse/batch');
      const cashAfter = ((await api.get(`/cash-events?customerId=${customer.id}&limit=100`)) as { items: any[] }).items;
      assert.equal(cashAfter.length, cashBefore, 'Void must not reverse or add cash records');
      const revisions = (await api.get(`/orders/${sourceOrder.orderId}/revisions?limit=50`)) as { items: any[] };
      assert.ok(revisions.items.length >= 2, 'Void must preserve the full revision history');
      assert.ok(revisions.items.some(item => item.changeReason === '创建草稿'), 'History must retain the original draft revision');
    } finally {
      await context.close();
    }
  });

  test('6. Real external revision triggers a true 409, then the UI refreshes and confirms on the latest version', async () => {
    const recorder: Recorded[] = [];
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await installProxy(context, fixture, recorder, () => 'pass');
    try {
      const sourceOrder = fixture.orders.find(order => order.customerId === fixture.customers.new.id)!;
      assert.ok(sourceOrder, 'Fixture must expose the new-customer order');

      const page = await context.newPage();
      await loginAsAdmin(page, fixture.admin);
      await navigateTo(page, sourceOrder.orderId);
      await page.locator('text=已确认').first().waitFor({ state: 'visible', timeout: 20000 });
      await page.click('button:has-text("更正改单")');
      await page.locator('text=更正已确认销售订单').first().waitFor({ state: 'visible', timeout: 20000 });
      await page.locator('input[placeholder*="客户追加订单"]').fill('12.4 UI并发更正（本地）');
      await page.waitForSelector('.order-bottom-actions-bar button.btn-primary:not([disabled])', { timeout: 25000 });

      const current = (await api.get(`/orders/${sourceOrder.orderId}`)) as any;
      // Real external revision: same server route the UI uses, empty lineChanges, new version.
      const external = (await api.post(`/orders/${sourceOrder.orderId}/revisions`, {
        expectedVersion: current.version,
        reason: '外部并发更正-12.4',
        lineChanges: [],
      }, 201)) as any;
      // Header version and revision number are distinct counters; concurrent edits must use version.
      assert.equal(external.version, current.version + 1, 'External revision must advance the header version by one');
      assert.equal(external.revisionNo, current.revisionNo + 1, 'External revision must create the next revision number');

      // Baseline of successful order GETs BEFORE the stale UI submit, so the refresh the UI
      // performs after the real 409 is what the polling below waits for (no extra future GET).
      const refreshGet = entries(recorder, `/api/v1/orders/${sourceOrder.orderId}`, 'GET')
        .filter(entry => entry.status === 200).length;

      // The stale UI request must be a REAL 409 from the fixture API.
      await page.locator('.order-bottom-actions-bar button:has-text("确认更正并重新记账")').click();
      await page.locator('text=版本冲突').first().waitFor({ state: 'visible', timeout: 25000 });
      const rejected = await waitForRecordedStatus(
        recorder,
        entry => entry.method === 'POST' && entry.path === `/api/v1/orders/${sourceOrder.orderId}/revisions`,
        409,
        'Stale UI revision'
      );
      assert.equal(rejected.body.expectedVersion, current.version, 'The rejected request must carry the stale version');
      const conflictPosts = entries(recorder, `/api/v1/orders/${sourceOrder.orderId}/revisions`);
      assert.equal(conflictPosts.length, 1, 'Exactly one stale revision attempt may be sent');

      // External content survived the failed overwrite.
      const afterConflict = (await api.get(`/orders/${sourceOrder.orderId}`)) as any;
      assert.equal(afterConflict.customerId, current.customerId, 'Failed UI overwrite must not change the customer');
      assert.equal(afterConflict.revisionNo, external.revisionNo, 'Failed UI overwrite must not advance the version');
      const historyAfterConflict = (await api.get(`/orders/${sourceOrder.orderId}/revisions?limit=50`)) as { items: any[] };
      assert.ok(historyAfterConflict.items.some(item => item.changeReason === '外部并发更正-12.4'), 'External revision must be preserved');

      // The UI re-reads the latest version: wait for the post-conflict refresh GET plus a NEW
      // quote built on the refreshed version, with the primary action enabled.
      await pollUntil(
        'UI refresh after conflict',
        async () => ({
          get: entries(recorder, `/api/v1/orders/${sourceOrder.orderId}`, 'GET').filter(entry => entry.status === 200).length,
          quoteVersions: entries(recorder, '/api/v1/orders/quote')
            .filter(entry => entry.status === 200 && entry.body?.revision)
            .map(entry => entry.body.revision.expectedVersion as number),
          enabled: await page.locator('.order-bottom-actions-bar button.btn-primary:not([disabled])').count(),
        }),
        state =>
          state.get > refreshGet &&
          state.enabled === 1 &&
          state.quoteVersions.includes(external.version)
      );
      assert.equal(
        entries(recorder, '/api/v1/orders/quote').filter(
          entry => entry.status === 409
        ).length,
        0,
        'No quote may be attempted with the stale pre-conflict version'
      );
      await fillLine(page, fixture.product.name, 0, { quantity: '3' });
      await page.locator('.order-bottom-summary-text:has-text("¥6.00")').first().waitFor({ state: 'visible', timeout: 25000 });
      await page.waitForSelector('.order-bottom-actions-bar button.btn-primary:not([disabled])', { timeout: 25000 });
      const reason = page.locator('input[placeholder*="客户追加订单"]');
      assert.equal(await reason.inputValue(), '12.4 UI并发更正（本地）', 'Reason must survive the refresh');

      const revisionPath = `/api/v1/orders/${sourceOrder.orderId}/revisions`;
      const retryResponsePromise = page.waitForResponse(
        response =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === revisionPath &&
          response.status() === 201,
        { timeout: 30000 }
      );
      await page.locator('.order-bottom-actions-bar button:has-text("确认更正并重新记账")').click();
      const retryResponse = await retryResponsePromise;
      const retryBody = (await retryResponse.json()) as any;
      assert.equal(retryBody.status, 'confirmed', 'The accepted revision must return the confirmed order');
      assert.equal(retryBody.revisionNo, external.revisionNo + 1, 'Accepted revision must be the next revision number');
      // "已确认" also appears in the Edit title, so wait for the Edit screen to be gone first.
      await page.locator('text=更正已确认销售订单').waitFor({ state: 'hidden', timeout: 30000 });
      // Then the real OrderDetail for THIS order number must be showing.
      await page.locator(`text=订单 ${retryBody.orderNo}`).first().waitFor({ state: 'visible', timeout: 30000 });
      await page.locator('text=已确认').first().waitFor({ state: 'visible', timeout: 30000 });
      assert.equal(await page.locator('text=更正已确认销售订单').count(), 0, 'Successful revision must leave the edit screen');

      const allPosts = entries(recorder, `/api/v1/orders/${sourceOrder.orderId}/revisions`);
      assert.equal(allPosts.length, 2, 'Exactly two revision attempts: the rejected one and the successful one');
      assert.notEqual(allPosts[0]!.key, allPosts[1]!.key, 'The re-entered revision must use a new intent key');
      assert.equal(allPosts[1]!.status, 201, 'The retried revision must be accepted by the real API');
      assert.ok(allPosts[1]!.body.expectedVersion > allPosts[0]!.body.expectedVersion, 'Retry must carry the refreshed server version');

      const finalOrder = (await api.get(`/orders/${sourceOrder.orderId}`)) as any;
      assert.ok(finalOrder.revisionNo > external.revisionNo, 'Final revision must supersede the external one');
      const finalHistory = (await api.get(`/orders/${sourceOrder.orderId}/revisions?limit=50`)) as { items: any[] };
      const currentEntry = finalHistory.items.find(item => item.isCurrent);
      assert.equal(currentEntry?.changeReason, '12.4 UI并发更正（本地）', 'Latest revision must be the UI submission');
      assert.ok(finalHistory.items.some(item => item.changeReason === '外部并发更正-12.4'), 'External correction must remain in history');
    } finally {
      await context.close();
    }
  });
});

/** Waits for a recorded write to receive its real HTTP status, then returns the entry. */
async function waitForRecordedStatus(
  recorder: Recorded[],
  predicate: (entry: Recorded) => boolean,
  status: number,
  label: string
): Promise<Recorded> {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const matches = recorder.filter(predicate).filter(entry => entry.status === status);
    const match = matches.at(-1);
    if (match) return match;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail(
    `${label}: no request reached HTTP ${status}; observed=${JSON.stringify(
      recorder.filter(predicate).map(entry => ({ path: entry.path, status: entry.status }))
    )}`
  );
}

/**
 * Waits for the real confirm success: the exact POST /orders/{id}/confirm must return 200,
 * then the app must land on the CONFIRMED OrderDetail (title with this orderNo), which has
 * NO draft-only "确认开单记账" bottom bar.
 */
async function waitForConfirmedDetail(page: Page, recorder: Recorded[], label: string): Promise<{ orderNo: string; entry: Recorded }> {
  const confirmEntry = await waitForRecordedStatus(
    recorder,
    entry => entry.method === 'POST' && /^\/api\/v1\/orders\/[^/]+\/confirm$/.test(entry.path),
    200,
    `${label} confirm`
  );
  const orderNo = confirmEntry.response?.orderNo as string | undefined;
  assert.ok(orderNo, `${label}: confirm response must expose the real orderNo`);
  await page.locator(`text=订单 ${orderNo}`).first().waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('text=已确认').first().waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(
    await page.locator('.order-bottom-actions-bar button:has-text("确认开单记账")').count(),
    0,
    `${label}: a confirmed order detail must not show the draft-only 确认开单记账 button`
  );
  return { orderNo, entry: confirmEntry };
}

async function stockQuantity(api: ReturnType<typeof createAdminApi>, fixture: Fixture): Promise<string> {
  const page = (await api.get(`/inventory/balances?productId=${fixture.product.id}&warehouseId=${fixture.warehouse.id}`)) as { items: any[] };
  const match = page.items.find(item => item.productId === fixture.product.id && item.warehouseId === fixture.warehouse.id);
  assert.ok(match, 'Fixture stock balance row must exist');
  return String(match.quantityBase);
}

/** Polls the real fixture API until the condition holds; fails with the last observed value. */
async function pollUntil<T>(label: string, probe: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 30000;
  let value = await probe();
  while (!done(value) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 250));
    value = await probe();
  }
  assert.ok(done(value), `${label} did not settle; last observed: ${JSON.stringify(value)}`);
  return value;
}

async function netBalance(api: ReturnType<typeof createAdminApi>, customerId: string): Promise<string> {
  const balance = (await api.get(`/customers/${customerId}/balance`)) as { netBalance: string };
  return balance.netBalance;
}

function cents(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  assert.ok(match, `Money value must be a plain decimal: ${value}`);
  const sign = match![1] === '-' ? -1n : 1n;
  const fraction = (match![3] || '').padEnd(2, '0');
  return sign * (BigInt(match![2]!) * 100n + BigInt(fraction));
}

function money(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function addMoney(left: string, right: string): string {
  return money(cents(left) + cents(right));
}

function subtractMoney(left: string, right: string): string {
  return money(cents(left) - cents(right));
}

/**
 * UnitPrice equality in VALUE (contract allows an integer or 1-6 decimals), parsed as
 * millionths with pure string math — no floating point, no DTO padding requirement.
 */
function unitPriceMicros(value: unknown): bigint {
  const text = String(value).trim();
  const match = /^(0|[1-9][0-9]{0,17})(?:\.([0-9]{1,6}))?$/.exec(text);
  assert.ok(match, `UnitPrice must be a plain nonnegative decimal: ${text}`);
  return BigInt(match![1]!) * 1_000_000n + BigInt((match![2] ?? '').padEnd(6, '0'));
}

function compareUnitPrice(left: unknown, right: unknown): boolean {
  return unitPriceMicros(left) === unitPriceMicros(right);
}
