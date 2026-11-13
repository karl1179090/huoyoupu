import {bigint, boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid} from 'drizzle-orm/pg-core';
const time = (name: string) => timestamp(name, {withTimezone: true, mode: 'date'});
export const users = pgTable('users', {
  id: uuid('id').primaryKey(), loginName: text('login_name').notNull(), normalizedLoginName: text('normalized_login_name').notNull().unique(),
  passwordHash: text('password_hash').notNull(), role: text('role', {enum: ['admin', 'employee']}).notNull(), active: boolean('active').notNull().default(true),
  version: bigint('version', {mode: 'number'}).notNull().default(1), createdAt: time('created_at').notNull().defaultNow(), updatedAt: time('updated_at').notNull().defaultNow()
});
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(), userId: uuid('user_id').references(() => users.id), tokenHash: text('token_hash').notNull().unique(), csrfTokenHash: text('csrf_token_hash').notNull(),
  expiresAt: time('expires_at').notNull(), revokedAt: time('revoked_at'), createdAt: time('created_at').notNull().defaultNow()
});
export const businessOperations = pgTable('business_operations', {
  id: uuid('id').primaryKey(), kind: text('kind').notNull(), actorId: uuid('actor_id').notNull().references(() => users.id), entityId: uuid('entity_id'), reason: text('reason'), createdAt: time('created_at').notNull().defaultNow()
});
export const idempotencyRecords = pgTable('idempotency_records', {
  actorId: uuid('actor_id').notNull().references(() => users.id), routeKey: text('route_key').notNull(), requestKey: text('request_key').notNull(), bodyHash: text('body_hash').notNull(),
  state: text('state', {enum: ['in_progress', 'completed', 'failed']}).notNull(), leaseToken: uuid('lease_token').notNull(), leaseUntil: time('lease_until').notNull(),
  operationId: uuid('operation_id').references(() => businessOperations.id), httpStatus: integer('http_status'), responseSnapshot: jsonb('response_snapshot'), replayCount: bigint('replay_count', {mode: 'number'}).notNull().default(0), lastReplayedAt: time('last_replayed_at'), createdAt: time('created_at').notNull().defaultNow()
}, table => [primaryKey({columns: [table.actorId, table.routeKey, table.requestKey]})]);
export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey(), operationId: uuid('operation_id').notNull().references(() => businessOperations.id), actorId: uuid('actor_id').notNull().references(() => users.id),
  entityType: text('entity_type').notNull(), entityId: uuid('entity_id'), oldVersion: bigint('old_version', {mode: 'number'}), newVersion: bigint('new_version', {mode: 'number'}),
  beforeSnapshot: jsonb('before_snapshot'), afterSnapshot: jsonb('after_snapshot'), recordedAt: time('recorded_at').notNull().defaultNow()
});
