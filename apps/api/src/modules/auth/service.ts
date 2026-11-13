import {createHash, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import type {FastifyRequest, FastifyReply} from 'fastify';
import type {Pool, PoolClient} from 'pg';
import type {Actor, SecurityServices, OperationContext, OperationResult} from '../../lib/security.js';
import {AppError, publicError} from '../../lib/errors.js';
import {appendAudit} from '../../lib/audit.js';
import {withTransaction} from '@huoyoupu/database';
import {hashPassword, verifyPassword} from './password.js';

const cookieName = '__Host-huoyoupu_session';
export const ADMIN_LOCK = 19384531;
const token = () => randomBytes(32).toString('base64url');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const normalizeLogin = (value: string) => value.trim().toLowerCase();
export function projectUser(row: Record<string, unknown>): Actor {
  return {id: String(row.id), loginName: String(row.login_name), role: row.role as Actor['role'], active: Boolean(row.active), version: Number(row.version)};
}
function cookieToken(request: FastifyRequest): string | undefined {
  const matches = (request.headers.cookie ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${cookieName}=`));
  if (matches.length !== 1) return undefined;
  const value = matches[0]!.slice(cookieName.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
function canonical(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
interface SessionRow {id: string; user_id: string | null; csrf_token_hash: string; expires_at: Date; revoked_at: Date | null}
interface IdempotencyRow {body_hash: string; state: string; lease_token: string; lease_until: Date; http_status: number | null; response_snapshot: unknown}
export interface SecurityOptions {origin: string; sessionTtlMs?: number; leaseMs?: number}
export function createSecurity(pool: Pool, options: SecurityOptions): SecurityServices & {
  session(request: FastifyRequest, reply: FastifyReply): Promise<{user: Actor | null; csrfToken: string}>;
  login(request: FastifyRequest, reply: FastifyReply, input: {loginName: string; password: string}): Promise<{user: Actor; csrfToken: string}>;
  logout(request: FastifyRequest, reply: FastifyReply): Promise<void>;
} {
  const origin = new URL(options.origin).origin;
  const ttl = options.sessionTtlMs ?? 12 * 60 * 60 * 1000;
  const leaseMs = options.leaseMs ?? 30_000;
  if (!Number.isSafeInteger(ttl) || ttl <= 0 || !Number.isSafeInteger(leaseMs) || leaseMs <= 0) throw new Error('Invalid security durations');
  let dummyHash: Promise<string> | undefined;
  async function lookupSession(request: FastifyRequest, client: Pick<Pool | PoolClient, 'query'> = pool): Promise<SessionRow | undefined> {
    const value = cookieToken(request);
    if (!value) return undefined;
    return (await client.query<SessionRow>('SELECT id,user_id,csrf_token_hash,expires_at,revoked_at FROM sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()', [digest(value)])).rows[0];
  }
  async function requireUser(request: FastifyRequest): Promise<Actor> {
    const session = await lookupSession(request);
    if (!session?.user_id) throw new AppError('UNAUTHENTICATED', 401, '请先登录');
    const row = (await pool.query('SELECT id,login_name,role,active,version FROM users WHERE id=$1 AND active', [session.user_id])).rows[0];
    if (!row) throw new AppError('UNAUTHENTICATED', 401, '会话已失效');
    return projectUser(row);
  }
  async function requireAdmin(request: FastifyRequest): Promise<Actor> {
    const actor = await requireUser(request);
    if (actor.role !== 'admin') throw new AppError('FORBIDDEN', 403, '无权执行此操作');
    return actor;
  }
  async function validateWrite(request: FastifyRequest): Promise<SessionRow> {
    if (request.headers.origin !== origin) throw new AppError('CSRF_INVALID', 403, '请求来源无效');
    const session = await lookupSession(request);
    const csrf = request.headers['x-csrf-token'];
    if (!session || typeof csrf !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(csrf) || !timingSafeEqual(Buffer.from(digest(csrf)), Buffer.from(session.csrf_token_hash)))
      throw new AppError('CSRF_INVALID', 403, '请求验证已失效，请刷新会话');
    return session;
  }
  function setCookie(reply: FastifyReply, value: string, maxAge: number): void {
    reply.header('Set-Cookie', `${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`);
    reply.header('Cache-Control', 'no-store');
  }
  async function newSession(reply: FastifyReply, userId: string | null, client: Pick<Pool | PoolClient, 'query'> = pool): Promise<string> {
    const secret = token(), csrf = token();
    await client.query('INSERT INTO sessions (id,user_id,token_hash,csrf_token_hash,expires_at) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), userId, digest(secret), digest(csrf), new Date(Date.now() + ttl)]);
    setCookie(reply, secret, Math.floor(ttl / 1000));
    return csrf;
  }
  async function session(request: FastifyRequest, reply: FastifyReply) {
    const current = await lookupSession(request);
    let user: Actor | null = null;
    if (current?.user_id) {
      try { user = await requireUser(request); } catch (error) { if (!(error instanceof AppError)) throw error; }
    }
    if (!current || (current.user_id && !user)) return {user: null, csrfToken: await newSession(reply, null)};
    const csrf = token();
    await pool.query('UPDATE sessions SET csrf_token_hash=$1 WHERE id=$2', [digest(csrf), current.id]);
    reply.header('Cache-Control', 'no-store');
    return {user, csrfToken: csrf};
  }
  async function login(request: FastifyRequest, reply: FastifyReply, input: {loginName: string; password: string}) {
    const anonymous = await validateWrite(request);
    const row = (await pool.query('SELECT * FROM users WHERE normalized_login_name=$1', [normalizeLogin(input.loginName)])).rows[0];
    dummyHash ??= hashPassword('dummy-password-that-is-never-used');
    const valid = await verifyPassword(input.password, row ? String(row.password_hash) : await dummyHash);
    if (!row || !row.active || !valid) throw new AppError('UNAUTHENTICATED', 401, '账号或密码错误');
    const result = await withTransaction(pool, async client => {
      const active = (await client.query('SELECT id,login_name,role,active,version FROM users WHERE id=$1 AND active AND password_hash=$2 FOR SHARE', [row.id, row.password_hash])).rows[0];
      if (!active) throw new AppError('UNAUTHENTICATED', 401, '账号或密码错误');
      await client.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [anonymous.id]);
      return {user: projectUser(active), csrfToken: await newSession(reply, String(row.id), client)};
    });
    return result;
  }
  async function logout(request: FastifyRequest, reply: FastifyReply) {
    await requireUser(request);
    const current = await validateWrite(request);
    await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [current.id]);
    setCookie(reply, '', 0);
  }
  async function withOperation<T>(request: FastifyRequest, operation: {kind: string; routeKey: string; allowedRoles?: readonly Actor['role'][]}, work: (context: OperationContext) => Promise<OperationResult<T>>): Promise<OperationResult<T> & {replayed: boolean}> {
    const allowedRoles = operation.allowedRoles ?? ['admin'];
    const requireAllowed = async () => {const actor = await requireUser(request);if (!allowedRoles.includes(actor.role)) throw new AppError('FORBIDDEN',403,'无权执行此操作');return actor;};
    const actor = await requireAllowed();
    await validateWrite(request);
    const requestKey = request.headers['idempotency-key'];
    if (typeof requestKey !== 'string' || requestKey.length < 16 || requestKey.length > 128) throw new AppError('INVALID_REQUEST', 400, '需要合法的 Idempotency-Key');
    const bodyHash = digest(canonical({params: request.params, query: request.query, body: request.body}));
    const leaseToken = randomUUID();
    const keys = [actor.id, operation.routeKey, requestKey];
    const replay = await withTransaction(pool, async client => {
      await client.query(`INSERT INTO idempotency_records (actor_id,route_key,request_key,body_hash,state,lease_token,lease_until)
        VALUES ($1,$2,$3,$4,'in_progress',$5,$6) ON CONFLICT DO NOTHING`, [...keys, bodyHash, leaseToken, new Date(Date.now() + leaseMs)]);
      const row = (await client.query<IdempotencyRow>('SELECT * FROM idempotency_records WHERE actor_id=$1 AND route_key=$2 AND request_key=$3 FOR UPDATE', keys)).rows[0]!;
      if (row.body_hash !== bodyHash) throw new AppError('IDEMPOTENCY_CONFLICT', 409, '同一幂等键不能用于不同请求');
      if (row.state !== 'in_progress') {
        await client.query('UPDATE idempotency_records SET replay_count=replay_count+1,last_replayed_at=now() WHERE actor_id=$1 AND route_key=$2 AND request_key=$3', keys);
        return {status: row.http_status!, body: row.response_snapshot as T, replayed: true};
      }
      if (row.lease_token !== leaseToken && row.lease_until.getTime() > Date.now()) throw new AppError('OPERATION_IN_PROGRESS', 409, '操作正在处理中', {retryAfterMs: Math.max(0, row.lease_until.getTime() - Date.now())}, true);
      if (row.lease_token !== leaseToken) await client.query('UPDATE idempotency_records SET lease_token=$4,lease_until=$5 WHERE actor_id=$1 AND route_key=$2 AND request_key=$3', [...keys, leaseToken, new Date(Date.now() + leaseMs)]);
      return undefined;
    });
    if (replay) { await requireAllowed(); return replay; }
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const result = await withTransaction(pool, async client => {
            const registration = (await client.query<IdempotencyRow>('SELECT * FROM idempotency_records WHERE actor_id=$1 AND route_key=$2 AND request_key=$3 FOR UPDATE', keys)).rows[0]!;
            const active = (await client.query('SELECT id,login_name,role,active,version FROM users WHERE id=$1 AND active', [actor.id])).rows[0];
            if (!active || !allowedRoles.includes(active.role as Actor['role'])) throw new AppError('FORBIDDEN', 403, '权限已变化');
            const currentSession=await lookupSession(request,client);
            if(currentSession?.user_id!==actor.id)throw new AppError('UNAUTHENTICATED',401,'会话已失效');
            if (registration.state !== 'in_progress') return {status: registration.http_status!, body: registration.response_snapshot as T, replayed: true};
            if (registration.lease_token !== leaseToken) throw new AppError('OPERATION_IN_PROGRESS', 409, '请求处理权已变化，请稍后重试', undefined, true);
            const context: OperationContext = {client, actor: projectUser(active), operationId: randomUUID()};
            await client.query('INSERT INTO business_operations (id,kind,actor_id) VALUES ($1,$2,$3)', [context.operationId, operation.kind, actor.id]);
            const response = await work(context);
            await appendAudit(context, {entityType: operation.kind});
            await client.query(`UPDATE idempotency_records SET state='completed',operation_id=$4,http_status=$5,response_snapshot=$6
              WHERE actor_id=$1 AND route_key=$2 AND request_key=$3 AND lease_token=$7`, [...keys, context.operationId, response.status, JSON.stringify(response.body ?? null), leaseToken]);
            return {...response, replayed: false};
          });
          return result;
        } catch (error) {
          const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
          if (attempt < 2 && ['40001', '40P01'].includes(code)) continue;
          throw error;
        }
      }
    } catch (error) {
      const failure = publicError(error, request.id);
      const saved = await pool.query(`UPDATE idempotency_records SET state='failed',http_status=$4,response_snapshot=$5
        WHERE actor_id=$1 AND route_key=$2 AND request_key=$3 AND state='in_progress' AND lease_token=$6`, [...keys, failure.status, JSON.stringify(failure.body), leaseToken]);
      if (saved.rowCount !== 1) throw new AppError('OPERATION_IN_PROGRESS', 409, '结果状态已变化，请重试原请求', undefined, true);
      return {status: failure.status, body: failure.body as T, replayed: false};
    }
  }
  async function validateReadPost(request: FastifyRequest): Promise<void> {
    await requireAdmin(request);
    await validateWrite(request);
  }
  return {requireUser, requireAdmin, validateReadPost, withOperation, session, login, logout};
}

export async function initializeAdministrator(pool: Pool, input: {loginName: string; password: string}): Promise<Actor> {
  if (!input.loginName.trim() || input.loginName.length > 80 || input.password.length < 12 || input.password.length > 128) throw new AppError('INVALID_REQUEST', 400, '初始化账号需合法名称及12–128位密码');
  const passwordHash = await hashPassword(input.password);
  return withTransaction(pool, async client => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_LOCK]);
    if ((await client.query('SELECT id FROM users LIMIT 1')).rowCount) throw new AppError('RELATED_RECORD_CONFLICT', 409, '已有账号，禁止重复初始化');
    const row = (await client.query('INSERT INTO users (id,login_name,normalized_login_name,password_hash,role) VALUES ($1,$2,$3,$4,\'admin\') RETURNING id,login_name,role,active,version', [randomUUID(), input.loginName.trim(), normalizeLogin(input.loginName), passwordHash])).rows[0]!;
    const actor = projectUser(row);
    const context: OperationContext = {client, actor, operationId: randomUUID()};
    await client.query('INSERT INTO business_operations (id,kind,actor_id) VALUES ($1,$2,$3)', [context.operationId, 'initializeAdministrator', actor.id]);
    await appendAudit(context, {entityType: 'user', entityId: actor.id, newVersion: actor.version, after: actor});
    return actor;
  });
}
