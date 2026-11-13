import {randomUUID} from 'node:crypto';
import type {OperationContext} from './security.js';
export interface AuditChange {
  entityType: string;
  entityId?: string;
  oldVersion?: number;
  newVersion?: number;
  before?: unknown;
  after?: unknown;
}
/** Callers must explicitly project snapshots and exclude credentials and session secrets. */
export async function appendAudit(context: OperationContext, change: AuditChange): Promise<void> {
  await context.client.query(`INSERT INTO audit_events
    (id,operation_id,actor_id,entity_type,entity_id,old_version,new_version,before_snapshot,after_snapshot)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [randomUUID(), context.operationId, context.actor.id, change.entityType,
    change.entityId ?? null, change.oldVersion ?? null, change.newVersion ?? null,
    change.before === undefined ? null : JSON.stringify(change.before), change.after === undefined ? null : JSON.stringify(change.after)]);
}
