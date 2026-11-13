import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes, randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdtemp, writeFile, chmod, rm, lstat} from 'node:fs/promises';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {createTestDatabase} from '@huoyoupu/database/testing';
import {parseSchema} from '@huoyoupu/contracts';

// This test is only run through test:db, whose isolated runner supplies a private Unix socket.
test('real migrate/admin CLI and TCP restarts preserve empty business initialization', {timeout: process.env.HYP_EMPTY_UI_HANDOFF_DIR ? 600000 : 45000}, async t => {
  const adminUrl = process.env.TEST_DATABASE_URL;
  assert.ok(adminUrl, 'Use env -u TEST_DATABASE_URL TMPDIR=/tmp npm run test:db -- this file');
  const socket = new URL(adminUrl).searchParams.get('host');
  assert.ok(socket?.startsWith('/tmp/huoyoupu-pg-') || socket?.startsWith('/private/tmp/huoyoupu-pg-'), 'Only the runner-owned cluster is allowed');
  const database = await createTestDatabase({adminUrl, migrate: false});
  const directory = await mkdtemp('/tmp/huoyoupu-empty-bootstrap-'); await chmod(directory, 0o700);
  const password = randomBytes(24).toString('base64url'), passwordFile = join(directory, 'admin-password');
  await writeFile(passwordFile, password + '\n', {mode: 0o600});
  const handoffDirectory = process.env.HYP_EMPTY_UI_HANDOFF_DIR;
  const origin = handoffDirectory ? 'http://localhost:5173' : 'https://empty-bootstrap.example.test';
  let handoffMetadata: string | undefined;
  const environment = {PATH: process.env.PATH, TMPDIR: directory, DATABASE_URL: database.url,
    HYP_ADMIN_LOGIN: 'empty-admin', HYP_ADMIN_PASSWORD_FILE: passwordFile, PUBLIC_ORIGIN: origin,
    HOST: '127.0.0.1', AI_API_KEY: '', AI_API_KEY_FILE: '', AI_MODEL: ''};
  const run = (command: string, args: string[]) => new Promise<{code: number; stdout: string; stderr: string}>((resolve, reject) => {
    const child = spawn(command, args, {env: environment, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = ''; child.stdout.on('data', data => {stdout += String(data);}); child.stderr.on('data', data => {stderr += String(data);});
    child.once('error', reject); child.once('exit', code => resolve({code: code ?? 1, stdout, stderr}));
  });
  let server: ChildProcess | undefined;
  let apiOrigin = '';
  async function stopServer() {
    if (server && server.exitCode === null && server.signalCode === null) {
      const ended = once(server, 'exit'); server.kill('SIGTERM'); assert.deepEqual(await ended, [0, null]);
    }
    server = undefined;
  }
  async function startServer() {
    const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
    const address = listener.address(); assert.ok(address && typeof address === 'object'); const port = address.port;
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    assert.notEqual(port, 3000); assert.notEqual(port, 5173); apiOrigin = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['infra/runtime.mjs', 'serve'], {env: {...environment, PORT: String(port)}, stdio: 'ignore'});
    for (let attempt = 0; attempt < 100; attempt++) {
      try {if ((await fetch(apiOrigin + '/health')).ok) return;} catch { /* Start only this owned process. */ }
      assert.equal(server.exitCode, null, 'Own runtime exited before readiness');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Owned empty runtime readiness timeout');
  }
  const system = new Set(['schema_migrations', 'company_profiles', 'users', 'business_operations', 'audit_events', 'sessions', 'idempotency_records', 'report_runs']);
  async function counts() {
    const tables = (await database.pool.query<{table_name: string}>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows;
    const values: Record<string, number> = {};
    for (const {table_name} of tables) values[table_name] = Number((await database.pool.query(`SELECT count(*) FROM "${table_name}"`)).rows[0].count);
    return values;
  }
  async function assertNoBusiness() {
    const values = await counts();
    for (const [name, count] of Object.entries(values)) if (!system.has(name)) assert.equal(count, 0, name + ' must not be seeded');
    const totals = (await database.pool.query(`SELECT
      (SELECT coalesce(sum(quantity_base),0)::text FROM stock_balances) quantity,
      (SELECT coalesce(sum(cost_amount),0)::text FROM stock_balances) cost,
      (SELECT coalesce(sum(net_balance),0)::text FROM customer_accounts) balance,
      (SELECT coalesce(sum(amount),0)::text FROM cash_events) cash`)).rows[0];
    assert.deepEqual(totals, {quantity: '0', cost: '0', balance: '0', cash: '0'});
    return values;
  }
  async function fingerprint(includeSessions = false) {
    const names = Object.keys(await counts()).filter(name => includeSessions || name !== 'sessions');
    const rows = [];
    for (const name of names) rows.push({name, ...(await database.pool.query(`SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]')) digest FROM "${name}" r`)).rows[0]});
    return rows;
  }
  function client() {
    const cookies = new Map<string, string>(); let csrf = '';
    async function call(method: string, path: string, body?: object, expected = 200): Promise<unknown> {
      const response = await fetch(apiOrigin + '/api/v1' + path, {method, headers: {origin,
        ...(cookies.size ? {cookie: [...cookies].map(([key, value]) => key + '=' + value).join('; ')} : {}),
        ...(csrf ? {'x-csrf-token': csrf} : {}), ...(body ? {'content-type': 'application/json', 'idempotency-key': randomUUID()} : {}),
      }, ...(body ? {body: JSON.stringify(body)} : {})});
      assert.equal(response.status, expected, `${method} ${path}`);
      for (const raw of response.headers.getSetCookie()) {const [pair] = raw.split(';'); const at = pair!.indexOf('='); cookies.set(pair!.slice(0, at), pair!.slice(at + 1));}
      return expected === 204 ? undefined : response.json();
    }
    return {call, login: async (loginName: string, loginPassword: string) => {
      csrf = parseSchema('Session', await call('GET', '/auth/session')).csrfToken;
      const session = parseSchema('Session', await call('POST', '/auth/login', {loginName, password: loginPassword})); csrf = session.csrfToken;
      return session;
    }};
  }
  try {
    assert.deepEqual(await counts(), {}, 'Brand-new random database before migrations');
    const migrated = await run(process.execPath, ['infra/runtime.mjs', 'migrate']); assert.equal(migrated.code, 0);
    const applied = JSON.parse(migrated.stdout).applied as string[]; assert.equal(applied.length, 8);
    const afterMigration = await counts();
    for (const [name, count] of Object.entries(afterMigration)) assert.equal(count, name === 'schema_migrations' ? 8 : name === 'company_profiles' ? 1 : 0, name);
    const companyRow = (await database.pool.query('SELECT name,phone,address,default_template_id,version FROM company_profiles')).rows[0];
    assert.deepEqual(companyRow, {name: '', phone: '', address: '', default_template_id: null, version: '1'});
    const initialized = await run('npm', ['run', 'admin:init']); assert.equal(initialized.code, 0, 'Actual admin:init CLI');
    assert.ok(!initialized.stdout.includes(password) && !initialized.stderr.includes(password));
    const bootstrap = await assertNoBusiness(); assert.equal(bootstrap.users, 1); assert.equal(bootstrap.business_operations, 1); assert.equal(bootstrap.audit_events, 1);
    assert.equal(bootstrap.product_units, 0); assert.equal(bootstrap.print_templates, 0); assert.equal(bootstrap.sessions, 0);
    const beforeRepeat = await fingerprint(true);
    const replay = await run(process.execPath, ['infra/runtime.mjs', 'migrate']); assert.equal(replay.code, 0); assert.deepEqual(JSON.parse(replay.stdout).applied, []);
    const duplicate = await run('npm', ['run', 'admin:init']); assert.equal(duplicate.code, 1); assert.match(duplicate.stderr, /已有账号，禁止重复初始化/);
    assert.deepEqual(await fingerprint(true), beforeRepeat, 'Duplicate CLI cannot change existing account or data');
    await startServer();
    const anonymous = client(); const denied = parseSchema('ApiError', await anonymous.call('GET', '/users', undefined, 401)); assert.equal(denied.code, 'UNAUTHENTICATED');
    const admin = client(); const session = await admin.login('empty-admin', password); assert.equal(session.user?.role, 'admin');
    const users = parseSchema('UserPage', await admin.call('GET', '/users')); assert.equal(users.items.length, 1);
    for (const path of ['/products', '/customers', '/warehouses', '/orders', '/receipts', '/inventory/batches', '/inventory/balances', '/inventory/movements', '/stocktakes', '/cash-events', '/print-templates']) {
      const page = await admin.call('GET', path) as {items: unknown[]; nextCursor: string | null}; assert.deepEqual(page.items, [], path); assert.equal(page.nextCursor, null);
    }
    const company = parseSchema('Company', await admin.call('GET', '/company'));
    const saved = parseSchema('Company', await admin.call('PATCH', '/company', {expectedVersion: company.version, name: '隔离空业务配置', phone: '', address: ''}));
    assert.equal(saved.name, '隔离空业务配置'); assert.equal(saved.version, 2);
    for (const kind of ['sales_summary', 'customer_product_comparison', 'inventory', 'customer_balances', 'cash_flow', 'inventory_loss'] as const) {
      const report = parseSchema('ReportResult', await admin.call('POST', '/reports/query', {kind})); assert.equal(report.kind, kind);
      if (report.kind === 'sales_summary') {
        assert.equal(report.rows.length, 1); assert.equal(report.rows[0]!.orderCount, 0);
        for (const field of ['grossSalesAmount', 'returnAmount', 'netSalesAmount', 'salesCostAmount', 'returnCostCreditAmount', 'grossProfit', 'receiptAmount', 'refundAmount'] as const) assert.equal(report.rows[0]![field], '0.00');
      } else assert.deepEqual(report.rows, [], kind);
    }
    await assertNoBusiness(); const beforeRestart = await fingerprint(); await stopServer(); await startServer();
    assert.deepEqual(await fingerprint(), beforeRestart, 'Runtime restart must never seed or alter persistent data');
    assert.equal(parseSchema('UserPage', await admin.call('GET', '/users')).items.length, 1, 'Persisted session remains usable');
    assert.equal(parseSchema('Company', await admin.call('GET', '/company')).name, saved.name);
    if (handoffDirectory) {
      assert.match(handoffDirectory, /^\/(?:private\/)?tmp\/huoyoupu-empty-ui-[A-Za-z0-9_-]+$/);
      const info = await lstat(handoffDirectory);
      assert.ok(info.isDirectory() && !info.isSymbolicLink() && info.uid === process.getuid?.() && (info.mode & 0o777) === 0o700, 'Handoff directory must be owned/private');
      const metadataPath = join(handoffDirectory, 'empty-bootstrap.json');
      const releasePath = join(handoffDirectory, 'release-empty-bootstrap');
      assert.equal(existsSync(releasePath), false, 'Use a fresh handoff directory');
      await writeFile(metadataPath, JSON.stringify({purpose: 'Owned empty bootstrap UI only', apiOrigin, publicOrigin: origin,
        admin: {loginName: 'empty-admin', password}, initialUiState: {users: 1, businessRows: 0, companyProfiles: 1}}, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
      handoffMetadata = metadataPath;
      t.diagnostic('EMPTY_UI_READY: private metadata written; close browser context before creating release-empty-bootstrap');
      const deadline = Date.now() + 480000;
      while (!existsSync(releasePath)) {
        assert.ok(!t.signal.aborted && Date.now() < deadline, 'Empty UI handoff exceeded its eight-minute window');
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      await assertNoBusiness();
    }
    const employeePassword = randomBytes(24).toString('base64url');
    await admin.call('POST', '/users', {loginName: 'empty-employee', password: employeePassword, role: 'employee'}, 201);
    const employee = client(); await employee.login('empty-employee', employeePassword);
    const employeeOrders = parseSchema('OrderPagePublic', await employee.call('GET', '/orders')); assert.deepEqual(employeeOrders.items, []);
    for (const path of ['/users', '/products', '/customers', '/inventory/balances', '/cash-events']) {
      const error = parseSchema('ApiError', await employee.call('GET', path, undefined, 403)); assert.equal(error.code, 'FORBIDDEN');
      assert.ok(!/password|token_hash|costAmount|grossProfit/.test(JSON.stringify(error)));
    }
    const forbiddenReport = parseSchema('ApiError', await employee.call('POST', '/reports/query', {kind: 'inventory'}, 403)); assert.equal(forbiddenReport.code, 'FORBIDDEN');
    const finalCounts = await assertNoBusiness(); assert.equal(finalCounts.users, 2);
    if (handoffDirectory) assert.ok(finalCounts.report_runs! >= 6); else assert.equal(finalCounts.report_runs, 6);
    t.diagnostic('EMPTY_BOOTSTRAP ' + JSON.stringify({migrations: applied.length, baseTables: Object.keys(bootstrap).length,
      afterMigration: {companyProfiles: 1, users: 0, allOtherRowsExceptMigrations: 0}, bootstrap: {admins: 1, operations: 1, auditEvents: 1,
      businessTables: Object.keys(bootstrap).filter(name => !system.has(name)).length, allBusinessRows: 0, productUnits: 0, templates: 0},
      duplicateMigrateApplied: [], duplicateAdminExit: 1, restartFingerprintsUnchanged: true, emptyReports: 6,
      salesSummaryZeroAggregateRows: 1, companyConfigPersisted: true, laterRoleCaseUsers: 2, employeeForbidden: true,
      browserHandoffReleased: Boolean(handoffDirectory), businessRowsAfterAllChecks: 0}));
  } finally {try {await stopServer();} finally {
    try {await database.cleanup();} finally {
      await rm(directory, {recursive: true, force: true});
      if (handoffMetadata) await rm(handoffMetadata, {force: true});
    }
  }}
});
