import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { parseSchema } from '@huoyoupu/contracts';
import { createComparisonReportFixture } from '../../api/test/support/comparison-report-fixture.js';

const BASE_URL = process.env.HYP_BASE_URL || 'http://localhost:5173';
const SCREENSHOTS_DIR = path.resolve('apps/web/src/pages/reports/screenshots');
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

type Fixture = Awaited<ReturnType<typeof createComparisonReportFixture>>;

/** Shanghai calendar date (YYYY-MM-DD) of an instant; never a UTC substring. */
function shanghaiDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return `${map.year}-${map.month}-${map.day}`;
}

function sameInstant(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return a === b;
  return Date.parse(a) === Date.parse(b);
}

function getLaunchOptions(): Parameters<typeof chromium.launch>[0] {
  const edgeMac = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
  const edgeLinux = '/usr/bin/microsoft-edge';
  let executablePath: string | undefined;
  if (fs.existsSync(edgeMac)) executablePath = edgeMac;
  else if (fs.existsSync(edgeLinux)) executablePath = edgeLinux;
  return { headless: true, executablePath };
}

interface CapturedRunPage {
  url: string;
  body: Record<string, any>;
}

describe('12.8 Fixed Report Page Proof: customer_product_comparison on an isolated PG+HTTP fixture', () => {
  let fixture: Fixture;
  let browser: Browser;

  // Fixture setup runs serially in its own test (real TestContext.mock.timers) before any
  // browser launches; the factory restores Date before it returns.
  test('0. Prepare isolated comparison fixture (private PG + dynamic HTTP) before launching a browser', async t => {
    fixture = await createComparisonReportFixture({
      frontendOrigin: BASE_URL,
      timers: t.mock.timers,
    });
    assert.ok(fixture.apiOrigin, 'Fixture must expose its own dynamic API origin');
    assert.notEqual(new URL(fixture.apiOrigin).port, '3000', 'Fixture API must not be the shared dev API');
    assert.ok(fixture.period.start && fixture.period.end && fixture.period.baselineStart && fixture.period.baselineEnd);
    browser = await chromium.launch(getLaunchOptions());
  });

  after(async () => {
    // Close only this case's browser resources, then the fixture's own PG/HTTP.
    if (browser) await browser.close().catch(() => {});
    if (fixture) await fixture.close();
  });

  test('Comparison report: real query/rows/periods, controlled limit=1 pagination on the same run', async () => {
    const context: BrowserContext = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
    const page: Page = await context.newPage();
    const capturedRunPages: CapturedRunPage[] = [];
    let queryPostCount = 0;
    let paginationPostCount = 0;
    let autoQueryPostCountAtExplicitQuery = -1;
    let queryBody: Record<string, any> | null = null;
    let createdRun: Record<string, any> | null = null;
    let createdRunId = '';
    let firstScreen: Record<string, any> | null = null;
    let explicitQueryStarted = false;

    // Isolated transport: every /api/v1 call is served by the fixture's own PG+HTTP,
    // while page assets still come from the real Vite dev server.
    await context.route('**/api/v1/**', async route => {
      const request = route.request();
      const original = new URL(request.url());
      const target = new URL(original.pathname + original.search, fixture.apiOrigin);
      const forwardResponse = async (res: {
        status: () => number;
        headers: () => Record<string, string>;
        body: () => Promise<Buffer>;
      }) => {
        const headers = res.headers();
        for (const drop of ['content-encoding', 'content-length', 'transfer-encoding']) delete headers[drop];
        await route.fulfill({ status: res.status(), headers, body: await res.body() });
      };

      if (request.method() === 'POST' && original.pathname === '/api/v1/reports/query') {
        if (explicitQueryStarted) queryPostCount++;
        else paginationPostCount++; // mount / kind-change auto queries, reported separately
        const res = await route.fetch({ url: target.toString() });
        const body = (await res.json()) as Record<string, any>;
        if (explicitQueryStarted) {
          createdRun = body;
          createdRunId = body.id;
          // Give the page a real first screen of a controlled size: a genuine GET of
          // the same run at limit=1 (rows/id/cursor all come from the real API).
          const firstScreenRes = await context.request.get(
            `${fixture.apiOrigin}/api/v1/report-runs/${body.id}?limit=1`,
            { headers: { Origin: BASE_URL } }
          );
          assert.equal(firstScreenRes.status(), 200, 'Real first-screen GET of the created run must succeed');
          firstScreen = (await firstScreenRes.json()) as Record<string, any>;
          capturedRunPages.push({ url: `GET /report-runs/${body.id}?limit=1`, body: firstScreen });
          await forwardResponse(firstScreenRes);
          return;
        }
        await forwardResponse(res);
        return;
      }

      // Same-run pagination: keep the real opaque cursor, only pin the controlled page size.
      const runMatch = /^\/api\/v1\/report-runs\/([^/]+)$/.exec(original.pathname);
      if (request.method() === 'GET' && runMatch) {
        target.searchParams.set('limit', '1');
        const res = await context.request.fetch(target.toString(), {
          method: 'GET',
          headers: { Origin: BASE_URL },
        });
        const body = (await res.json()) as Record<string, any>;
        // Only pages of THIS run are captured; mount/kind-change queries target other runs.
        if (!createdRunId || body.id === createdRunId) {
          capturedRunPages.push({ url: `GET ${target.pathname}${target.search}`, body });
        }
        await forwardResponse(res);
        return;
      }

      const res = await route.fetch({ url: target.toString() });
      await forwardResponse(res);
    });

    try {
      // 1. Normal UI login with the fixture's in-memory admin (real CSRF/cookie flow).
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.locator('input[placeholder*="管理员或员工账号"]').fill(fixture.admin.loginName);
      await page.locator('input[placeholder*="请输入密码"]').fill(fixture.admin.password);
      await page.locator('button[type="submit"]').first().click();
      await page.locator('text="经营报表"').first().waitFor({ state: 'visible', timeout: 20000 });

      // 2. Enter the real production ReportsPage and select the comparison topic.
      await page.locator('text="经营报表"').first().click();
      const kindSelect = page.locator('select').filter({ has: page.locator('option[value="customer_product_comparison"]') }).first();
      await kindSelect.waitFor({ state: 'visible', timeout: 15000 });
      await kindSelect.selectOption('customer_product_comparison');

      // Period: custom, four Shanghai dates converted from the fixture's real instants.
      const periodSelect = page.locator('select').filter({ has: page.locator('option[value="custom"]') }).first();
      await periodSelect.selectOption('custom');
      const dateInputs = page.locator('input[type="date"]');
      await dateInputs.nth(0).waitFor({ state: 'visible', timeout: 8000 });
      await dateInputs.nth(0).fill(shanghaiDate(fixture.period.start));
      await dateInputs.nth(1).fill(shanghaiDate(fixture.period.end));
      await dateInputs.nth(2).fill(shanghaiDate(fixture.period.baselineStart));
      await dateInputs.nth(3).fill(shanghaiDate(fixture.period.baselineEnd));

      // Own SKU only; quantity basis ordered; decreasesOnly off; no min-decrease filters.
      const productSelect = page.locator('select').filter({ has: page.locator(`option[value="${fixture.product.id}"]`) }).first();
      await productSelect.selectOption(fixture.product.id);
      const basisSelect = page.locator('select').filter({ has: page.locator('option[value="ordered"]') }).first();
      await basisSelect.selectOption('ordered');
      const decreasesOnly = page.locator('input[type="checkbox"]').filter({ hasNot: page.locator('[disabled]') }).first();
      if (await decreasesOnly.isChecked()) await decreasesOnly.uncheck();
      await page.locator('input[placeholder="基础单位"]').fill('');
      await page.locator('input[placeholder="如 10"]').fill('');

      // 3. Execute exactly one explicit query through the real production handler.
      autoQueryPostCountAtExplicitQuery = paginationPostCount;
      explicitQueryStarted = true;
      const queryResponsePromise = page.waitForResponse(
        res => res.url().includes('/reports/query') && res.request().method() === 'POST' && res.status() === 200,
        { timeout: 20000 }
      );
      const capturedQueryRequest = page.waitForRequest(
        req => req.url().includes('/reports/query') && req.method() === 'POST',
        { timeout: 20000 }
      );
      await page.locator('button:has-text("执行统计查询 (新快照)")').click();
      const queryRequest = await capturedQueryRequest;
      const queryResponse = await queryResponsePromise;
      queryBody = parseSchema('ReportQuery', queryRequest.postDataJSON()) as Record<string, any>;

      // 3a. The UI itself must have produced the same-semantics query (no proxy body rewrite).
      assert.equal(queryBody.kind, 'customer_product_comparison');
      assert.equal(queryBody.period.mode, 'custom');
      assert.ok(sameInstant(queryBody.period.start, fixture.period.start), 'UI current start must match the fixture period');
      assert.ok(sameInstant(queryBody.period.end, fixture.period.end), 'UI current end (exclusive) must match the fixture period');
      assert.ok(sameInstant(queryBody.period.baselineStart, fixture.period.baselineStart), 'UI baseline start must match');
      assert.ok(sameInstant(queryBody.period.baselineEnd, fixture.period.baselineEnd), 'UI baseline end must match');
      assert.equal(queryBody.quantityBasis, 'ordered');
      assert.deepEqual(queryBody.filters?.productIds, [fixture.product.id], 'UI must filter to the fixture SKU');
      assert.notEqual(queryBody.filters?.decreasesOnly, true, 'decreasesOnly must be off');
      assert.equal(queryBody.filters?.minDecreaseQuantityBase, undefined);
      assert.ok(!queryBody.filters?.minDecreasePercent, 'min decrease percent must be empty');

      // 3b. The real POST result and the real first-screen GET share one run identity.
      assert.ok(createdRun, 'Real query POST must create a run');
      const fullRun = parseSchema('ReportResult', createdRun) as Record<string, any>;
      assert.equal(fullRun.kind, 'customer_product_comparison');
      assert.equal((fullRun.rows as any[]).length, 3, 'Full run must contain the three fixture customer rows');
      assert.ok(firstScreen, 'Controlled first screen must come from a real GET');
      const firstScreenParsed = parseSchema('ReportResult', firstScreen) as Record<string, any>;
      assert.equal(firstScreenParsed.id, fullRun.id, 'First screen must be the same run id');
      assert.ok(sameInstant(firstScreenParsed.asOf, fullRun.asOf), 'First screen must keep the run asOf');
      assert.equal(firstScreenParsed.sourceWatermark, fullRun.sourceWatermark, 'First screen must keep the watermark');
      assert.equal((firstScreenParsed.rows as any[]).length, 1, 'Controlled page size of 1 must be real');
      assert.ok(firstScreenParsed.nextCursor, 'A three-row run at limit=1 must expose a real opaque cursor');

      // 3c. NormalizedConditions must show both real periods, checked against the response.
      await page.waitForSelector('.report-table', { timeout: 15000 });
      const normalized = firstScreenParsed.normalizedQuery as Record<string, any>;
      assert.equal(normalized.kind, 'customer_product_comparison');
      assert.ok(sameInstant(normalized.period.start, fixture.period.start));
      assert.ok(sameInstant(normalized.period.end, fixture.period.end));
      assert.ok(sameInstant(normalized.period.baselineStart, fixture.period.baselineStart));
      assert.ok(sameInstant(normalized.period.baselineEnd, fixture.period.baselineEnd));
      const metadataText = await page.locator('.report-metadata-bar').first().innerText();
      assert.ok(metadataText.includes(shanghaiDate(fixture.period.start)), 'Current period start badge must be visible');
      assert.ok(metadataText.includes(shanghaiDate(fixture.period.end)), 'Current period end badge must be visible');
      assert.ok(metadataText.includes(shanghaiDate(fixture.period.baselineStart)), 'Baseline start badge must be visible');
      assert.ok(metadataText.includes(shanghaiDate(fixture.period.baselineEnd)), 'Baseline end badge must be visible');
      assert.ok(metadataText.includes(fullRun.sourceWatermark), 'Real source watermark must be rendered');

      // 4. Real pagination: limit=1 means three pages. Each click waits for the real
      // GET of THIS run carrying exactly the previous page's opaque cursor, and for the
      // appended production table to grow. No cursor is decoded or fabricated.
      const nextButton = page.locator('button:has-text("加载更多数据 (下一页)")');
      const table = page.locator('.report-table').first();
      await table.waitFor({ state: 'visible', timeout: 10000 });
      const waitForRows = async (count: number) => {
        for (let attempt = 0; attempt < 100; attempt++) {
          if ((await table.locator('tbody tr').count()) >= count) return;
          await page.waitForTimeout(100);
        }
        throw new Error(`Table never reached ${count} rows (currently ${await table.locator('tbody tr').count()})`);
      };
      await waitForRows(1);

      const expectedCursors: (string | null)[] = [firstScreenParsed.nextCursor];
      assert.ok(expectedCursors[0], 'First screen must expose a real opaque cursor for page 2');

      for (const pageIndex of [2, 3]) {
        const cursor = expectedCursors[pageIndex - 2]!;
        const runGetRequest = page.waitForRequest(
          req =>
            req.method() === 'GET' &&
            new URL(req.url()).pathname === `/api/v1/report-runs/${fullRun.id}` &&
            new URL(req.url()).searchParams.get('cursor') === cursor,
          { timeout: 20000 }
        );
        const runGetResponse = page.waitForResponse(
          res =>
            res.request().method() === 'GET' &&
            new URL(res.url()).pathname === `/api/v1/report-runs/${fullRun.id}` &&
            new URL(res.url()).searchParams.get('cursor') === cursor &&
            res.status() === 200,
          { timeout: 20000 }
        );
        await nextButton.first().click();
        await runGetRequest;
        const pageResponse = await runGetResponse;
        const pageBody = (await pageResponse.json()) as Record<string, any>;
        assert.equal(pageBody.id, fullRun.id, `Page ${pageIndex} must be the original run id`);
        assert.equal(capturedRunPages.length, pageIndex, `Page ${pageIndex} must be captured exactly once`);
        assert.equal(capturedRunPages[pageIndex - 1]!.body.id, fullRun.id, 'Captured page must belong to this run');
        expectedCursors.push(pageBody.nextCursor);
        await waitForRows(pageIndex);
      }

      assert.equal(queryPostCount, 1, 'Exactly one explicit query POST is allowed');
      // Pagination must never create a new run: no POST at all after the explicit query.
      assert.equal(
        paginationPostCount,
        autoQueryPostCountAtExplicitQuery,
        'Pagination must not issue any new /reports/query POST'
      );
      assert.equal(capturedRunPages.length, 3, 'First screen + two next pages must be three real GETs');
      for (const captured of capturedRunPages) {
        assert.equal(captured.body.id, fullRun.id, 'Every page must be the original run id');
        assert.ok(sameInstant(captured.body.asOf, fullRun.asOf), 'asOf must stay fixed across pages');
        assert.equal(captured.body.sourceWatermark, fullRun.sourceWatermark, 'watermark must stay fixed across pages');
        assert.ok(captured.url.includes('limit=1'), 'Every page GET must use the controlled limit=1');
      }
      assert.equal(capturedRunPages[0]!.body.nextCursor, firstScreenParsed.nextCursor, 'First page cursor is the real one');
      assert.ok(capturedRunPages[0]!.body.nextCursor, 'Page 1 must have a next cursor for page 2');
      assert.ok(capturedRunPages[1]!.body.nextCursor, 'Page 2 must have a next cursor for page 3');
      assert.notEqual(
        capturedRunPages[1]!.body.nextCursor,
        capturedRunPages[0]!.body.nextCursor,
        'Page 2 cursor must be a different real cursor'
      );
      assert.equal(capturedRunPages[2]!.body.nextCursor, null, 'Page 3 is the last page and must have no cursor');
      assert.equal(expectedCursors[1], capturedRunPages[1]!.body.nextCursor, 'Page 3 must have used page 2 real cursor');

      const allRows = capturedRunPages.flatMap(p => p.body.rows as any[]);
      assert.equal(allRows.length, 3, 'Three rows across pages, no duplicates or gaps');
      const customerIds = allRows.map(r => r.customerId);
      assert.equal(new Set(customerIds).size, 3, 'Each fixture customer appears exactly once');
      assert.deepEqual(
        new Set(customerIds),
        new Set(Object.values(fixture.customers).map(c => c.id)),
        'Pagination must cover exactly the three fixture customers'
      );

      // 4a. The rendered table must hold the three real rows with API-provided values.
      const rowCount = await table.locator('tbody tr').count();
      assert.equal(rowCount, 3, 'All three real rows must be rendered after pagination');

      const rowByCustomer = (customerId: string) => {
        const customer = Object.values(fixture.customers).find(c => c.id === customerId);
        assert.ok(customer, 'Row customer must be a fixture customer');
        return table.locator('tbody tr').filter({ hasText: customer!.name }).first();
      };

      const declineRow = rowByCustomer(fixture.customers.decline.id);
      await declineRow.waitFor({ state: 'visible', timeout: 8000 });
      const declineText = await declineRow.innerText();
      assert.ok(declineText.includes('4'), 'Decline customer current ordered quantity must be 4');
      assert.ok(declineText.includes('10'), 'Decline customer baseline ordered quantity must be 10');
      assert.ok(declineText.includes('-6'), 'Decline quantity change must be -6');
      assert.ok(declineText.includes('-60.00%'), 'Decline percent must be the API value -60.00');
      assert.ok(declineText.includes('下降'), 'Decline row must render the decreased trend');

      const zeroRow = rowByCustomer(fixture.customers.zero.id);
      await zeroRow.waitFor({ state: 'visible', timeout: 8000 });
      const zeroText = await zeroRow.innerText();
      assert.ok(zeroText.includes('0 (未购买)'), 'Zero-purchase row must render 0 (未购买)');
      assert.ok(zeroText.includes('3'), 'Zero-purchase baseline quantity must be 3');
      assert.ok(zeroText.includes('-100.00%'), 'Zero-purchase percent must be the API value -100.00');
      assert.ok(zeroText.includes('下降'));

      const newRow = rowByCustomer(fixture.customers.new.id);
      await newRow.waitFor({ state: 'visible', timeout: 8000 });
      const newText = await newRow.innerText();
      assert.ok(newText.includes('本期新增'), 'New row must render the new trend');
      assert.ok(!newText.includes('0%'), 'Empty baseline must not render 0%');
      assert.ok(!newText.includes('Infinity'), 'Empty baseline must not render Infinity');
      assert.ok(newText.includes('—'), 'Null changePercent must render the em dash placeholder');
      assert.ok(!newText.includes('无基期'), 'Fixture expects trend=new, not no_baseline');

      // 4b. Amounts/quantities on screen must be the API values, not recomputed by the page.
      for (const apiRow of fullRun.rows as any[]) {
        const row = rowByCustomer(apiRow.customerId);
        const text = await row.innerText();
        assert.ok(text.includes(`¥${apiRow.currentNetSalesAmount}`), 'Current net amount must come from the API row');
        assert.ok(text.includes(`¥${apiRow.baselineNetSalesAmount}`), 'Baseline net amount must come from the API row');
      }
      const declineApiRow = (fullRun.rows as any[]).find(r => r.customerId === fixture.customers.decline.id);
      assert.equal(declineApiRow.changePercent, fixture.expected.decline.percent);
      assert.equal(declineApiRow.trend, fixture.expected.decline.trend);
      const zeroApiRow = (fullRun.rows as any[]).find(r => r.customerId === fixture.customers.zero.id);
      assert.equal(zeroApiRow.changePercent, fixture.expected.zero.percent);
      const newApiRow = (fullRun.rows as any[]).find(r => r.customerId === fixture.customers.new.id);
      assert.equal(newApiRow.changePercent, null, 'Empty baseline must yield null changePercent in the API');
      assert.equal(newApiRow.trend, 'new');

      // 4c. The production page exposes no previous-page control: record it, do not fake one.
      const prevControls = await page.locator('button:has-text("上一页")').count();
      assert.equal(prevControls, 0, 'Product page has no previous-page control (append-only pagination)');

      // The original first screen must still be reproducible from the same real run.
      const replay = await context.request.get(
        `${fixture.apiOrigin}/api/v1/report-runs/${fullRun.id}?limit=1`,
        { headers: { Origin: BASE_URL } }
      );
      assert.equal(replay.status(), 200, 'Re-reading the original run must succeed');
      const replayBody = parseSchema('ReportResult', await replay.json()) as Record<string, any>;
      assert.equal(replayBody.id, fullRun.id);
      assert.equal((replayBody.rows as any[])[0].customerId, (firstScreenParsed.rows as any[])[0].customerId);
      assert.equal(replayBody.nextCursor, firstScreenParsed.nextCursor, 'First page must be byte-stable');

      // 5. Screenshots: desktop result + periods, then a REAL mobile result state.
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'report-comparison-desktop.png'), fullPage: true });

      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.waitForTimeout(500);

      // Find the real vertical scroll owner of the result table (not window, not a fake
      // fullPage composite). The app shell uses an inner main/overflow-y container.
      const ownerInfo = await page.evaluate(() => {
        const table = document.querySelector('.report-table') as HTMLElement | null;
        if (!table) return null;
        let node: HTMLElement | null = table.parentElement;
        while (node && node !== document.body) {
          const style = getComputedStyle(node);
          const overflowY = style.overflowY;
          if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 4) {
            return {
              scrollTop: node.scrollTop,
              scrollHeight: node.scrollHeight,
              clientHeight: node.clientHeight,
            };
          }
          node = node.parentElement;
        }
        return null;
      });
      assert.ok(ownerInfo, 'The result table must live inside a real vertical scroll owner on mobile');

      // Scroll that owner so all three result rows are inside the visible viewport.
      await table.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      const lastRowBox = await table.locator('tbody tr').last().boundingBox();
      assert.ok(lastRowBox, 'Last result row must have a real layout box on mobile');
      assert.ok(lastRowBox!.y >= 0, 'Last result row must not sit above the visible viewport');
      assert.ok(
        lastRowBox!.y + Math.min(lastRowBox!.height, 1) <= MOBILE_VIEWPORT.height,
        'Last result row must start inside the visible mobile viewport'
      );
      const mobileLayout = await page.evaluate(() => {
        const table = document.querySelector('.report-table') as HTMLElement | null;
        let owner: HTMLElement | null = table ? table.parentElement : null;
        while (owner && owner !== document.body) {
          const style = getComputedStyle(owner);
          if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && owner.scrollHeight > owner.clientHeight + 4) break;
          owner = owner.parentElement;
        }
        const nav = document.querySelector('nav');
        const ownerRect = owner ? owner.getBoundingClientRect() : null;
        const tableRect = table ? table.getBoundingClientRect() : null;
        const navRect = nav ? nav.getBoundingClientRect() : null;
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          scrollY: window.scrollY,
          owner: owner && ownerRect
            ? {
                scrollTop: owner.scrollTop,
                scrollHeight: owner.scrollHeight,
                clientHeight: owner.clientHeight,
                rect: {
                  x: Math.round(ownerRect.x),
                  y: Math.round(ownerRect.y),
                  width: Math.round(ownerRect.width),
                  height: Math.round(ownerRect.height),
                },
              }
            : null,
          tableRect: tableRect
            ? {
                x: Math.round(tableRect.x),
                y: Math.round(tableRect.y),
                width: Math.round(tableRect.width),
                height: Math.round(tableRect.height),
              }
            : null,
          navRect: navRect
            ? {
                x: Math.round(navRect.x),
                y: Math.round(navRect.y),
                width: Math.round(navRect.width),
                height: Math.round(navRect.height),
              }
            : null,
          rowCount: table ? table.querySelectorAll('tbody tr').length : 0,
        };
      });
      assert.ok(mobileLayout.owner, 'Mobile layout must expose the real scroll owner metrics');
      assert.equal(mobileLayout.rowCount, 3, 'All three result rows must still exist on mobile');
      assert.equal(mobileLayout.viewport.width, MOBILE_VIEWPORT.width);
      assert.equal(mobileLayout.viewport.height, MOBILE_VIEWPORT.height);
      assert.ok(mobileLayout.tableRect, 'Result table must have a real mobile rect');

      // The existing report/rows must still be the same real run after resizing.
      const tableRunIdText = await page.locator('.report-metadata-bar').first().innerText();
      assert.ok(
        tableRunIdText.includes(`#${fullRun.id.substring(0, 8)}`),
        'Mobile view must still show the same run id'
      );
      assert.ok(tableRunIdText.includes(fullRun.sourceWatermark), 'Mobile view must still show the same watermark');

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'report-comparison-mobile-390.png') });

      // Horizontal scroll the real overflow-x container to the far right so the
      // percent / new / empty-baseline columns are actually visible.
      const horizontal = await page.evaluate(() => {
        const table = document.querySelector('.report-table') as HTMLElement | null;
        if (!table) return null;
        let node: HTMLElement | null = table.parentElement;
        while (node && node !== document.body) {
          const style = getComputedStyle(node);
          if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 4) {
            return {
              scrollLeft: node.scrollLeft,
              scrollWidth: node.scrollWidth,
              clientWidth: node.clientWidth,
              maxScrollLeft: node.scrollWidth - node.clientWidth,
            };
          }
          node = node.parentElement;
        }
        return null;
      });
      assert.ok(horizontal, 'Mobile result table must have a real horizontal overflow container');
      assert.ok(horizontal!.maxScrollLeft > 0, 'Mobile result table must genuinely overflow horizontally');

      await page.evaluate(() => {
        const table = document.querySelector('.report-table') as HTMLElement | null;
        let node: HTMLElement | null = table ? table.parentElement : null;
        while (node && node !== document.body) {
          const style = getComputedStyle(node);
          if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 4) {
            node.scrollLeft = node.scrollWidth;
            return;
          }
          node = node.parentElement;
        }
      });
      await page.waitForTimeout(300);

      const afterScroll = await page.evaluate(() => {
        const table = document.querySelector('.report-table') as HTMLElement | null;
        let node: HTMLElement | null = table ? table.parentElement : null;
        while (node && node !== document.body) {
          const style = getComputedStyle(node);
          if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 4) {
            const container = node.getBoundingClientRect();
            const rows = Array.from(table!.querySelectorAll('tbody tr'));
            const visible = rows.map(row => {
              const tds = row.querySelectorAll('td');
              const percentCell = tds[10] as HTMLElement | undefined;
              const trendCell = tds[11] as HTMLElement | undefined;
              const percentRect = percentCell ? percentCell.getBoundingClientRect() : null;
              const trendRect = trendCell ? trendCell.getBoundingClientRect() : null;
              return {
                customer: (tds[0]?.textContent || '').trim(),
                percent: (percentCell?.textContent || '').trim(),
                trend: (trendCell?.textContent || '').trim(),
                percentVisible: Boolean(
                  percentRect &&
                    percentRect.width > 0 &&
                    percentRect.left >= container.left - 1 &&
                    percentRect.right <= container.right + 1
                ),
                trendVisible: Boolean(
                  trendRect &&
                    trendRect.width > 0 &&
                    trendRect.left >= container.left - 1 &&
                    trendRect.right <= container.right + 1
                ),
              };
            });
            return { scrollLeft: node.scrollLeft, maxScrollLeft: node.scrollWidth - node.clientWidth, visible };
          }
          node = node.parentElement;
        }
        return null;
      });
      assert.ok(afterScroll, 'Horizontal container must still exist after scrolling');
      assert.ok(
        afterScroll!.scrollLeft > horizontal!.scrollLeft,
        `Horizontal scrollLeft must really change (${horizontal!.scrollLeft} → ${afterScroll!.scrollLeft})`
      );
      assert.equal(afterScroll!.visible.length, 3, 'All three rows must remain present after horizontal scroll');
      for (const row of afterScroll!.visible) {
        assert.ok(row.percentVisible, `Percent column must be inside the mobile viewport for ${row.customer}`);
        assert.ok(row.trendVisible, `Trend column must be inside the mobile viewport for ${row.customer}`);
      }
      const percentByCustomer = new Map(afterScroll!.visible.map(r => [r.customer, r.percent]));
      const trendByCustomer = new Map(afterScroll!.visible.map(r => [r.customer, r.trend]));
      assert.ok(
        Array.from(percentByCustomer.values()).some(v => v.includes('-60.00')),
        'Decline percent column must be readable on mobile'
      );
      assert.ok(
        Array.from(percentByCustomer.values()).some(v => v.includes('-100.00')),
        'Zero-purchase percent column must be readable on mobile'
      );
      assert.ok(
        Array.from(percentByCustomer.values()).some(v => v.includes('—')),
        'Empty-baseline percent placeholder must be readable on mobile'
      );
      assert.ok(
        Array.from(trendByCustomer.values()).some(v => v.includes('本期新增')),
        'New trend badge must be readable on mobile'
      );

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'report-comparison-mobile-390-table-right.png') });

      // No new report run may be created by mobile layout/scroll interactions.
      assert.equal(queryPostCount, 1, 'Mobile checks must not create a new query POST');
      assert.equal(
        paginationPostCount,
        autoQueryPostCountAtExplicitQuery,
        'Mobile checks must not issue any new /reports/query POST'
      );

      await page.setViewportSize(DESKTOP_VIEWPORT);

      // 6. Reporting must not mutate business/audit data.
      await fixture.assertSeedUnchanged();
    } finally {
      await context.close();
    }
  });
});
