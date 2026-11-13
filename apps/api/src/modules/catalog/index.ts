import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { openapiDocument, parseOperationRequest, parseOperationResponse, type OperationId, type OperationRequest } from '@huoyoupu/contracts';
import type { ApiDependencies, OperationContext } from '../../lib/security.js';
import { AppError } from '../../lib/errors.js';
import { appendAudit } from '../../lib/audit.js';
import * as catalog from './service.js';

type Sql = Pick<Pool | PoolClient, 'query'>;
interface Route { operationId: OperationId; method: string; url: string; parameters?: ({ $ref: string } | { name: string; in: string })[] }
const routes: Route[] = [];
for (const [path, pathItem] of Object.entries(openapiDocument.paths)) {
  for (const [method, definition] of Object.entries(pathItem)) {
    const operation = definition as unknown as { operationId?: OperationId; parameters?: Route['parameters'] };
    if (operation.operationId) routes.push({ operationId: operation.operationId, method: method.toUpperCase(), url: `/api/v1${path.replace(/\{([^}]+)\}/g, ':$1')}`, ...(operation.parameters ? { parameters: operation.parameters } : {}) });
  }
}
function input<O extends OperationId>(route: Route, request: FastifyRequest): OperationRequest<O> {
  const query = { ...(request.query as Record<string, unknown> ?? {}) };
  for (const key of ['limit', 'expectedVersion']) if (typeof query[key] === 'string' && /^(0|[1-9][0-9]*)$/.test(query[key])) query[key] = Number(query[key]);
  if (query.includeInactive === 'true') query.includeInactive = true;
  else if (query.includeInactive === 'false') query.includeInactive = false;
  const headers: Record<string, unknown> = {};
  for (const parameter of route.parameters ?? []) {
    const definition = '$ref' in parameter ? (openapiDocument.components.parameters as Record<string, { name: string; in: string }>)[parameter.$ref.split('/').at(-1)!]! : parameter;
    if (definition.in === 'header' && request.headers[definition.name.toLowerCase()] !== undefined) headers[definition.name] = request.headers[definition.name.toLowerCase()];
  }
  return parseOperationRequest(route.operationId as O, { path: request.params ?? {}, query, headers, ...(request.body !== undefined ? { body: request.body } : {}) });
}
interface AuditTarget { entityType: string; entityId?: string; before?: unknown; after?: unknown }
function version(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || !('version' in value) || typeof value.version !== 'number') return undefined;
  return value.version;
}

