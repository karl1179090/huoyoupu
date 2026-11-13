import {jsonb,pgTable,text,timestamp,uuid} from 'drizzle-orm/pg-core';
// Migration 006 supplies kind/JSON checks, immutable trigger, and actor FK.
export const reportRuns=pgTable('report_runs',{
 id:uuid('id').primaryKey(),kind:text('kind').notNull(),queryHash:text('query_hash').notNull(),normalizedQuery:jsonb('normalized_query').notNull(),
 asOf:timestamp('as_of',{withTimezone:true}).notNull(),generatedAt:timestamp('generated_at',{withTimezone:true}).notNull().defaultNow(),sourceWatermark:text('source_watermark').notNull(),
 currentPeriod:jsonb('current_period'),baselinePeriod:jsonb('baseline_period'),rowsSnapshot:jsonb('rows_snapshot').notNull(),sourceManifest:jsonb('source_manifest').notNull(),createdBy:uuid('created_by').notNull(),expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),
});
