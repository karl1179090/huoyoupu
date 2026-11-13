import type {FastifyInstance, FastifyRequest} from 'fastify';
import type {Pool} from 'pg';
import {parseSchema, parseOperationRequest, parseOperationResponse, type components} from '@huoyoupu/contracts';
import {AppError} from '../../lib/errors.js';
import {appendAudit} from '../../lib/audit.js';
import {createSecurity, projectUser, ADMIN_LOCK, type SecurityOptions} from './service.js';
import {hashPassword} from './password.js';
import {randomUUID} from 'node:crypto';

type UserCreate = components['schemas']['UserCreate'];
type UserPatch = components['schemas']['UserPatch'];
function input(request: FastifyRequest, kind: 'write' | 'csrf' | 'read' = 'write') {
  return {path: request.params ?? {}, query: request.query ?? {}, headers: {
    ...(kind !== 'read' && request.headers['x-csrf-token'] ? {'X-CSRF-Token': request.headers['x-csrf-token']} : {}),
    ...(kind === 'write' && request.headers['idempotency-key'] ? {'Idempotency-Key': request.headers['idempotency-key']} : {})
  }, ...(request.body === undefined ? {} : {body: request.body})};
}

export function registerAuth(app: FastifyInstance, pool: Pool, options: SecurityOptions) {
  const security = createSecurity(pool, options);
  app.get('/api/v1/auth/session', async (request, reply) => parseSchema('Session', await security.session(request, reply)));
  app.post('/api/v1/auth/login', async (request, reply) => {
    const parsed = parseOperationRequest('login', input(request, 'csrf'));
    return parseSchema('Session', await security.login(request, reply, parsed.body!));
  });
  app.post('/api/v1/auth/logout', async (request, reply) => {
    await security.requireUser(request);
    parseOperationRequest('logout', input(request, 'csrf'));
    await security.logout(request, reply);
    return reply.code(204).send();
  });
  app.get('/api/v1/users', async request => {
    const actor = await security.requireAdmin(request);
    const raw = request.query as Record<string, unknown>;
    const query = {...raw};
    if (typeof query.limit === 'string' && /^\d+$/.test(query.limit)) query.limit = Number(query.limit);
    const parsed = parseOperationRequest('listUsers', {...input(request, 'read'), query});
    const values = parsed.query ?? {};
    const limit = values.limit ?? 50;
    let after: string | null = null;
    if (values.cursor) {
      try {
        const cursor = JSON.parse(Buffer.from(values.cursor, 'base64url').toString()) as {kind: string; id: string};
        if (cursor.kind !== 'users' || !/^[0-9a-f-]{36}$/.test(cursor.id)) throw new Error();
        after = cursor.id;
      } catch { throw new AppError('INVALID_REQUEST', 400, '分页游标无效'); }
    }
    const rows = (await pool.query('SELECT id,login_name,role,active,version FROM users WHERE ($1::uuid IS NULL OR id>$1::uuid) ORDER BY id LIMIT $2', [after, limit + 1])).rows;
    const more = rows.length > limit;
    const page = rows.slice(0, limit);
    return parseOperationResponse('listUsers', 200, actor.role, {items: page.map(projectUser), nextCursor: more ? Buffer.from(JSON.stringify({kind: 'users', id: page.at(-1)!.id})).toString('base64url') : null, asOf: new Date().toISOString()});
  });
  app.post('/api/v1/users', async (request, reply) => {
    await security.requireAdmin(request);
    const result = await security.withOperation(request, {kind: 'createUser', routeKey: 'POST:/api/v1/users'}, async context => {
      const body: UserCreate = parseOperationRequest('createUser', input(request)).body!;
      const name = body.loginName.trim();
      if (!name) throw new AppError('INVALID_REQUEST', 400, '账号名称不能为空');
      await context.client.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_LOCK]);
      const hash = await hashPassword(body.password);
      const row = (await context.client.query('INSERT INTO users (id,login_name,normalized_login_name,password_hash,role) VALUES ($1,$2,$3,$4,$5) RETURNING id,login_name,role,active,version', [randomUUID(), name, name.toLowerCase(), hash, body.role])).rows[0]!;
      const user = projectUser(row);
      await appendAudit(context, {entityType: 'user', entityId: user.id, newVersion: user.version, after: user});
      return {status: 201, body: parseSchema('User', user)};
    });
    if (result.replayed) reply.header('Idempotency-Replayed', 'true');
    return reply.code(result.status).send(result.body);
  });
  app.patch('/api/v1/users/:userId', async (request, reply) => {
    await security.requireAdmin(request);
    const result = await security.withOperation(request, {kind: 'updateUser', routeKey: 'PATCH:/api/v1/users/:userId'}, async context => {
      const parsed = parseOperationRequest('updateUser', input(request));
      const body: UserPatch = parsed.body!;
      if (body.role === undefined && body.active === undefined && body.password === undefined) throw new AppError('INVALID_REQUEST', 400, '没有实际变更');
      await context.client.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_LOCK]);
      const authorized = await context.client.query('SELECT id FROM users WHERE id=$1 AND active AND role=\'admin\'', [context.actor.id]);
      if (!authorized.rowCount) throw new AppError('FORBIDDEN', 403, '权限已变化');
      const row = (await context.client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [parsed.path!.userId])).rows[0];
      if (!row) throw new AppError('NOT_FOUND', 404, '账号不存在');
      if (Number(row.version) !== body.expectedVersion) throw new AppError('VERSION_CONFLICT', 409, '账号版本已变化', {expectedVersion: body.expectedVersion, actualVersion: Number(row.version)});
      const role = body.role ?? row.role;
      const active = body.active ?? row.active;
      if (role === row.role && active === row.active && body.password === undefined) throw new AppError('INVALID_REQUEST', 400, '没有实际变更');
      if (row.active && row.role === 'admin' && (!active || role !== 'admin')) {
        const admins = await context.client.query('SELECT id FROM users WHERE active AND role=\'admin\'');
        if (admins.rowCount === 1) throw new AppError('RELATED_RECORD_CONFLICT', 409, '至少需要保留一个有效管理员');
      }
      const hash = body.password === undefined ? row.password_hash : await hashPassword(body.password);
      const updated = (await context.client.query('UPDATE users SET role=$2,active=$3,password_hash=$4,version=version+1,updated_at=now() WHERE id=$1 RETURNING id,login_name,role,active,version', [row.id, role, active, hash])).rows[0]!;
      // Password reset and deactivation revoke sessions; role updates are checked on every request.
      if (!active || body.password !== undefined) await context.client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [row.id]);
      const user = projectUser(updated);
      await appendAudit(context, {entityType: 'user', entityId: user.id, oldVersion: Number(row.version), newVersion: user.version, before: projectUser(row), after: user});
      return {status: 200, body: parseSchema('User', user)};
    });
    if (result.replayed) reply.header('Idempotency-Replayed', 'true');
    return reply.code(result.status).send(result.body);
  });
  return security;
}