export function registerCatalog(app: FastifyInstance, dependencies: ApiDependencies, options: { history?: catalog.HistoricalPriceLookup } = {}): void {
  function read<O extends OperationId>(operationId: O, handler: (sql: Sql, input: OperationRequest<O>) => Promise<unknown>): void {
    const route = routes.find(route => route.operationId === operationId)!;
    app.route({ method: 'GET', url: route.url, handler: async request => {
      const actor = await dependencies.security.requireAdmin(request);
      const parsed = input<O>(route, request);
      const body = await handler(dependencies.pool, parsed);
      return parseOperationResponse(operationId, 200, actor.role, body);
    } });
  }
  function write<O extends OperationId>(operationId: O, status: number, handler: (context: OperationContext, input: OperationRequest<O>) => Promise<{ body: unknown; audit: AuditTarget }>): void {
    const route = routes.find(route => route.operationId === operationId)!;
    app.route({ method: route.method as 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: route.url, handler: async (request, reply) => {
      await dependencies.security.requireAdmin(request);
      const result = await dependencies.security.withOperation(request, { kind: operationId, routeKey: `${route.method}:${route.url}` }, async context => {
        const parsed = input<O>(route, request);
        const { body, audit } = await handler(context, parsed);
        const oldVersion = version(audit.before); const newVersion = version(audit.after);
        await appendAudit(context, { entityType: audit.entityType, ...(audit.entityId ? { entityId: audit.entityId } : {}), ...(oldVersion === undefined ? {} : { oldVersion }), ...(newVersion === undefined ? {} : { newVersion }), ...(audit.before === undefined ? {} : { before: audit.before }), ...(audit.after === undefined ? {} : { after: audit.after }) });
        return { status, body: parseOperationResponse(operationId, status, context.actor.role, body) };
      });
      if (result.replayed) reply.header('Idempotency-Replayed', 'true');
      return reply.code(result.status).send(result.body);
    } });
  }
  read('listProducts', (sql, request) => catalog.listCatalog(sql, 'Product', request.query));
  read('getProduct', (sql, request) => catalog.getCatalog(sql, 'Product', request.path!.productId));
  read('listCustomers', (sql, request) => catalog.listCatalog(sql, 'Customer', request.query));
  read('getCustomer', (sql, request) => catalog.getCatalog(sql, 'Customer', request.path!.customerId));
  read('listWarehouses', (sql, request) => catalog.listCatalog(sql, 'Warehouse', request.query));
  read('listPriceRules', (sql, request) => catalog.listPriceRules(sql, request.path!.customerId, request.query));
  read('getCustomerPrice', (sql, request) => {
    if (!options.history) throw new AppError('RETRYABLE_CONFLICT', 503, '历史成交价来源尚未接入，请稍后重试', undefined, true);
    return catalog.quoteCustomerPrice(sql, request.path!.customerId, request.query!.productId, request.query!.unitId, options.history);
  });
  write('createProduct', 201, async ({ client }, request) => {
    const body = await catalog.createProduct(client, request.body!); return { body, audit: { entityType: 'product', entityId: body.id, after: body } };
  });
  write('updateProduct', 200, async ({ client }, request) => {
    const id = request.path!.productId; const before = await catalog.getCatalog(client, 'Product', id);
    const body = await catalog.patchProduct(client, id, request.body!); return { body, audit: { entityType: 'product', entityId: id, before, after: body } };
  });
  write('createUnit', 201, async ({ client }, request) => {
    const id = request.path!.productId; const before = await catalog.getCatalog(client, 'Product', id);
    const body = await catalog.createUnit(client, id, request.body!); return { body, audit: { entityType: 'product', entityId: id, before, after: await catalog.getCatalog(client, 'Product', id) } };
  });
  write('updateUnit', 200, async ({ client }, request) => {
    const id = request.path!.productId; const before = await catalog.getCatalog(client, 'Product', id);
    const body = await catalog.patchUnit(client, id, request.path!.unitId, request.body!); return { body, audit: { entityType: 'product', entityId: id, before, after: await catalog.getCatalog(client, 'Product', id) } };
  });
  write('replaceBarcodes', 200, async ({ client }, request) => {
    const id = request.path!.productId; const before = await catalog.getCatalog(client, 'Product', id);
    const body = await catalog.replaceBarcodes(client, id, request.body!); return { body, audit: { entityType: 'product', entityId: id, before, after: body } };
  });
  write('createCustomer', 201, async ({ client }, request) => {
    const body = await catalog.createCustomer(client, request.body!); return { body, audit: { entityType: 'customer', entityId: body.id, after: body } };
  });
  write('updateCustomer', 200, async ({ client }, request) => {
    const id = request.path!.customerId; const before = await catalog.getCatalog(client, 'Customer', id);
    const body = await catalog.patchCustomer(client, id, request.body!); return { body, audit: { entityType: 'customer', entityId: id, before, after: body } };
  });
  write('createAddress', 201, async ({ client }, request) => {
    const id = request.path!.customerId; const before = await catalog.getCatalog(client, 'Customer', id);
    const body = await catalog.createAddress(client, id, request.body!); return { body, audit: { entityType: 'customer', entityId: id, before, after: await catalog.getCatalog(client, 'Customer', id) } };
  });
  write('updateAddress', 200, async ({ client }, request) => {
    const id = request.path!.customerId; const before = await catalog.getCatalog(client, 'Customer', id);
    const body = await catalog.patchAddress(client, id, request.path!.addressId, request.body!); return { body, audit: { entityType: 'customer', entityId: id, before, after: await catalog.getCatalog(client, 'Customer', id) } };
  });
  write('createWarehouse', 201, async ({ client }, request) => {
    const body = await catalog.createWarehouse(client, request.body!); return { body, audit: { entityType: 'warehouse', entityId: body.id, after: body } };
  });
  write('updateWarehouse', 200, async ({ client }, request) => {
    const id = request.path!.warehouseId; const before = await catalog.getCatalog(client, 'Warehouse', id);
    const body = await catalog.patchWarehouse(client, id, request.body!); return { body, audit: { entityType: 'warehouse', entityId: id, before, after: body } };
  });
  write('upsertPriceRule', 200, async ({ client }, request) => {
    const path = request.path!;
    const previous = await client.query<{ data: unknown }>('SELECT data FROM catalog_price_rules WHERE customer_id=$1 AND product_id=$2 AND unit_id=$3', [path.customerId, path.productId, path.unitId]);
    const body = await catalog.upsertPriceRule(client, path.customerId, path.productId, path.unitId, request.body!);
    return { body, audit: { entityType: 'customer_price_rule', entityId: path.customerId, before: previous.rows[0]?.data, after: body } };
  });
  write('deletePriceRule', 204, async ({ client }, request) => {
    const path = request.path!;
    const previous = await client.query<{ data: unknown }>('SELECT data FROM catalog_price_rules WHERE customer_id=$1 AND product_id=$2 AND unit_id=$3', [path.customerId, path.productId, path.unitId]);
    await catalog.deletePriceRule(client, path.customerId, path.productId, path.unitId, request.query!.expectedVersion);
    return { body: undefined, audit: { entityType: 'customer_price_rule', entityId: path.customerId, before: previous.rows[0]?.data } };
  });
}
