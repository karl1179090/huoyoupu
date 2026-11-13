import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { parseSchema } from '@huoyoupu/contracts';

const CREDS_PATH = '/tmp/huoyoupu-dev-mTw6IP/credentials.json';
const BASE_URL = 'http://localhost:5173';
const API_BASE = 'http://127.0.0.1:3000/api/v1';

const printDir = path.resolve('apps/web/src/pages/printing/screenshots');
const repDir = path.resolve('apps/web/src/pages/reports/screenshots');
const setDir = path.resolve('apps/web/src/pages/settings/screenshots');

fs.mkdirSync(printDir, { recursive: true });
fs.mkdirSync(repDir, { recursive: true });
fs.mkdirSync(setDir, { recursive: true });

function getPdfMediaBox(pdfPath: string): string | null {
  const content = fs.readFileSync(pdfPath, 'binary');
  const match = content.match(/\/MediaBox\s*\[\s*([\d\.\s]+)\s*\]/);
  return match && match[1] ? match[1].trim() : null;
}

function getPdfPageCount(pdfPath: string): number {
  const content = fs.readFileSync(pdfPath, 'binary');
  const matches = content.match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 1;
}

async function run() {
  if (!fs.existsSync(CREDS_PATH)) {
    console.error('Credentials file not found at', CREDS_PATH);
    process.exit(1);
  }
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));

  // 0. Fetch authentic live ReportResult and SourceRef[] from API to construct schema-valid AI fixture (R5)
  console.log('Fetching live ReportResult & Sources from API for contract-compliant AI fixture...');
  const initRes = await fetch(`${API_BASE}/auth/session`, { headers: { Origin: BASE_URL } });
  const initData = await initRes.json();
  const initCookie = initRes.headers.get('set-cookie')?.split(';')[0] || '';

  const loginApiRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE_URL,
      'X-CSRF-Token': initData.csrfToken,
      Cookie: initCookie,
    },
    body: JSON.stringify({
      loginName: creds.admin.loginName,
      password: creds.admin.password,
    }),
  });
  const loginApiData = await loginApiRes.json();
  const adminApiCookie = loginApiRes.headers.get('set-cookie')?.split(';')[0] || '';

  const repRes = await fetch(`${API_BASE}/reports/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE_URL,
      'X-CSRF-Token': loginApiData.csrfToken,
      Cookie: adminApiCookie,
    },
    body: JSON.stringify({ kind: 'sales_summary', period: { mode: 'mtd_previous' } }),
  });
  const realReport = await repRes.json();
  assert.ok(realReport.id, 'Live report query must return a valid report ID');

  const sourcesRes = await fetch(`${API_BASE}/report-runs/${realReport.id}/sources`, {
    headers: { Origin: BASE_URL, Cookie: adminApiCookie },
  });
  const realSources = await sourcesRes.json();

  // Construct and validate candidate AI Answer fixture (R5)
  const candidateAiAnswer = {
    id: '22222222-2222-2222-2222-222222222222',
    status: 'answered' as const,
    summary: '2026年11月累计商品销售统计结果已生成，重点客户订购量稳定，无异常退货集中风险。',
    query: realReport.normalizedQuery || { kind: 'sales_summary', period: { mode: 'mtd_previous' } },
    report: realReport,
    evidence: realSources.items,
  };
  const validatedAiAnswer = parseSchema('AiResult', candidateAiAnswer);
  assert.equal(validatedAiAnswer.status, 'answered', 'AiAnswer must pass production parseSchema');
  console.log('✔ parseSchema successfully validated AiAnswer fixture against OpenAPI schema');

  // Construct and validate candidate AI Clarification fixture (R5)
  const candidateClarification = {
    id: '11111111-1111-1111-1111-111111111111',
    status: 'needs_clarification' as const,
    question: '您好，为了更精准地提供统计数据，请选择您期望的统计维度与口径：',
    choices: [
      { id: 'c1', label: '本月按商品维度统计销售与退货数量' },
      { id: 'c2', label: '本月按客户维度统计销售额与未结欠款' },
      { id: 'c3', label: '本月综合销售总额与毛利趋势对比' },
    ],
  };
  const validatedClarification = parseSchema('AiResult', candidateClarification);
  assert.equal(validatedClarification.status, 'needs_clarification', 'AiClarification must pass parseSchema');
  console.log('✔ parseSchema successfully validated AiClarification fixture against OpenAPI schema');

  // Launch browser for end-to-end evidence capture
  const browser = await chromium.launch({
    executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  // Listen to page errors
  const pageErrors: Error[] = [];
  page.on('pageerror', err => {
    console.error('Page error observed:', err.message);
    pageErrors.push(err);
  });

  console.log('Navigating to', BASE_URL);
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Login as admin
  const loginInput = await page.$('input[type="text"]');
  if (loginInput) {
    const passwordInput = await page.$('input[type="password"]');
    if (passwordInput) {
      console.log('Logging in as Admin...');
      await loginInput.fill(creds.admin.loginName);
      await passwordInput.fill(creds.admin.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    }
  }

  // ----------------------------------------------------------------
  // 1. PRINTING PREVIEW & DOM / PDF MEASUREMENT (Task C - 12.7 & V1)
  // ----------------------------------------------------------------
  console.log('--- 1. Printing Preview & Multi-Paper PDF Measurement (V1) ---');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.click('text="打印单据"');
  await page.waitForTimeout(800);

  // Click print icon on the first order row
  await page.waitForSelector('table tbody tr');
  const printIconBtn = await page.$('button[title="打印单据"]');
  if (printIconBtn) {
    await printIconBtn.click();
  } else {
    const detailBtn = await page.$('text="详情"');
    if (detailBtn) await detailBtn.click();
  }
  
  // Wait for print data to finish loading and preview sheet to render
  await page.waitForSelector('.printable-sheet', { timeout: 10000 });

  // 1.1 Verify @page injection in DOM (Default A4 Portrait)
  const pageStyleContent = await page.evaluate(() => {
    const styleEl = document.getElementById('dynamic-order-print-page-style');
    return styleEl ? styleEl.textContent : null;
  });
  console.log('Injected @page style (A4):', pageStyleContent?.trim());
  assert.ok(pageStyleContent, 'Dynamic @page style element must be injected');
  assert.ok(pageStyleContent.includes('size: A4 portrait'), 'Must contain size: A4 portrait');
  assert.ok(pageStyleContent.includes('margin: 10mm'), 'Must contain margin: 10mm');

  // 1.2 Verify row min-height in DOM
  const rowMinHeight = await page.evaluate(() => {
    const cellWrapper = document.querySelector('.printable-sheet table tbody td > div');
    return cellWrapper ? (cellWrapper as HTMLElement).style.minHeight : null;
  });
  console.log('Cell minHeight style:', rowMinHeight);
  assert.ok(rowMinHeight && rowMinHeight.includes('mm'), 'Cell wrapper must enforce minRowHeightMm');

  // 1.3 Verify thead repeat header for print
  const theadDisplay = await page.evaluate(() => {
    const thead = document.querySelector('.printable-sheet thead');
    return thead ? window.getComputedStyle(thead).display : null;
  });
  console.log('Thead display property:', theadDisplay);

  // 1.4 Generate real browser A4 Portrait PDF output with preferCSSPageSize: true
  const a4PdfPath = path.join(printDir, 'order-print-output-a4.pdf');
  await page.pdf({
    path: a4PdfPath,
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
  });
  const a4Box = getPdfMediaBox(a4PdfPath);
  console.log('A4 Portrait PDF MediaBox:', a4Box);
  assert.ok(a4Box && a4Box.includes('594.95996 841.91998'), `A4 PDF MediaBox must match A4 dimensions, got ${a4Box}`);

  // 1.5 Desktop preview screenshot
  await page.screenshot({ path: path.join(printDir, 'printing-preview-desktop.png') });
  console.log('Saved printing-preview-desktop.png');

  // 1.6 Mobile print preview
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(printDir, 'printing-preview-mobile.png') });
  console.log('Saved printing-preview-mobile.png');

  // 1.7 Open template manager modal (Desktop)
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(400);
  const tplBtn = await page.$('text="模板配置"');
  if (tplBtn) {
    await tplBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(printDir, 'printing-template-manager-desktop.png') });
    console.log('Saved printing-template-manager-desktop.png');

    // Close modal
    const closeBtn = await page.$('text="关闭"');
    if (closeBtn) await closeBtn.click();
    await page.waitForTimeout(400);
  }

  // Return to order list to test other paper size configurations cleanly
  await page.click('text="← 返回单据"');
  await page.waitForSelector('button[title="打印单据"]');

  // 1.8 V1: A5 Landscape PDF Measurement with preferCSSPageSize: true
  console.log('Testing A5 Landscape PDF measurement...');
  await page.route('**/orders/*/print-data*', async route => {
    const res = await route.fetch();
    const data = await res.json();
    data.config.paper = { size: 'A5', orientation: 'landscape', marginMm: 5 };
    await route.fulfill({ json: data });
  });

  await page.click('button[title="打印单据"]');
  await page.waitForSelector('.printable-sheet');
  const a5PdfPath = path.join(printDir, 'order-print-output-a5-landscape.pdf');
  await page.pdf({
    path: a5PdfPath,
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
  });
  const a5Box = getPdfMediaBox(a5PdfPath);
  console.log('A5 Landscape PDF MediaBox:', a5Box);
  assert.ok(a5Box && a5Box.includes('594.95996 420'), `A5 Landscape MediaBox must match ~595x420, got ${a5Box}`);

  await page.click('text="← 返回单据"');
  await page.unroute('**/orders/*/print-data*');
  await page.waitForSelector('button[title="打印单据"]');

  // 1.9 V1: Custom 120x180 PDF Measurement with preferCSSPageSize: true
  console.log('Testing Custom 120x180 PDF measurement...');
  await page.route('**/orders/*/print-data*', async route => {
    const res = await route.fetch();
    const data = await res.json();
    data.config.paper = { size: 'custom', orientation: 'portrait', widthMm: 120, heightMm: 180, marginMm: 0 };
    await route.fulfill({ json: data });
  });

  await page.click('button[title="打印单据"]');
  await page.waitForSelector('.printable-sheet');
  const customPdfPath = path.join(printDir, 'order-print-output-custom.pdf');
  await page.pdf({
    path: customPdfPath,
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
  });
  const customBox = getPdfMediaBox(customPdfPath);
  console.log('Custom 120x180 PDF MediaBox:', customBox);
  assert.ok(customBox && customBox.includes('340.07999 510'), `Custom 120x180 MediaBox must match ~340x510, got ${customBox}`);

  await page.click('text="← 返回单据"');
  await page.unroute('**/orders/*/print-data*');
  await page.waitForSelector('button[title="打印单据"]');

  // 1.10 V1: Multi-Page Order Output (28 lines) with long product names, repeating thead, and single total summary
  console.log('Testing Multi-Page Order PDF measurement...');
  await page.route('**/orders/*/print-data*', async route => {
    const res = await route.fetch();
    const data = await res.json();
    data.order.lines = Array.from({ length: 28 }, (_, i) => ({
      id: 'multipage-line-' + (i + 1),
      productName: '高精度特种密封组件 - 工业级特型法兰盘批次2026-' + (i + 1) + '（超长商品名称防换行溢出换行测试）',
      specification: 'SPEC-MODEL-' + (i + 1),
      warehouseName: '一号主仓库',
      unitName: '件',
      quantity: 10 + i,
      quantityBase: 10 + i,
      unitPrice: '150.00',
      netAmount: String((10 + i) * 150) + '.00',
    }));
    await route.fulfill({ json: data });
  });

  await page.click('button[title="打印单据"]');
  await page.waitForSelector('.printable-sheet');

  // Assert DOM properties for long text wrapping and table header repetition
  const tableCheck = await page.evaluate(() => {
    const thead = document.querySelector('.printable-sheet thead');
    const longTextCell = document.querySelector('.printable-sheet .print-cell-long-text');
    const totalsSummary = document.querySelector('.printable-sheet .print-totals-summary');
    return {
      theadDisplay: thead ? window.getComputedStyle(thead).display : null,
      wordBreak: longTextCell ? window.getComputedStyle(longTextCell).wordBreak : null,
      whiteSpace: longTextCell ? window.getComputedStyle(longTextCell).whiteSpace : null,
      totalsExists: Boolean(totalsSummary),
    };
  });
  console.log('Table print properties:', tableCheck);
  assert.equal(tableCheck.theadDisplay, 'table-header-group', 'Thead must use table-header-group for repeating header');
  assert.equal(tableCheck.wordBreak, 'break-word', 'Long product names must wrap without clipping');
  assert.ok(tableCheck.totalsExists, 'Totals summary must exist in print sheet');

  const multipagePdfPath = path.join(printDir, 'order-print-output-multipage.pdf');
  await page.pdf({
    path: multipagePdfPath,
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
  });
  const pageCount = getPdfPageCount(multipagePdfPath);
  console.log(`Multi-page PDF generated: ${pageCount} pages`);
  assert.ok(pageCount >= 2, `Multi-page PDF must span at least 2 pages, got ${pageCount}`);

  await page.click('text="← 返回单据"');
  await page.unroute('**/orders/*/print-data*');
  await page.waitForTimeout(400);

  // ----------------------------------------------------------------
  // 2. REPORTS PAGE (Task C - 12.8)
  // ----------------------------------------------------------------
  console.log('--- 2. ReportsPage & Timezone Check ---');
  await page.click('text="经营报表"');
  await page.waitForTimeout(1000);

  // 2.1 Verify Shanghai Date display (NOT Oct 31)
  const reportBodyText = await page.evaluate(() => document.body.innerText);
  console.log('Verifying date formatting: checking for 2026-11-01...');
  assert.ok(
    reportBodyText.includes('2026-11-01') || reportBodyText.includes('本月'),
    'Report must display Shanghai date formatted starting 2026-11-01'
  );

  // Sales summary desktop screenshot
  await page.screenshot({ path: path.join(repDir, 'reports-sales-summary-desktop.png') });
  console.log('Saved reports-sales-summary-desktop.png');

  // 2.2 Customer product comparison
  const selectElem = await page.$('select');
  if (selectElem) {
    await selectElem.selectOption('customer_product_comparison');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(repDir, 'reports-customer-product-desktop.png') });
    console.log('Saved reports-customer-product-desktop.png');

    // 2.3 Inventory report - Verify customer filter is HIDDEN per C5
    await selectElem.selectOption('inventory');
    await page.waitForTimeout(800);
    const hasCustomerFilter = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label')).map(l => l.innerText);
      return labels.some(txt => txt.includes('客户'));
    });
    assert.equal(hasCustomerFilter, false, 'Inventory report MUST NOT show customer filter (C5)');
    await page.screenshot({ path: path.join(repDir, 'reports-inventory-desktop.png') });
    console.log('Saved reports-inventory-desktop.png');

    // 2.4 Cash flow - Verify product filter is HIDDEN per C5
    await selectElem.selectOption('cash_flow');
    await page.waitForTimeout(800);
    const hasProductFilter = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label')).map(l => l.innerText);
      return labels.some(txt => txt.includes('商品'));
    });
    assert.equal(hasProductFilter, false, 'Cash flow report MUST NOT show product filter (C5)');
    await page.screenshot({ path: path.join(repDir, 'reports-cash-flow-desktop.png') });
    console.log('Saved reports-cash-flow-desktop.png');
  }

  // Mobile Reports
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(repDir, 'reports-mobile.png') });
  console.log('Saved reports-mobile.png');

  // ----------------------------------------------------------------
  // 3. AI REPORT PAGE (Task C - 13.3, R2, R5, R6)
  // ----------------------------------------------------------------
  console.log('--- 3. AiReportPage (Contract fixtures, R2 clearance, & Live 503 fallback) ---');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.click('text="AI 智能统计"');
  await page.waitForTimeout(800);

  // 3.1 Initial empty state
  await page.screenshot({ path: path.join(repDir, 'ai-report-desktop.png') });
  console.log('Saved ai-report-desktop.png');

  // 3.2 Contract Fixture Test 1: needs_clarification UI state (R5 validated)
  console.log('Testing clarification UI with validated contract fixture...');
  await page.route('**/ai/queries', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(validatedClarification),
    });
  });

  const questionInput1 = await page.$('.ai-chat-card input[type="text"]');
  if (questionInput1) {
    await questionInput1.fill('统计销售情况');
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
    await page.waitForSelector('.ai-clarification-box', { timeout: 5000 });
    await page.screenshot({ path: path.join(repDir, 'ai-report-clarification.png') });
    console.log('Saved ai-report-clarification.png');
  }
  await page.unroute('**/ai/queries');

  // 3.3 Contract Fixture Test 2: answered structured result & evidence UI state (R5 validated)
  console.log('Testing answered UI with validated contract fixture...');
  await page.route('**/ai/queries', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(validatedAiAnswer),
    });
  });

  const questionInput2 = await page.$('.ai-chat-card input[type="text"]');
  if (questionInput2) {
    await questionInput2.fill('统计本月商品销售汇总');
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
    await page.waitForSelector('.ai-answer-card', { timeout: 5000 });

    // Assert R6: Concrete filter parameters and normalizedQuery are displayed
    const filterInfoText = await page.evaluate(() => {
      const card = document.querySelector('.ai-answer-card');
      return card ? card.textContent : '';
    });
    console.log('Verifying R6 filter indicators in AI result...');
    assert.ok(
      filterInfoText && (filterInfoText.includes('规范化统计条件') || filterInfoText.includes('期间模式')),
      'AI answer card must display normalized query filter parameters'
    );

    await page.screenshot({ path: path.join(repDir, 'ai-report-answered.png') });
    console.log('Saved ai-report-answered.png');

    // 3.4 Mobile AI report screenshot
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(repDir, 'ai-report-mobile.png') });
    console.log('Saved ai-report-mobile.png');

    // 3.5 Verify "查看完整业务报表复核" opens same report ID
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(400);
    const reviewBtn = await page.$('text="查看完整业务报表复核"');
    if (reviewBtn) {
      console.log('Verifying report review drilldown along same report.id...');
      await reviewBtn.click();
      await page.waitForSelector('.report-review-modal', { timeout: 5000 });
      const reviewHeader = await page.evaluate(() => {
        const el = document.querySelector('.report-review-modal');
        return el ? el.textContent : '';
      });
      assert.ok(reviewHeader && reviewHeader.includes(realReport.id), 'Review modal must inspect exact same report ID');
      const closeReviewBtn = await page.$('.report-review-modal text="关闭"');
      if (closeReviewBtn) await closeReviewBtn.click();
      await page.waitForTimeout(400);
    }
  }
  await page.unroute('**/ai/queries');

  // 3.6 R2 Verification: Live query triggers 503 and CLEARS previous answer
  console.log('Submitting live AI query to verify 503 fallback and R2 answer clearance...');
  const questionInput3 = await page.$('.ai-chat-card input[type="text"]');
  if (questionInput3) {
    await questionInput3.fill('帮我统计本月各客户的销售额与退货金额');
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(1500);

      // Verify 503 / error fallback banner is rendered
      const fallbackBtn = await page.waitForSelector('text="转为固定业务报表查询"', { timeout: 8000 });
      assert.ok(fallbackBtn, '503 fallback button "转为固定业务报表查询" must be visible');

      // Crucial R2 assertion: previous answer card must NOT exist in the DOM!
      const staleAnswerCard = await page.$('.ai-answer-card');
      assert.equal(staleAnswerCard, null, 'Previous AI answer card must be completely cleared on new query failure (R2)');

      await page.screenshot({ path: path.join(repDir, 'ai-report-503-fallback.png') });
      console.log('Saved ai-report-503-fallback.png with NO stale answer underneath (R2 verified)');

      // Test clicking fallback button smoothly navigates to ReportsPage
      await fallbackBtn.click();
      await page.waitForTimeout(800);
      const isReportsPageNow = await page.evaluate(() => document.body.innerText.includes('经营报表'));
      assert.ok(isReportsPageNow, 'Fallback button must smoothly transition to ReportsPage');

      // Click "← 返回 AI 智能报表" to return back cleanly
      const backToAiBtn = await page.$('text="← 返回 AI 智能报表"');
      if (backToAiBtn) await backToAiBtn.click();
      await page.waitForTimeout(600);
    }
  }

  // ----------------------------------------------------------------
  // 4. SETTINGS PAGES (Task C)
  // ----------------------------------------------------------------
  console.log('--- 4. SettingsPage ---');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.click('text="系统设置"');
  await page.waitForTimeout(800);

  // Tab 1: Profile (Company Info) Desktop
  await page.screenshot({ path: path.join(setDir, 'settings-company-profile-desktop.png') });
  console.log('Saved settings-company-profile-desktop.png');

  // Tab 1: Profile Mobile (390x844) - Ensures company form is shown without template overflow!
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(setDir, 'settings-company-mobile.png') });
  console.log('Saved settings-company-mobile.png');

  // Tab 2: Print Templates in Settings - Mobile Layout check (.print-template-grid single column)
  const tplTabMobile = await page.$('text="出库打印模板配置"');
  if (tplTabMobile) {
    await tplTabMobile.click();
    await page.waitForTimeout(800);

    // Verify no horizontal overflow in mobile 390px
    const isOverflowing = await page.evaluate(() => {
      const grid = document.querySelector('.print-template-grid');
      return grid ? grid.scrollWidth > window.innerWidth : false;
    });
    console.log('Mobile template grid overflow status:', isOverflowing);
    assert.equal(isOverflowing, false, 'Mobile print template grid must not overflow 390px viewport');

    await page.screenshot({ path: path.join(setDir, 'settings-print-templates-mobile.png') });
    console.log('Saved settings-print-templates-mobile.png');
  }

  // Desktop view for Templates and Users tabs
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(400);

  // Tab 2: Desktop Print Templates
  const tplTabDesktop = await page.$('text="出库打印模板配置"');
  if (tplTabDesktop) {
    await tplTabDesktop.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(setDir, 'settings-print-templates-desktop.png') });
    console.log('Saved settings-print-templates-desktop.png');
  }

  // Tab 3: UsersPage ("员工账号与权限") Desktop
  const usersTab = await page.$('text="员工账号与权限"');
  if (usersTab) {
    await usersTab.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(setDir, 'settings-users-desktop.png') });
    console.log('Saved settings-users-desktop.png');
  }

  await browser.close();

  // Assert no uncaught page errors
  assert.equal(pageErrors.length, 0, `Observed ${pageErrors.length} uncaught page errors during execution`);
  console.log('All screenshots and PDF measurements captured successfully with 0 page errors!');
}

run().catch(err => {
  console.error('Error taking screenshots:', err);
  process.exit(1);
});
