import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const CREDS_PATH = '/tmp/huoyoupu-dev-mTw6IP/credentials.json';
const BASE_URL = 'http://localhost:5173';

const invDir = path.resolve('apps/web/src/pages/inventory/screenshots');
const finDir = path.resolve('apps/web/src/pages/finance/screenshots');

fs.mkdirSync(invDir, { recursive: true });
fs.mkdirSync(finDir, { recursive: true });

async function run() {
  if (!fs.existsSync(CREDS_PATH)) {
    console.error('Credentials file not found at', CREDS_PATH);
    process.exit(1);
  }
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));

  const browser = await chromium.launch({
    executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  console.log('Navigating to', BASE_URL);
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Login
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
  // 1. INVENTORY PAGES
  // ----------------------------------------------------------------
  console.log('--- 1. InventoryListPage ---');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.click('text="库存与批次"');
  await page.waitForTimeout(800);

  // Desktop Batches View
  await page.screenshot({ path: path.join(invDir, 'inventory-batches-desktop.png') });
  console.log('Saved inventory-batches-desktop.png');

  // Mobile Batches View
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(invDir, 'inventory-batches-mobile.png') });
  console.log('Saved inventory-batches-mobile.png');

  // Desktop Balances View
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.click('text="商品仓汇总"');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(invDir, 'inventory-balances-desktop.png') });
  console.log('Saved inventory-balances-desktop.png');

  // Desktop Receipts View
  await page.click('text="入库单记录"');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(invDir, 'inventory-receipts-desktop.png') });
  console.log('Saved inventory-receipts-desktop.png');

  // ----------------------------------------------------------------
  // 2. RECEIPT CREATE PAGE
  // ----------------------------------------------------------------
  console.log('--- 2. ReceiptCreatePage ---');
  await page.click('text="采购 / 期初入库登账"');
  await page.waitForTimeout(800);
  // Add a line to show interactive entry
  await page.click('text="增加入库明细行"');
  await page.waitForTimeout(400);

  // Desktop Receipt Create
  await page.screenshot({ path: path.join(invDir, 'receipt-create-desktop.png') });
  console.log('Saved receipt-create-desktop.png');

  // Mobile Receipt Create
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(invDir, 'receipt-create-mobile.png') });
  console.log('Saved receipt-create-mobile.png');

  // Back to inventory
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.click('text="← 返回"');
  await page.waitForTimeout(600);

  // ----------------------------------------------------------------
  // 3. STOCKTAKE WORKBENCH PAGE
  // ----------------------------------------------------------------
  console.log('--- 3. StocktakePage ---');
  await page.click('text="实盘盘点工作台"');
  await page.waitForTimeout(800);

  // Desktop Stocktake
  await page.screenshot({ path: path.join(invDir, 'stocktake-desktop.png') });
  console.log('Saved stocktake-desktop.png');

  // Mobile Stocktake
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(invDir, 'stocktake-mobile.png') });
  console.log('Saved stocktake-mobile.png');

  // Back to inventory
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.click('text="← 返回库存"');
  await page.waitForTimeout(600);

  // ----------------------------------------------------------------
  // 4. CUSTOMER FINANCE PAGE
  // ----------------------------------------------------------------
  console.log('--- 4. CustomerFinancePage ---');
  await page.click('text="往来与结算"');
  await page.waitForSelector('h1:has-text("客户往来对账与收退结算")');
  await page.waitForSelector('.fin-stat-card');

  // Desktop Finance
  await page.screenshot({ path: path.join(finDir, 'customer-finance-desktop.png') });
  console.log('Saved customer-finance-desktop.png');

  // Mobile Finance
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(finDir, 'customer-finance-mobile.png') });
  console.log('Saved customer-finance-mobile.png');

  // ----------------------------------------------------------------
  // 4.1 CASH EVENTS LEDGER PAGE (Explicit assertion & real data wait)
  // ----------------------------------------------------------------
  console.log('--- 4.1 CashEventsPage ---');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.click('button:has-text("收退款流水")');
  await page.waitForSelector('h1:has-text("收退款流水台账")');
  const cashTitle = await page.textContent('h1');
  if (!cashTitle?.includes('收退款流水台账')) {
    throw new Error(`Expected title "收退款流水台账", got "${cashTitle}"`);
  }
  await page.waitForSelector('.card-body table');
  await page.waitForTimeout(600);

  // Desktop Cash Events Ledger
  await page.screenshot({ path: path.join(finDir, 'cash-events-desktop.png') });
  console.log('Saved cash-events-desktop.png (verified on correct cash page)');

  // Mobile Cash Events Ledger
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(finDir, 'cash-events-mobile.png') });
  console.log('Saved cash-events-mobile.png (verified on correct cash page)');

  // Return to Customer Finance
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.click('button:has-text("客户往来明细")');
  await page.waitForSelector('h1:has-text("客户往来对账与收退结算")');

  // Desktop Receipt Modal with Manual Multi-Order Allocation
  await page.click('button:has-text("登记收款")');
  await page.waitForSelector('.modal-header:has-text("登记客户收款")');
  await page.click('text="手动指定多单分摊 (manual)"');
  await page.waitForSelector('.fin-alloc-summary');
  await page.screenshot({ path: path.join(finDir, 'customer-receipt-modal-desktop.png') });
  console.log('Saved customer-receipt-modal-desktop.png');

  // Close modal via ✕
  await page.click('.modal-header button:has-text("✕")');
  await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 3000 });
  await page.waitForTimeout(400);

  // ----------------------------------------------------------------
  // 5. STATEMENTS PAGE
  // ----------------------------------------------------------------
  console.log('--- 5. StatementsPage ---');
  await page.click('text="月结对账单快照"');
  await page.waitForSelector('h1:has-text("客户往来月结对账单")');
  await page.waitForSelector('.card-body table');
  await page.waitForTimeout(600);

  // Desktop Statements
  await page.screenshot({ path: path.join(finDir, 'statements-desktop.png') });
  console.log('Saved statements-desktop.png');

  // Mobile Statements
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(finDir, 'statements-mobile.png') });
  console.log('Saved statements-mobile.png');

  // Statement Detail Modal (Desktop)
  await page.setViewportSize({ width: 1280, height: 800 });
  const detailBtn = await page.$('button:has-text("查看明细")');
  if (detailBtn) {
    await detailBtn.click();
    await page.waitForSelector('.modal-header:has-text("对账快照明细")');
    await page.waitForSelector('.table tbody tr');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(finDir, 'statement-detail-desktop.png') });
    console.log('Saved statement-detail-desktop.png');
    await page.click('button:has-text("关闭")');
  }

  await context.close();
  await browser.close();
  console.log('ALL screenshots generated and saved cleanly!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
