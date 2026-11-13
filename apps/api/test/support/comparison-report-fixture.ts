import {execFileSync} from 'node:child_process';
import {randomBytes, randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {chmod, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {userInfo} from 'node:os';
import type {TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createTestDatabase} from '@huoyoupu/database/testing';
import {parseSchema, type SchemaValue} from '@huoyoupu/contracts';
import {createApp} from '../../src/app.js';
import {initializeAdministrator} from '../../src/modules/auth/service.js';

type Clock = Pick<TestContext['mock']['timers'], 'enable' | 'setTime' | 'reset'>;
let seeding = false;

/** Owns its cluster/server. Call before browser.launch; never uses any DATABASE_URL environment. */
export async function createComparisonReportFixture(options: {frontendOrigin: string; timers: Clock; pgBin?: string}) {
  assert.equal(seeding, false, 'Run fixture setup serially before launching browsers');
  const origin = new URL(options.frontendOrigin);
  assert.equal(origin.origin, options.frontendOrigin, 'frontendOrigin must be an origin without path');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'Only loopback frontend tests supported');
  const bin = options.pgBin ?? ['/opt/homebrew/opt/postgresql@18/bin', '/usr/local/opt/postgresql@18/bin', '/usr/lib/postgresql/18/bin']
    .find(path => existsSync(join(path, 'initdb')));
  if (!bin) throw new Error('PostgreSQL 18 binaries required; pass pgBin explicitly');
  assert.match(execFileSync(join(bin, 'postgres'), ['--version'], {encoding: 'utf8'}), /\b18\./);
  seeding = true;
  const root = await mkdtemp('/tmp/huoyoupu-report-fixture-');
  await chmod(root, 0o700);
  const data = join(root, 'data'), socket = join(root, 'socket');
  let pgStarted = false, clockEnabled = false, closed: Promise<void> | undefined;
  let database: Awaited<ReturnType<typeof createTestDatabase>> | undefined;
  let app: ReturnType<typeof createApp> | undefined;
  const close = (): Promise<void> => closed ??= (async () => {
    try { if (app) await app.close(); }
    finally {
      try { if (database) await database.cleanup(); }
      finally {
        // This exact private data directory is the only cluster this helper can stop/remove.
        if (pgStarted) execFileSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], {stdio: 'ignore'});
        await rm(root, {recursive: true, force: true});
      }
    }
  })();
  try {
    await mkdir(socket, {mode: 0o700});
    execFileSync(join(bin, 'initdb'), ['-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8'], {stdio: 'ignore'});
    execFileSync(join(bin, 'pg_ctl'), ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-F -h '' -p 5432 -k ${socket}`, '-w', 'start'], {stdio: 'ignore'});
    pgStarted = true;
    const adminUrl = new URL('postgresql://localhost/postgres');
    adminUrl.username = userInfo().username; adminUrl.port = '5432'; adminUrl.searchParams.set('host', socket);
    database = await createTestDatabase({adminUrl: adminUrl.toString()});
    const pool = database.pool;
    const admin = {loginName: 'admin', password: randomBytes(24).toString('base64url')};
    await initializeAdministrator(pool, admin);
    app = createApp({database: pool, publicOrigin: options.frontendOrigin, logger: false});
    const apiOrigin = await app.listen({host: '127.0.0.1', port: 0});
    const cookies = new Map<string, string>(); let csrf = '';
    async function request(method: string, path: string, body?: object, expected = 200): Promise<unknown> {
      const response = await fetch(apiOrigin + '/api/v1' + path, {method, headers: {
        origin: options.frontendOrigin,
        ...(csrf ? {'x-csrf-token': csrf} : {}),
        ...(cookies.size ? {cookie: [...cookies].map(([key, value]) => key + '=' + value).join('; ')} : {}),
        ...(body ? {'content-type': 'application/json', 'idempotency-key': randomUUID()} : {}),
      }, ...(body ? {body: JSON.stringify(body)} : {})});
      assert.equal(response.status, expected, `Fixture ${method} ${path} status`);
      for (const raw of response.headers.getSetCookie()) {
        const [pair] = raw.split(';'); const index = pair!.indexOf('='); cookies.set(pair!.slice(0, index), pair!.slice(index + 1));
      }
      return expected === 204 ? undefined : response.json();
    }
    async function post<S extends 'Product' | 'Warehouse' | 'Customer' | 'Address' | 'Receipt' | 'OrderAdmin'>(path: string, body: object, schema: S, expected = 201): Promise<SchemaValue<S>> {
      return parseSchema(schema, await request('POST', path, body, expected));
    }
    csrf = parseSchema('Session', await request('GET', '/auth/session')).csrfToken;
    csrf = parseSchema('Session', await request('POST', '/auth/login', admin)).csrfToken;
    const namespace = 'R128-' + randomUUID().slice(0, 8);
    const product = await post('/products', {code: namespace + '-P', name: namespace + '虚构商品', baseUnit: {name: '瓶', defaultSalePrice: '2'}}, 'Product');
    const warehouse = await post('/warehouses', {code: namespace + '-W', name: namespace + '隔离仓'}, 'Warehouse');
    const customers = {} as Record<'decline' | 'zero' | 'new', SchemaValue<'Customer'>>;
    for (const [key, label] of [['decline', '下降'], ['zero', '未购买'], ['new', '本期新增']] as const) {
      customers[key] = await post('/customers', {code: namespace + '-' + key, name: namespace + label}, 'Customer');
      await post(`/customers/${customers[key].id}/addresses`, {contactName: '虚构收货人', address: '虚构隔离地址', isDefault: true}, 'Address');
    }
    // Two completed Shanghai days avoid future business instants at early morning test execution.
    const today = Math.floor((Date.now() + 8 * 3600_000) / 86400_000) * 86400_000 - 8 * 3600_000;
    const period = {mode: 'custom' as const, start: new Date(today - 86400_000).toISOString(), end: new Date(today).toISOString(),
      baselineStart: new Date(today - 2 * 86400_000).toISOString(), baselineEnd: new Date(today - 86400_000).toISOString()};
    await post('/receipts', {kind: 'opening', warehouseId: warehouse.id, receivedAt: new Date(today - 3 * 86400_000).toISOString(),
      lines: [{productId: product.id, unitId: product.baseUnitId, quantity: 50, unitCost: '1'}]}, 'Receipt');
    const orders: {orderId: string; customerId: string; revisionId: string; confirmedAt: string; quantityBase: number}[] = [];
    // Authenticate at real time first: freezing login time could create sessions already expired to PostgreSQL now().
    options.timers.enable({apis: ['Date'], now: today - 2 * 86400_000 + 12 * 3600_000}); clockEnabled = true;
    try {
      for (const [key, quantity, side] of [['decline', 6, 'baseline'], ['decline', 4, 'baseline'], ['zero', 3, 'baseline'], ['decline', 4, 'current'], ['new', 2, 'current']] as const) {
        const instant = today - (side === 'baseline' ? 2 : 1) * 86400_000 + 12 * 3600_000;
        options.timers.setTime(instant);
        const draft = await post('/orders', {customerId: customers[key].id, lines: [{clientLineId: randomUUID(), productId: product.id,
          warehouseId: warehouse.id, unitId: product.baseUnitId, quantity, unitPrice: '2', allocationMode: 'auto'}],
          discountAmount: '0.00', roundOffAmount: '0.00'}, 'OrderAdmin');
        const confirmed = await post(`/orders/${draft.id}/confirm`, {expectedVersion: draft.version}, 'OrderAdmin', 200);
        assert.equal(confirmed.confirmedAt, new Date(instant).toISOString());
        orders.push({orderId: confirmed.id, customerId: confirmed.customerId, revisionId: confirmed.revisionId, confirmedAt: confirmed.confirmedAt!, quantityBase: quantity});
      }
    } finally { options.timers.reset(); clockEnabled = false; }
    // Verify natural API-written business-date alignment, without UPDATE, trigger bypass or fake report rows.
    for (const order of orders) {
      const ledger = parseSchema('LedgerPage', await request('GET', `/customers/${order.customerId}/ledger`));
      const entry = ledger.items.find(row => row.sourceId === order.orderId && row.kind === 'sale');
      assert.equal(entry?.effectiveAt, order.confirmedAt);
    }
    await request('POST', '/auth/logout', undefined, 204);
    const fingerprint = async () => {
      const tables = (await pool.query<{table_name: string}>(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'
        AND table_type='BASE TABLE' AND table_name NOT IN ('sessions','report_runs') ORDER BY table_name`)).rows;
      const results = [];
      for (const {table_name} of tables) {
        const name = '"' + table_name.replaceAll('"', '""') + '"';
        results.push({table: table_name, ...(await pool.query(`SELECT count(*)::text AS count,
          md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]')) AS digest FROM ${name} r`)).rows[0]});
      }
      return results;
    };
    const seeded = await fingerprint();
    const query: SchemaValue<'ReportQuery'> = {kind: 'customer_product_comparison', period, quantityBasis: 'ordered', groupBy: ['customer', 'product'],
      filters: {customerIds: Object.values(customers).map(customer => customer.id), productIds: [product.id]}};
    return {apiOrigin, frontendOrigin: options.frontendOrigin, admin, namespace, product, warehouse, customers, orders, query, period,
      expected: {decline: {baseline: 10, current: 4, change: -6, percent: '-60.00', trend: 'decreased'},
        zero: {baseline: 3, current: 0, change: -3, percent: '-100.00', trend: 'decreased'},
        new: {baseline: 0, current: 2, change: 2, percent: null, trend: 'new'}},
      assertSeedUnchanged: async () => assert.deepEqual(await fingerprint(), seeded, 'Seed stock/money/audit/business rows changed'), close};
  } catch (error) {
    if (clockEnabled) {options.timers.reset(); clockEnabled = false;}
    await close(); throw error;
  } finally { seeding = false; }
}
