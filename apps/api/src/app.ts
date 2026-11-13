import Fastify, {type FastifyServerOptions} from 'fastify';
import type {Pool} from 'pg';
import {registerAi,type AiOptions} from './modules/ai/index.js';
import {registerAuth} from './modules/auth/index.js';
import {registerCatalog} from './modules/catalog/index.js';
import {registerPrinting} from './modules/printing/index.js';
import {registerReporting} from './modules/reporting/index.js';
import {registerFinance} from './modules/finance/index.js';
import {registerSales} from './modules/sales/index.js';
import {historicalPrice} from './modules/sales/reads.js';
import {financePort} from './modules/finance/core.js';
import {registerInventory} from './modules/inventory/index.js';
import {AppError, publicError} from './lib/errors.js';
export interface AppOptions extends FastifyServerOptions {database?: Pool; publicOrigin?: string; ai?: AiOptions}
export function createApp(options: AppOptions = {}) {
  const {database, publicOrigin, ai, ...serverOptions} = options;
  const app = Fastify({logger: false, ...serverOptions});
  app.setErrorHandler((error, request, reply) => {
    const failure = publicError(error, request.id);
    void reply.code(failure.status).send(failure.body);
  });
  app.setNotFoundHandler((request, reply) => {
    const failure = publicError(new AppError('NOT_FOUND', 404, '接口不存在'), request.id);
    void reply.code(failure.status).send(failure.body);
  });
  app.get('/health', async () => ({status: 'ok'}));
  if (database) {
    if (!publicOrigin) throw new Error('publicOrigin is required when database is supplied');
    const security = registerAuth(app, database, {origin: publicOrigin});
    registerCatalog(app, {pool: database, security}, {history: historicalPrice});
    registerInventory(app, {pool: database, security});
    registerSales(app, {pool: database, security}, {finance: financePort});
    registerFinance(app, {pool: database, security});
    registerReporting(app, {pool: database, security});
    registerPrinting(app, {pool: database, security});
    registerAi(app, {pool: database, security}, ai);
  }
  return app;
}
