import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export interface DeploymentCredentials {
  admin: {
    loginName: string;
    password: string;
  };
  employee: {
    loginName: string;
    password: string;
  };
  ids: {
    orderId: string;
    revisionId: string;
    productId: string;
    warehouseId: string;
    batchId: string;
    customerId: string;
    ledgerEntryId: string;
  };
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

const deployOrigin = process.env.HYP_DEPLOY_ORIGIN?.trim();
const credsPath = process.env.HYP_DEPLOY_CREDENTIALS_FILE?.trim();
const spkiPin = process.env.HYP_DEPLOY_TLS_SPKI?.trim();

// Unconfigured check: when neither is set, cleanly skip the suite
const isUnconfigured = !deployOrigin && !credsPath;

if (isUnconfigured) {
  test('部署专用入口验证', (t) => {
    t.skip('部署专用入口未配置: HYP_DEPLOY_ORIGIN 或 HYP_DEPLOY_CREDENTIALS_FILE 未设置');
  });
} else {
  describe('Mini HTTPS Deployment Container & Browser Smoke Tests (Task 14.3)', () => {
    let creds: DeploymentCredentials;

    before(() => {
      // 1. Strict security check: never allow disabling TLS verification globally
      assert.notEqual(
        process.env.NODE_TLS_REJECT_UNAUTHORIZED,
        '0',
        'NODE_TLS_REJECT_UNAUTHORIZED=0 is strictly forbidden; must rely on NODE_EXTRA_CA_CERTS'
      );

      // 2. Configuration was supplied: verify that all required variables and files are present
      assert.ok(deployOrigin, 'HYP_DEPLOY_ORIGIN must be set (e.g. https://<ip>:<port>)');
      assert.ok(deployOrigin.startsWith('https://'), `HYP_DEPLOY_ORIGIN must start with https://, received: ${deployOrigin}`);
      assert.ok(credsPath, 'HYP_DEPLOY_CREDENTIALS_FILE must be set to the path of the private JSON file');
      assert.ok(fs.existsSync(credsPath), `HYP_DEPLOY_CREDENTIALS_FILE does not exist at: ${credsPath}`);

      try {
        creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
      } catch (err: unknown) {
        assert.fail(`HYP_DEPLOY_CREDENTIALS_FILE must contain valid JSON: ${err instanceof Error ? err.message : String(err)}`);
      }

      assert.ok(creds.admin?.loginName, 'Credentials file must define admin.loginName');
      assert.ok(creds.admin?.password, 'Credentials file must define admin.password');
      assert.ok(creds.employee?.loginName, 'Credentials file must define employee.loginName');
      assert.ok(creds.employee?.password, 'Credentials file must define employee.password');
      assert.ok(creds.ids?.orderId, 'Credentials file must define ids.orderId');
      assert.ok(creds.ids?.revisionId, 'Credentials file must define ids.revisionId');
      assert.ok(creds.ids?.productId, 'Credentials file must define ids.productId');
      assert.ok(creds.ids?.warehouseId, 'Credentials file must define ids.warehouseId');
      assert.ok(creds.ids?.batchId, 'Credentials file must define ids.batchId');
      assert.ok(creds.ids?.customerId, 'Credentials file must define ids.customerId');
      assert.ok(creds.ids?.ledgerEntryId, 'Credentials file must define ids.ledgerEntryId');
    });

    test('1. Environment variables & credentials integrity verified', () => {
      assert.ok(creds && creds.admin && creds.employee && creds.ids);
    });

    test('2. Node fetch HTTPS health, index HTML, hashed static assets & 404 missing asset probe', async () => {
      // 2.1 Health check
      const healthUrl = new URL('/health', deployOrigin!).toString();
      const healthRes = await fetch(healthUrl);
      assert.equal(healthRes.status, 200, `GET ${healthUrl} must return 200 OK`);

      // 2.2 Index HTML check
      const indexUrl = new URL('/', deployOrigin!).toString();
      const indexRes = await fetch(indexUrl);
      assert.equal(indexRes.status, 200, `GET ${indexUrl} must return 200 OK`);
      const indexContentType = indexRes.headers.get('content-type') || '';
      assert.ok(indexContentType.includes('text/html'), `Index HTML must have text/html content-type, got: ${indexContentType}`);
      const indexHtml = await indexRes.text();
      assert.ok(indexHtml.includes('<div id="root">') || indexHtml.includes('id="root"'), 'Index HTML must contain the root mount element');

      // 2.3 Discover hashed JS and CSS assets
      const jsAssets = [...indexHtml.matchAll(/\/assets\/[a-zA-Z0-9_.-]+\.js/g)].map(m => m[0]);
      const cssAssets = [...indexHtml.matchAll(/\/assets\/[a-zA-Z0-9_.-]+\.css/g)].map(m => m[0]);
      assert.ok(jsAssets.length > 0, 'Index HTML must reference at least one hashed JS asset under /assets/');
      assert.ok(cssAssets.length > 0, 'Index HTML must reference at least one hashed CSS asset under /assets/');

      // 2.4 Verify JS asset
      const jsUrl = new URL(jsAssets[0]!, deployOrigin!).toString();
      const jsRes = await fetch(jsUrl);
      assert.equal(jsRes.status, 200, `GET JS asset ${jsAssets[0]} must return 200 OK`);
      const jsContentType = jsRes.headers.get('content-type') || '';
      assert.ok(
        jsContentType.includes('javascript'),
        `JS asset must have javascript content-type, got: ${jsContentType}`
      );
      assert.ok(
        !jsContentType.includes('text/html'),
        'JS asset must NOT return fallback HTML'
      );
      const jsBody = await jsRes.text();
      assert.ok(!jsBody.includes('<!DOCTYPE html>') && !jsBody.includes('<html'), 'JS asset content must not be HTML');

      // 2.5 Verify CSS asset
      const cssUrl = new URL(cssAssets[0]!, deployOrigin!).toString();
      const cssRes = await fetch(cssUrl);
      assert.equal(cssRes.status, 200, `GET CSS asset ${cssAssets[0]} must return 200 OK`);
      const cssContentType = cssRes.headers.get('content-type') || '';
      assert.ok(
        cssContentType.includes('text/css'),
        `CSS asset must have text/css content-type, got: ${cssContentType}`
      );
      assert.ok(
        !cssContentType.includes('text/html'),
        'CSS asset must NOT return fallback HTML'
      );
      const cssBody = await cssRes.text();
      assert.ok(!cssBody.includes('<!DOCTYPE html>') && !cssBody.includes('<html'), 'CSS asset content must not be HTML');

      // 2.6 Missing static asset probe: Caddy must return 404, not fallback HTML
      const probeUrl = new URL(`/assets/probe-non-existent-${Date.now()}.js`, deployOrigin!).toString();
      const probeRes = await fetch(probeUrl);
      assert.equal(probeRes.status, 404, `Missing asset ${probeUrl} must return 404 Not Found and not fall back to index.html`);
    });

    test('3. Chromium TLS SPKI pinning validation (when HYP_DEPLOY_TLS_SPKI is provided)', async (t) => {
      if (!spkiPin) {
        t.skip('HYP_DEPLOY_TLS_SPKI not provided; skipping browser SPKI negative/positive validation');
        return;
      }

      const cleanSpki = spkiPin.replace(/^sha256\//, '');
      const bogusPin = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

      // Strict certificate error check: only accept explicit ERR_CERT_* errors, reject generic network errors/timeouts
      const isCertError = (msg: string) => /net::ERR_CERT_|ERR_CERT_/i.test(msg);

      // 3.1 Negative check 1: Fresh independent browser with NO SPKI pin (must fail certificate check)
      const noPinOptions = getLaunchOptions([]);
      const noPinBrowser = await chromium.launch(noPinOptions);
      try {
        const noPinContext = await noPinBrowser.newContext();
        const noPinPage = await noPinContext.newPage();
        let failedWithCertError = false;
        try {
          await noPinPage.goto(deployOrigin!, { timeout: 10000 });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (isCertError(msg)) {
            failedWithCertError = true;
          }
        } finally {
          await noPinContext.close().catch(() => {});
        }
        assert.ok(
          failedWithCertError,
          'Fresh browser with NO SPKI pin must reject certificate with explicit ERR_CERT_* error (connection refused / timeout not accepted)'
        );
      } finally {
        await noPinBrowser.close().catch(() => {});
      }

      // 3.2 Negative check 2: Fresh independent browser with BOGUS SPKI pin
      const bogusOptions = getLaunchOptions([`--ignore-certificate-errors-spki-list=${bogusPin}`]);
      const bogusBrowser = await chromium.launch(bogusOptions);
      try {
        const bogusContext = await bogusBrowser.newContext();
        const bogusPage = await bogusContext.newPage();
        let failedWithCertError = false;
        try {
          await bogusPage.goto(deployOrigin!, { timeout: 10000 });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (isCertError(msg)) {
            failedWithCertError = true;
          }
        } finally {
          await bogusContext.close().catch(() => {});
        }
        assert.ok(
          failedWithCertError,
          'Fresh browser with BOGUS SPKI pin must reject certificate with explicit ERR_CERT_* error (connection refused / timeout not accepted)'
        );
      } finally {
        await bogusBrowser.close().catch(() => {});
      }

      // 3.3 Positive check: Fresh independent browser with valid leaf SPKI pin
      const validOptions = getLaunchOptions([`--ignore-certificate-errors-spki-list=${cleanSpki}`]);
      const validBrowser = await chromium.launch(validOptions);
      try {
        const validContext = await validBrowser.newContext();
        const validPage = await validContext.newPage();
        const res = await validPage.goto(deployOrigin!, { waitUntil: 'domcontentloaded', timeout: 15000 });
        assert.ok(res !== null && res.ok(), 'Fresh browser with correct leaf SPKI pin must connect cleanly over HTTPS with 200 OK');
        await validContext.close().catch(() => {});
      } finally {
        await validBrowser.close().catch(() => {});
      }
    });

    test('4. Read-only Browser Smoke: Auth lifecycle, deep linking, source resolution, and role gating', async () => {
      // Build browser launch args
      const browserArgs: string[] = [];
      if (spkiPin) {
        browserArgs.push(`--ignore-certificate-errors-spki-list=${spkiPin.replace(/^sha256\//, '')}`);
      }

      const launchOptions = getLaunchOptions(browserArgs);
      const browser: Browser = await chromium.launch(launchOptions);
      let context: BrowserContext | null = null;

      try {
        context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page: Page = await context.newPage();

        // 4.0 Strict business write monitoring: Only auth endpoints allowed
        const forbiddenWrites: { method: string; url: string }[] = [];
        const allowedWritePaths = ['/api/v1/auth/login', '/api/v1/auth/logout'];

        page.on('request', req => {
          const method = req.method().toUpperCase();
          if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
            const url = req.url();
            const isAllowed = allowedWritePaths.some(p => url.includes(p));
            if (!isAllowed) {
              forbiddenWrites.push({ method, url });
            }
          }
        });

        // 4.1 Anonymous session challenge -> admin UI login
        await page.goto(deployOrigin!, { waitUntil: 'networkidle' });
        await page.waitForSelector('input[type="password"]', { timeout: 15000 });
        await page.waitForSelector('button[type="submit"]', { timeout: 15000 });
        assert.ok(await page.locator('button[type="submit"]').isVisible(), 'Anonymous visit must present login form');

        // Fill admin credentials
        await page.fill('input[placeholder*="用户名"], input[type="text"]', creds.admin.loginName);
        await page.fill('input[type="password"]', creds.admin.password);
        await page.click('button[type="submit"]');

        // Wait for admin workbench
        await page.waitForSelector('text=销售开单工作台', { timeout: 15000 });
        assert.ok(await page.locator('text=管理员').first().isVisible(), 'Admin role badge must be visible after login');

        // 4.2 Historical order revision deep link (strictly without /api/v1 in frontend URL)
        const revisionPath = `/orders/${creds.ids.orderId}/revisions/${creds.ids.revisionId}`;
        const revisionDeepLink = new URL(revisionPath, deployOrigin!).toString();
        const revisionApiUrl = `/api/v1/orders/${creds.ids.orderId}/revisions/${creds.ids.revisionId}`;

        const [apiRes] = await Promise.all([
          page.waitForResponse(resp => resp.url().includes(revisionApiUrl) && resp.status() === 200, { timeout: 15000 }),
          page.goto(revisionDeepLink, { waitUntil: 'networkidle' }),
        ]);
        assert.ok(apiRes.ok(), `Direct deep link must trigger GET ${revisionApiUrl} with 200 OK`);

        // Assert read-only historical revision snapshot is rendered
        await page.waitForSelector('text=【历史版本只读快照', { timeout: 15000 });
        const snapshotBannerVisible = await page.locator('text=【历史版本只读快照').isVisible();
        assert.ok(snapshotBannerVisible, 'Historical order revision snapshot banner must be visible');

        // Assert page is strictly read-only: modify/void/confirm actions are not active
        const confirmBtn = page.locator('button:has-text("确认订单")');
        assert.equal(await confirmBtn.isVisible(), false, 'Confirm order button must NOT be present in historical revision view');
        const voidBtn = page.locator('button:has-text("作废订单")');
        assert.equal(await voidBtn.isVisible(), false, 'Void order button must NOT be present in historical revision view');

        // 4.3 Batch query + fragment source alias navigation via huoyoupu:navigate
        const batchHref = `/api/v1/inventory/batches?productId=${creds.ids.productId}&warehouseId=${creds.ids.warehouseId}#${creds.ids.batchId}`;
        let attemptedApiGoto = false;
        const navRequestListener = (req: any) => {
          if (req.isNavigationRequest && req.isNavigationRequest() && req.url().includes('/api/v1/')) {
            attemptedApiGoto = true;
          }
        };
        page.on('request', navRequestListener);

        // Wait for real GET /api/v1/inventory/batches containing productId and warehouseId query parameters
        const [batchApiRes] = await Promise.all([
          page.waitForResponse(resp => {
            const u = resp.url();
            return (
              u.includes('/api/v1/inventory/batches') &&
              u.includes(`productId=${creds.ids.productId}`) &&
              u.includes(`warehouseId=${creds.ids.warehouseId}`) &&
              resp.status() === 200
            );
          }, { timeout: 15000 }),
          page.evaluate((href) => {
            window.dispatchEvent(new CustomEvent('huoyoupu:navigate', { detail: { href } }));
          }, batchHref),
        ]);

        assert.ok(batchApiRes.ok(), 'Real GET /api/v1/inventory/batches with productId & warehouseId must return 200 OK');

        // Assert API payload contains the exact target batchId
        const batchPayload = await batchApiRes.json();
        assert.ok(Array.isArray(batchPayload.items), 'Batches API response must contain items array');
        const targetBatchInApi = batchPayload.items.find((b: any) => b.id === creds.ids.batchId);
        assert.ok(
          targetBatchInApi,
          `Batches API response must contain target batchId ${creds.ids.batchId}`
        );

        // Assert UI navigation and row location
        await page.waitForSelector('text=库存余量、批次与入库台账', { timeout: 15000 });
        assert.ok(!attemptedApiGoto, 'huoyoupu:navigate must resolve source internally without page.goto to API URL');

        // Assert target batch row is located, visible, and displays the short batch hash in UI
        const targetBatchRow = page.locator(`#batch-${creds.ids.batchId}`);
        await targetBatchRow.waitFor({ state: 'visible', timeout: 15000 });
        assert.ok(
          await targetBatchRow.isVisible(),
          `Target batch row #batch-${creds.ids.batchId} must be visible in the inventory list`
        );
        const rowText = await targetBatchRow.textContent();
        assert.ok(
          rowText?.includes(`#${creds.ids.batchId.substring(0, 8)}`),
          `Target batch row must display short hash #${creds.ids.batchId.substring(0, 8)}`
        );

        page.off('request', navRequestListener);

        // 4.4 Admin logout -> Employee login (Zero page reloads) & Employee view check
        let pageReloadCount = 0;
        page.on('framenavigated', frame => {
          if (frame === page.mainFrame()) {
            pageReloadCount++;
          }
        });

        // Click admin logout
        await page.click('button[title="退出登录"]');
        await page.waitForSelector('input[type="password"]', { timeout: 15000 });
        assert.equal(pageReloadCount, 0, 'Admin logout must not trigger a full page reload');

        // Login as employee
        await page.fill('input[placeholder*="用户名"], input[type="text"]', creds.employee.loginName);
        await page.fill('input[type="password"]', creds.employee.password);
        await page.click('button[type="submit"]');

        // Employee landing view: Order list
        await page.waitForSelector('text=销售订单管理', { timeout: 15000 });
        assert.ok(await page.locator('text=员工').first().isVisible(), 'Employee role badge must be visible');
        assert.equal(pageReloadCount, 0, 'Employee login must not trigger a full page reload');

        // Employee print entrance check
        const printButton = page.locator('button[title="打印单据"]').first();
        await printButton.waitFor({ state: 'visible', timeout: 10000 });
        assert.ok(await printButton.isVisible(), 'Print entrance (button[title="打印单据"]) must be visible on employee orders view');

        // 4.5 Employee direct finance / customer ledger navigation blocked with 403 without mounting admin APIs
        // Strictly monitors customer / ledger / finance endpoints AND management endpoints during this navigation attempt window:
        // /customers (and subpaths e.g. /customers/:id/ledger, /customers/:id/balance),
        // /cash-events, /statements, /company, /print-templates, /users, /settings.
        // (Note: does not restrict employee legitimate order/template reading or auth/session).
        const forbiddenFinanceAndAdminCalls: string[] = [];
        const isForbiddenFinanceOrAdminPath = (urlStr: string): boolean => {
          try {
            const urlObj = new URL(urlStr);
            const p = urlObj.pathname;
            return (
              p === '/api/v1/customers' || p.startsWith('/api/v1/customers/') ||
              p === '/api/v1/cash-events' || p.startsWith('/api/v1/cash-events/') ||
              p === '/api/v1/statements' || p.startsWith('/api/v1/statements/') ||
              p === '/api/v1/company' || p.startsWith('/api/v1/company/') ||
              p === '/api/v1/print-templates' || p.startsWith('/api/v1/print-templates/') ||
              p === '/api/v1/users' || p.startsWith('/api/v1/users/') ||
              p === '/api/v1/settings' || p.startsWith('/api/v1/settings/')
            );
          } catch {
            return false;
          }
        };
        const financeAndAdminMonitor = (req: any) => {
          const u = req.url();
          if (isForbiddenFinanceOrAdminPath(u)) {
            forbiddenFinanceAndAdminCalls.push(u);
          }
        };
        page.on('request', financeAndAdminMonitor);

        // Dispatch authentic customer ledger source navigation: /api/v1/customers/<customerId>/ledger#<ledgerEntryId>
        // resolveSourceHref maps this to page: 'finance', which is in ADMIN_ONLY_PAGES.
        // Employee must be gated with a 403 screen without mounting CustomerFinancePage or calling customer/finance/admin APIs.
        const customerLedgerHref = `/api/v1/customers/${creds.ids.customerId}/ledger#${creds.ids.ledgerEntryId}`;

        await page.evaluate((href) => {
          window.dispatchEvent(new CustomEvent('huoyoupu:navigate', { detail: { href } }));
        }, customerLedgerHref);

        await page.waitForSelector('text=403 访问权限受限', { timeout: 15000 });
        assert.ok(
          await page.locator('text=403 访问权限受限').isVisible(),
          '403 Forbidden screen must be shown for employee attempting to navigate to customer ledger finance view'
        );
        assert.equal(
          forbiddenFinanceAndAdminCalls.length,
          0,
          `No customer/finance/admin APIs (/customers, /cash-events, /statements, /company, /print-templates, /users) must be called during employee 403 navigation window. Detected: ${JSON.stringify(forbiddenFinanceAndAdminCalls)}`
        );
        assert.equal(pageReloadCount, 0, '403 navigation must not trigger a full page reload');
        page.off('request', financeAndAdminMonitor);

        // Click return to orders
        await page.click('button:has-text("返回订单列表")');
        await page.waitForSelector('text=销售订单管理', { timeout: 15000 });

        // 4.6 Employee logout -> Admin login (Zero page reloads)
        await page.click('button[title="退出登录"]');
        await page.waitForSelector('input[type="password"]', { timeout: 15000 });
        assert.equal(pageReloadCount, 0, 'Employee logout must not trigger a full page reload');

        await page.fill('input[placeholder*="用户名"], input[type="text"]', creds.admin.loginName);
        await page.fill('input[type="password"]', creds.admin.password);
        await page.click('button[type="submit"]');

        await page.waitForSelector('text=销售开单工作台', { timeout: 15000 });
        assert.ok(await page.locator('text=管理员').first().isVisible(), 'Admin role badge must be visible after re-login');
        assert.equal(pageReloadCount, 0, 'Entire session alternation lifecycle must succeed with ZERO full page reloads');

        // 4.7 Audit business write calls
        assert.equal(
          forbiddenWrites.length,
          0,
          `Strictly zero business writes allowed during deployment smoke test. Forbidden requests: ${JSON.stringify(forbiddenWrites)}`
        );
      } finally {
        if (context) {
          await context.close().catch(() => {});
        }
        await browser.close().catch(() => {});
      }
    });
  });
}
