import type { FastifyInstance, FastifyRequest } from 'fastify';
import { openapiDocument, parseOperationRequest, parseOperationResponse, type OperationId, type OperationRequest } from '@huoyoupu/contracts';
import type { ApiDependencies, OperationContext } from '../../lib/security.js';
import { appendAudit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import * as inventory from './service.js';
export { issueInventory, restoreInventory, lockStockBalances, rebuildStockBalances, selectReleaseSources } from './stock.js';
export type { IssueLine, InventoryAllocation, RestoreSelection, RestoredAllocation, StockKey } from './stock.js';
export { createReceipt, createStocktake, patchStocktake, confirmStocktake, getInventory } from './service.js';

function metadata(operationId: OperationId): { url: string; method: string; parameters: { name: string; in: string }[] } {
  for (const [path, item] of Object.entries(openapiDocument.paths)) for (const [method, value] of Object.entries(item)) {
    const operation = value as unknown as { operationId?: OperationId; parameters?: ({ $ref: string } | { name: string; in: string })[] };
    if (operation.operationId !== operationId) continue;
    const parameters = (operation.parameters ?? []).map(parameter => '$ref' in parameter ? (openapiDocument.components.parameters as Record<string, { name: string; in: string }>)[parameter.$ref.split('/').at(-1)!]! : parameter);
    return { url: `/api/v1${path.replace(/\{([^}]+)\}/g, ':$1')}`, method: method.toUpperCase(), parameters };
  }
  throw new Error(`Missing inventory operation ${operationId}`);
}
function input<O extends OperationId>(operationId: O, request: FastifyRequest): OperationRequest<O> {
  const route = metadata(operationId); const query = { ...(request.query as Record<string, unknown> ?? {}) };
  if (typeof query.limit === 'string' && /^[1-9][0-9]*$/.test(query.limit)) query.limit = Number(query.limit);
  if (query.positiveOnly === 'true') query.positiveOnly = true;
  else if (query.positiveOnly === 'false') query.positiveOnly = false;
  const headers = Object.fromEntries(route.parameters.filter(parameter => parameter.in === 'header' && request.headers[parameter.name.toLowerCase()] !== undefined).map(parameter => [parameter.name, request.headers[parameter.name.toLowerCase()]]));
  return parseOperationRequest(operationId, { path: request.params ?? {}, query, headers, ...(request.body !== undefined ? { body: request.body } : {}) });
}
export function registerInventory(app: FastifyInstance, dependencies: ApiDependencies): void {
  function read<O extends OperationId>(operationId: O, handler: (request: OperationRequest<O>) => Promise<unknown>): void {
    app.get(metadata(operationId).url, async request => {
      const actor = await dependencies.security.requireAdmin(request); const parsed = input(operationId, request);
      return parseOperationResponse(operationId, 200, actor.role, await handler(parsed));
    });
  }
  function write<O extends OperationId>(operationId: O, status: number, handler: (context: OperationContext, request: OperationRequest<O>) => Promise<unknown>, previous?: (context: OperationContext, request: OperationRequest<O>) => Promise<unknown>): void {
    const route = metadata(operationId);
    app.route({ method: route.method as 'POST' | 'PATCH', url: route.url, handler: async (request, reply) => {
      await dependencies.security.requireAdmin(request);
      const result = await dependencies.security.withOperation(request, { kind: operationId, routeKey: `${route.method}:${route.url}` }, async context => {
        const parsed = input(operationId, request); const before = previous ? await previous(context, parsed) : undefined;
        let body: unknown;
        try { body = await handler(context, parsed); }
        catch (error) { if (error instanceof RangeError) throw new AppError('INVALID_QUANTITY', 422, '数量换算或金额超出可表示范围'); throw error; }
        const dto = body as { id: string; version?: number }; const old = before as { version?: number } | undefined;
        await appendAudit(context, { entityType: operationId === 'confirmReceipt' ? 'receipt' : 'stocktake', entityId: dto.id, ...(old?.version === undefined ? {} : { oldVersion: old.version }), ...(dto.version === undefined ? {} : { newVersion: dto.version }), ...(before === undefined ? {} : { before }), after: body });
        return { status, body: parseOperationResponse(operationId, status, context.actor.role, body) };
      });
      if (result.replayed) reply.header('Idempotency-Replayed', 'true');
      return reply.code(result.status).send(result.body);
    } });
  }
  read('listReceipts', request => inventory.listInventory(dependencies.pool, 'Receipt', request.query));
  read('getReceipt', request => inventory.getInventory(dependencies.pool, 'Receipt', request.path!.receiptId));
  read('getStockBalances', request => inventory.listInventory(dependencies.pool, 'StockBalance', request.query));
  read('listBatches', request => inventory.listInventory(dependencies.pool, 'Batch', request.query));
  read('listStockMovements', request => inventory.listInventory(dependencies.pool, 'StockMovement', request.query));
  read('listStocktakes', request => inventory.listInventory(dependencies.pool, 'Stocktake', request.query));
  read('getStocktake', request => inventory.getInventory(dependencies.pool, 'Stocktake', request.path!.stocktakeId));
  write('confirmReceipt', 201, (context, request) => inventory.createReceipt(context, request.body!));
  write('createStocktake', 201, (context, request) => inventory.createStocktake(context, request.body!));
  write('updateStocktake', 200, (context, request) => inventory.patchStocktake(context, request.path!.stocktakeId, request.body!), (context, request) => inventory.getInventory(context.client, 'Stocktake', request.path!.stocktakeId));
  write('confirmStocktake', 200, (context, request) => inventory.confirmStocktake(context, request.path!.stocktakeId, request.body!.expectedVersion), (context, request) => inventory.getInventory(context.client, 'Stocktake', request.path!.stocktakeId));
}
