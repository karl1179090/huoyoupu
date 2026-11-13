import type {FastifyRequest} from 'fastify';
import type {Pool, PoolClient} from 'pg';

export interface Actor {id: string; loginName: string; role: 'admin' | 'employee'; active: boolean; version: number}
export interface OperationContext {client: PoolClient; actor: Actor; operationId: string}
export interface OperationResult<T> {status: number; body: T}
export interface SecurityServices {
  requireUser(request: FastifyRequest): Promise<Actor>;
  requireAdmin(request: FastifyRequest): Promise<Actor>;
  validateReadPost(request: FastifyRequest): Promise<void>;
  withOperation<T>(request: FastifyRequest, options: {kind: string; routeKey: string; allowedRoles?: readonly Actor['role'][]}, work: (context: OperationContext) => Promise<OperationResult<T>>): Promise<OperationResult<T> & {replayed: boolean}>;
}
export interface ApiDependencies {pool: Pool; security: SecurityServices}
