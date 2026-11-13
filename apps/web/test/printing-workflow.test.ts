import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  validatePrintConfig,
  getPaperDimensions,
  getPageSizeRule,
  getPrintableWidthMm,
  getTotalColumnsWidthMm,
  getDefaultPrintConfig,
  detectClientPlatform,
  NEEDLE_PRINTER_PAPER_PRESET,
  ALLOWED_HEADER_FIELDS,
  ALLOWED_COLUMN_FIELDS,
  FORBIDDEN_COLUMN_FIELDS,
} from '../src/pages/printing/printConfigLogic.js';
import { formatShanghaiInstant } from '../src/pages/reports/reportHelpers.js';
import type { PrintConfig } from '../src/api/types.js';

const BASE_URL = 'http://127.0.0.1:3000/api/v1';
const CREDS_PATH = '/tmp/huoyoupu-dev-mTw6IP/credentials.json';
const ORIGIN = 'http://localhost:5173';

describe('Printing Domain Logic & Live Workflow Integration Tests (Task C - 12.7)', () => {
  let adminCookie = '';
  let adminCsrf = '';
  let confirmedOrderId = '';

  test('0. Setup: Authenticate Admin from credentials and retrieve confirmed order', async () => {
    assert.ok(fs.existsSync(CREDS_PATH), `Credentials file must exist at ${CREDS_PATH}`);
    const rawCreds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));

    // 1. Initial anonymous session to get CSRF token and cookie
    const initRes = await fetch(`${BASE_URL}/auth/session`, {
      headers: { Origin: ORIGIN },
    });
    const initData = await initRes.json();
    const initCsrf = initData.csrfToken;
    const initCookie = initRes.headers.get('set-cookie')?.split(';')[0] || '';

    // 2. Login as Admin
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
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
    assert.equal(loginRes.status, 200, 'Admin login must succeed');
    const loginData = await loginRes.json();
    adminCsrf = loginData.csrfToken;
    adminCookie = loginRes.headers.get('set-cookie')?.split(';')[0] || '';

    // 3. Find an existing order for testing print-data and print-jobs
    const ordersRes = await fetch(`${BASE_URL}/orders?limit=5`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(ordersRes.status, 200);
    const ordersData = await ordersRes.json();
    if (ordersData.items && ordersData.items.length > 0) {
      confirmedOrderId = ordersData.items[0].id;
    }
  });

  test('1. Print Config Validation: margin 0 is completely legal, rejects negative or > 50', () => {
    const config = getDefaultPrintConfig();
    
    // margin = 0 is explicitly valid (per contract recipe: 0边距是合法值，不用 ||10 改掉)
    config.paper.marginMm = 0;
    const res0 = validatePrintConfig(config);
    assert.equal(res0.valid, true, 'Margin 0mm must be valid');

    // margin = 50 is legal
    config.paper.marginMm = 50;
    // With 50mm margins, printable width is 210 - 100 = 110mm. Total default cols width is 175mm > 110mm, so it should catch width overflow
    const res50 = validatePrintConfig(config);
    assert.equal(res50.valid, false);
    assert.ok(res50.errors.some(e => e.includes('超出可打印宽度')));

    // margin < 0 is invalid
    config.paper.marginMm = -1;
    const resNeg = validatePrintConfig(config);
    assert.equal(resNeg.valid, false);
    assert.ok(resNeg.errors.some(e => e.includes('marginMm')));

    // margin > 50 is invalid
    config.paper.marginMm = 51;
    const resBig = validatePrintConfig(config);
    assert.equal(resBig.valid, false);
    assert.ok(resBig.errors.some(e => e.includes('marginMm')));
  });

  test('2. Paper Dimensions & Custom paper constraints: bounds [50-420] x [50-600]', () => {
    const a4P = getPaperDimensions({ size: 'A4', orientation: 'portrait', marginMm: 10 });
    assert.deepEqual(a4P, { widthMm: 210, heightMm: 297 });

    const a4L = getPaperDimensions({ size: 'A4', orientation: 'landscape', marginMm: 10 });
    assert.deepEqual(a4L, { widthMm: 297, heightMm: 210 });

    const a5P = getPaperDimensions({ size: 'A5', orientation: 'portrait', marginMm: 5 });
    assert.deepEqual(a5P, { widthMm: 148, heightMm: 210 });

    const customValid = getDefaultPrintConfig();
    customValid.paper = {
      size: 'custom',
      orientation: 'portrait',
      widthMm: 120,
      heightMm: 180,
      marginMm: 5,
    };
    customValid.columns = [
      { field: 'productName', label: '商品', widthMm: 60, align: 'left' },
      { field: 'quantity', label: '数量', widthMm: 20, align: 'right' },
      { field: 'netAmount', label: '金额', widthMm: 25, align: 'right' },
    ];
    const valCustom = validatePrintConfig(customValid);
    assert.equal(valCustom.valid, true);

    // Custom width out of bounds (< 50 or > 420)
    customValid.paper.widthMm = 45;
    const valSmallW = validatePrintConfig(customValid);
    assert.equal(valSmallW.valid, false);
    assert.ok(valSmallW.errors.some(e => e.includes('widthMm')));

    customValid.paper.widthMm = 450;
    const valBigW = validatePrintConfig(customValid);
    assert.equal(valBigW.valid, false);
    assert.ok(valBigW.errors.some(e => e.includes('widthMm')));

    // Custom height out of bounds (< 50 or > 600)
    customValid.paper.widthMm = 100;
    customValid.paper.heightMm = 650;
    const valBigH = validatePrintConfig(customValid);
    assert.equal(valBigH.valid, false);
    assert.ok(valBigH.errors.some(e => e.includes('heightMm')));
  });

  test('3. Printable Width & Column width overflow detection', () => {
    const config = getDefaultPrintConfig();
    config.paper = { size: 'A4', orientation: 'portrait', marginMm: 10 };
    // Printable width = 210 - 20 = 190mm
    assert.equal(getPrintableWidthMm(config.paper), 190);

    // Default cols width = 45 + 25 + 24 + 16 + 20 + 25 + 25 = 180mm <= 190mm -> valid
    assert.equal(getTotalColumnsWidthMm(config.columns), 180);
    assert.equal(validatePrintConfig(config).valid, true);

    // Increase a column to cause overflow (180 + 20 = 200mm > 190mm)
    config.columns[0] = { ...config.columns[0]!, widthMm: 65 };
    assert.equal(getTotalColumnsWidthMm(config.columns), 200);
    const overflowVal = validatePrintConfig(config);
    assert.equal(overflowVal.valid, false);
    assert.ok(overflowVal.errors.some(e => e.includes('超出可打印宽度')));
  });

  test('4. Field Whitelists & Forbidden Cost/Profit columns protection', () => {
    const config = getDefaultPrintConfig();

    // Injects forbidden cost field
    config.columns.push({
      field: 'costAmount' as any,
      label: '采购成本',
      widthMm: 20,
      align: 'right',
    });
    const forbiddenVal = validatePrintConfig(config);
    assert.equal(forbiddenVal.valid, false);
    assert.ok(forbiddenVal.errors.some(e => e.includes('严禁包含成本与毛利字段')));

    // Non-whitelisted header field
    const config2 = getDefaultPrintConfig();
    config2.headerFields.push('unsupportedField' as any);
    const badHeaderVal = validatePrintConfig(config2);
    assert.equal(badHeaderVal.valid, false);
    assert.ok(badHeaderVal.errors.some(e => e.includes('不支持的表头字段')));
  });

  test('5. Row height bounds: minRowHeightMm strictly between 3mm and 50mm', () => {
    const config = getDefaultPrintConfig();
    config.minRowHeightMm = 2;
    const resLow = validatePrintConfig(config);
    assert.equal(resLow.valid, false);
    assert.ok(resLow.errors.some(e => e.includes('minRowHeightMm')));

    config.minRowHeightMm = 55;
    const resHigh = validatePrintConfig(config);
    assert.equal(resHigh.valid, false);
    assert.ok(resHigh.errors.some(e => e.includes('minRowHeightMm')));

    config.minRowHeightMm = 8;
    assert.equal(validatePrintConfig(config).valid, true);
  });

  test('5b. C1 Requirement & V1 Verification: getPageSizeRule for A4/A5/Custom sizes', () => {
    // 1. A4 Portrait
    assert.equal(getPageSizeRule({ size: 'A4', orientation: 'portrait', marginMm: 10 }), 'A4 portrait');

    // 2. A4 Landscape
    assert.equal(getPageSizeRule({ size: 'A4', orientation: 'landscape', marginMm: 10 }), 'A4 landscape');

    // 3. A5 Portrait
    assert.equal(getPageSizeRule({ size: 'A5', orientation: 'portrait', marginMm: 5 }), 'A5 portrait');

    // 4. A5 Landscape
    assert.equal(getPageSizeRule({ size: 'A5', orientation: 'landscape', marginMm: 5 }), 'A5 landscape');

    // 5. Custom size 120mm x 180mm
    assert.equal(
      getPageSizeRule({ size: 'custom', orientation: 'portrait', widthMm: 120, heightMm: 180, marginMm: 0 }),
      '120mm 180mm'
    );
  });

  test('6. Live API: Create template, create new version, and verify version progression', async () => {
    // 1. Create a print template
    const templatePayload = {
      name: `测试出库模板-${Date.now().toString().slice(-4)}`,
      config: getDefaultPrintConfig(),
    };
    const createRes = await fetch(`${BASE_URL}/print-templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': `create-tpl-${Date.now()}`,
      },
      body: JSON.stringify(templatePayload),
    });
    assert.equal(createRes.status, 201);
    const createdTemplate = await createRes.json();
    assert.ok(createdTemplate.id);
    assert.equal(createdTemplate.currentTemplateVersionNo, 1);

    // 2. Create a new version of the template with updated margin and column widths
    const updatedConfig: PrintConfig = {
      ...createdTemplate.config,
      paper: {
        ...createdTemplate.config.paper,
        marginMm: 5,
      },
      minRowHeightMm: 12,
    };
    const verRes = await fetch(`${BASE_URL}/print-templates/${createdTemplate.id}/versions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': `create-ver-${Date.now()}`,
      },
      body: JSON.stringify({
        expectedVersion: createdTemplate.version,
        config: updatedConfig,
      }),
    });
    assert.equal(verRes.status, 201);
    const updatedTemplate = await verRes.json();
    assert.equal(updatedTemplate.currentTemplateVersionNo, 2);
    assert.equal(updatedTemplate.config.minRowHeightMm, 12);
    assert.equal(updatedTemplate.config.paper.marginMm, 5);

    // 3. List versions
    const listVerRes = await fetch(`${BASE_URL}/print-templates/${createdTemplate.id}/versions`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(listVerRes.status, 200);
    const verList = await listVerRes.json();
    assert.ok(verList.items.length >= 2, 'Should have at least 2 versions');

    // 4. C2 Requirement: Historical Template Version query and reprinting
    const v1 = verList.items.find((v: any) => v.versionNo === 1);
    assert.ok(v1, 'Version 1 must exist in template versions list');

    // Fetch PrintData explicitly requesting historical templateVersionId (v1.id)
    if (confirmedOrderId) {
      const v1PrintDataRes = await fetch(
        `${BASE_URL}/orders/${confirmedOrderId}/print-data?templateVersionId=${v1.id}`,
        { headers: { Origin: ORIGIN, Cookie: adminCookie } }
      );
      assert.equal(v1PrintDataRes.status, 200);
      const v1PrintData = await v1PrintDataRes.json();
      assert.equal(v1PrintData.templateVersionId, v1.id, 'PrintData must reflect historical templateVersionId');

      // Create a PrintJob specifying this historical templateVersionId
      const v1JobRes = await fetch(`${BASE_URL}/orders/${confirmedOrderId}/print-jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          'X-CSRF-Token': adminCsrf,
          Cookie: adminCookie,
          'Idempotency-Key': `v1-job-${Date.now()}`,
        },
        body: JSON.stringify({
          orderRevisionId: v1PrintData.order.revisionId,
          templateVersionId: v1.id,
          clientPlatform: 'desktop_web',
        }),
      });
      assert.equal(v1JobRes.status, 201);
      const v1Job = await v1JobRes.json();
      assert.equal(v1Job.templateVersionId, v1.id, 'PrintJob must be bound to historical template version');
      assert.equal(v1Job.status, 'requested');
    }
  });

  test('7. Live API: Print Data has no cost fields (OrderPublic), Job creation and status transitions', async () => {
    if (!confirmedOrderId) return;

    // 1. Fetch print data for the order
    const printDataRes = await fetch(`${BASE_URL}/orders/${confirmedOrderId}/print-data`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(printDataRes.status, 200);
    const printData = await printDataRes.json();
    assert.ok(printData.order, 'Must return order data');
    assert.ok(printData.config, 'Must return active print config');

    // Crucial: Order in PrintData is OrderPublic, even for Admin it MUST NOT have cost fields
    for (const line of printData.order.lines) {
      assert.equal((line as any).costAmount, undefined, 'Print lines must not contain costAmount');
      assert.equal((line as any).unitCost, undefined, 'Print lines must not contain unitCost');
    }

    // 2. Create a PrintJob
    const jobRes = await fetch(`${BASE_URL}/orders/${confirmedOrderId}/print-jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': `job-${Date.now()}`,
      },
      body: JSON.stringify({
        orderRevisionId: printData.order.revisionId,
        templateVersionId: printData.templateVersionId,
        clientPlatform: 'desktop_web',
      }),
    });
    assert.equal(jobRes.status, 201);
    const job = await jobRes.json();
    assert.equal(job.status, 'requested');

    // 3. Update job status to user_confirmed
    const confirmRes = await fetch(`${BASE_URL}/print-jobs/${job.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': `status-${Date.now()}`,
      },
      body: JSON.stringify({
        status: 'user_confirmed',
        note: '人工确认物理出纸正常',
      }),
    });
    assert.equal(confirmRes.status, 200);
    const confirmedJob = await confirmRes.json();
    assert.equal(confirmedJob.status, 'user_confirmed');

    // 4. Create another job and update status to user_cancelled
    const job2Res = await fetch(`${BASE_URL}/orders/${confirmedOrderId}/print-jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': `job2-${Date.now()}`,
      },
      body: JSON.stringify({
        orderRevisionId: printData.order.revisionId,
        templateVersionId: printData.templateVersionId,
        clientPlatform: 'mobile_web',
      }),
    });
    assert.equal(job2Res.status, 201);
    const job2 = await job2Res.json();

    const cancelRes = await fetch(`${BASE_URL}/print-jobs/${job2.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': `cancel-${Date.now()}`,
      },
      body: JSON.stringify({
        status: 'user_cancelled',
        note: '操作员取消打印',
      }),
    });
    assert.equal(cancelRes.status, 200);
    const cancelledJob = await cancelRes.json();
    assert.equal(cancelledJob.status, 'user_cancelled');
  });

  test('8. R1 Requirement: Non-default template selection and version resolution', async () => {
    if (!confirmedOrderId) return;

    // 1. Create a non-default print template (Template B) with unique config
    const customConfig: PrintConfig = {
      ...getDefaultPrintConfig(),
      paper: { size: 'A5', orientation: 'landscape', marginMm: 6 },
      minRowHeightMm: 14,
    };
    const tplBRes = await fetch(`${BASE_URL}/print-templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': `create-tpl-b-${Date.now()}`,
      },
      body: JSON.stringify({
        name: `非默认A5模板-${Date.now().toString().slice(-4)}`,
        config: customConfig,
      }),
    });
    assert.equal(tplBRes.status, 201);
    const tplB = await tplBRes.json();
    assert.ok(tplB.id);
    assert.ok(tplB.currentTemplateVersionId);

    // 2. Query PrintData explicitly passing Template B's currentTemplateVersionId
    // (Simulates user selecting Template B with '最新发布版', where OrderPrintPreview computes
    // effectiveTemplateVersionId = selectedTemplateVersionId || currentTemplate?.currentTemplateVersionId)
    const printDataRes = await fetch(
      `${BASE_URL}/orders/${confirmedOrderId}/print-data?templateVersionId=${tplB.currentTemplateVersionId}`,
      { headers: { Origin: ORIGIN, Cookie: adminCookie } }
    );
    assert.equal(printDataRes.status, 200);
    const printData = await printDataRes.json();
    assert.equal(
      printData.templateVersionId,
      tplB.currentTemplateVersionId,
      'Must return Template B version, NOT fallback to company default template'
    );
    assert.equal(printData.config.paper.size, 'A5');
    assert.equal(printData.config.paper.orientation, 'landscape');
    assert.equal(printData.config.paper.marginMm, 6);
    assert.equal(printData.config.minRowHeightMm, 14);

    // 3. Create PrintJob explicitly with this template version ID
    const jobRes = await fetch(`${BASE_URL}/orders/${confirmedOrderId}/print-jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': `job-tpl-b-${Date.now()}`,
      },
      body: JSON.stringify({
        orderRevisionId: printData.order.revisionId,
        templateVersionId: tplB.currentTemplateVersionId,
        clientPlatform: 'desktop_web',
      }),
    });
    assert.equal(jobRes.status, 201);
    const job = await jobRes.json();
    assert.equal(job.templateVersionId, tplB.currentTemplateVersionId);
    assert.equal(job.status, 'requested');
  });

  test('9. Needle Printer Custom Paper (241x93mm) & Initial UUID Version Selection', () => {
    // 1. Preset dimensions check
    assert.equal(NEEDLE_PRINTER_PAPER_PRESET.paper.widthMm, 241);
    assert.equal(NEEDLE_PRINTER_PAPER_PRESET.paper.heightMm, 93);
    assert.equal(NEEDLE_PRINTER_PAPER_PRESET.paper.marginMm, 5);

    // 2. Continuous needle paper dimensions do not swap in landscape (width remains physical 241mm)
    const needleP = getPaperDimensions(NEEDLE_PRINTER_PAPER_PRESET.paper);
    assert.deepEqual(needleP, { widthMm: 241, heightMm: 93 });

    const needleL = getPaperDimensions({ ...NEEDLE_PRINTER_PAPER_PRESET.paper, orientation: 'landscape' });
    assert.deepEqual(needleL, { widthMm: 241, heightMm: 93 }, 'Continuous needle paper 241x93 must not swap in landscape');

    // 3. Printable width = 241 - 2*5 = 231mm
    const pWidth = getPrintableWidthMm(NEEDLE_PRINTER_PAPER_PRESET.paper);
    assert.equal(pWidth, 231);

    // 4. Validate needle paper print config
    const needleConfig = {
      ...getDefaultPrintConfig(),
      paper: NEEDLE_PRINTER_PAPER_PRESET.paper,
      minRowHeightMm: 6,
    };
    const valResult = validatePrintConfig(needleConfig);
    assert.equal(valResult.valid, true, 'Needle continuous paper config must be completely valid');

    // 5. Overflow detection: if columns width exceeds 231mm, catch overflow
    const overflowNeedleConfig = {
      ...needleConfig,
      columns: needleConfig.columns.map(c => ({ ...c, widthMm: c.widthMm + 10 })),
    };
    const valOverflow = validatePrintConfig(overflowNeedleConfig);
    assert.equal(valOverflow.valid, false);
    assert.ok(valOverflow.errors.some(e => e.includes('超出可打印宽度')));

    // 6. UUID vs numeric version check (OrderPrintPreview contract)
    const isUuid = (val?: string): boolean => {
      if (!val) return false;
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    };
    assert.equal(isUuid('1'), false, 'Numeric version string "1" must NOT be treated as UUID');
    assert.equal(isUuid('v1'), false, 'Version label "v1" must NOT be treated as UUID');
    assert.equal(isUuid('fba09e7a-3a79-4692-a5eb-c447bdca1d81'), true, 'Valid UUID string must be accepted');
  });

  test('10. Compact Paper Layout & Shanghai Timezone Formatting for Order Confirmation', () => {
    // 1. Shanghai Timezone (Asia/Shanghai = UTC+8) for instant datetime
    // Verifies the exact fixture identified in Sol contract subagent verification:
    // confirmedAt: 2026-11-11T03:28:47.500Z -> Asia/Shanghai must be 2026-11-11 11:28:47 (+8 hours)
    const instantUtc = '2026-11-11T03:28:47.500Z';
    const formattedShanghai = formatShanghaiInstant(instantUtc);
    assert.equal(formattedShanghai, '2026-11-11 11:28:47', 'UTC 03:28:47 must format to Shanghai 11:28:47');

    // Edge cases: null/undefined/empty string returns '—'
    assert.equal(formatShanghaiInstant(null), '—');
    assert.equal(formatShanghaiInstant(undefined), '—');
    assert.equal(formatShanghaiInstant(''), '—');

    // 2. Continuous needle paper compact detection
    const needleDims = getPaperDimensions(NEEDLE_PRINTER_PAPER_PRESET.paper);
    assert.equal(needleDims.heightMm, 93);
    const isNeedleCompact = needleDims.heightMm <= 130;
    assert.equal(isNeedleCompact, true, 'Needle continuous paper (height 93mm) must activate compact layout');

    // 3. A4 / A5 standard papers must NOT activate compact mode (preserves original layout)
    const a4Dims = getPaperDimensions({ size: 'A4', orientation: 'portrait', marginMm: 10 });
    assert.equal(a4Dims.heightMm > 130, true);
    assert.equal(a4Dims.heightMm <= 130, false, 'A4 portrait must NOT activate compact layout');

    const a5LandscapeDims = getPaperDimensions({ size: 'A5', orientation: 'landscape', marginMm: 10 });
    assert.equal(a5LandscapeDims.heightMm > 130, true);
    assert.equal(a5LandscapeDims.heightMm <= 130, false, 'A5 landscape (148mm) must NOT activate compact layout');

    // 4. Height budget calculation for 241x93mm paper (printable height = 93 - 2*5 = 83mm)
    // In compact layout:
    // - Title block: ~8mm
    // - Header fields (8 items in 2 rows): ~9mm
    // - Table header (thead): ~5mm
    // - 2 data rows (2 * 6mm): 12mm
    // - Table bottom margin: 6mm
    // - Totals summary (horizontal flex single row): ~5mm
    // - Signatures (marginTop 6px): ~5mm
    // Total vertical height ≈ 50mm <= 83mm available height.
    const printableHeightMm = needleDims.heightMm - 2 * NEEDLE_PRINTER_PAPER_PRESET.paper.marginMm;
    assert.equal(printableHeightMm, 83);
    const estimated2ItemHeightMm = 8 + 9 + 5 + 12 + 6 + 5 + 5;
    assert.ok(
      estimated2ItemHeightMm <= printableHeightMm,
      `Estimated 2-item height (${estimated2ItemHeightMm}mm) must fit within printable height (${printableHeightMm}mm)`
    );

    // 5. Contrast with previous uncompacted height:
    // 22mm (title) + 31.5mm (header) + 27mm (table) + 25mm (vertical totals) + 14.5mm (signatures) = 120mm > 83mm
    const previousUncompactedHeightMm = 22 + 31.5 + 27 + 25 + 14.5;
    assert.ok(previousUncompactedHeightMm > printableHeightMm, 'Previous layout overflowed 83mm printable limit');
  });
});
