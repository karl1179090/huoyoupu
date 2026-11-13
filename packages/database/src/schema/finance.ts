import {bigint,integer,jsonb,numeric,pgTable,text,timestamp,uuid} from 'drizzle-orm/pg-core';
import {customers} from './catalog.js';
import {businessOperations} from './security.js';
const time=(name:string)=>timestamp(name,{withTimezone:true,mode:'date'});
const money=(name:string)=>numeric(name,{precision:20,scale:2});
// SQL migration owns composite/source and immutable constraints; decimal values remain strings.
export const customerAccounts=pgTable('customer_accounts',{
 customerId:uuid('customer_id').primaryKey().references(()=>customers.id),netBalance:money('net_balance').notNull().default('0'),version:bigint('version',{mode:'number'}).notNull().default(1)
});
export const customerLedgerEntries=pgTable('customer_ledger_entries',{
 id:uuid('id').primaryKey(),customerId:uuid('customer_id').notNull().references(()=>customers.id),operationId:uuid('operation_id').notNull().references(()=>businessOperations.id),
 kind:text('kind').notNull(),category:text('category').notNull(),sourceType:text('source_type').notNull(),sourceId:uuid('source_id').notNull(),sourceVersion:bigint('source_version',{mode:'number'}),orderId:uuid('order_id'),
 amountSigned:money('amount_signed').notNull(),effectiveAt:time('effective_at').notNull(),recordedAt:time('recorded_at').notNull().defaultNow(),reversesId:uuid('reverses_id'),reclassifiesId:uuid('reclassifies_id'),effectSlot:integer('effect_slot').notNull()
});
export const openingBalances=pgTable('opening_balances',{
 id:uuid('id').primaryKey(),customerId:uuid('customer_id').notNull().references(()=>customers.id),amount:money('amount').notNull(),effectiveAt:time('effective_at').notNull(),reason:text('reason').notNull(),ledgerEntryId:uuid('ledger_entry_id').notNull().unique().references(()=>customerLedgerEntries.id),operationId:uuid('operation_id').notNull().references(()=>businessOperations.id)
});
export const cashEvents=pgTable('cash_events',{
 id:uuid('id').primaryKey(),customerId:uuid('customer_id').notNull().references(()=>customers.id),kind:text('kind',{enum:['receipt','refund']}).notNull(),amount:money('amount').notNull(),occurredAt:time('occurred_at').notNull(),recordedAt:time('recorded_at').notNull().defaultNow(),method:text('method').notNull(),reference:text('reference').notNull().default(''),note:text('note').notNull().default(''),relatedReturnId:uuid('related_return_id'),status:text('status',{enum:['active','reversed']}).notNull().default('active'),version:bigint('version',{mode:'number'}).notNull().default(1),operationId:uuid('operation_id').notNull().unique().references(()=>businessOperations.id),ledgerEntryId:uuid('ledger_entry_id').notNull().unique().references(()=>customerLedgerEntries.id),reversedById:uuid('reversed_by_id')
});
export const cashReversals=pgTable('cash_reversals',{
 id:uuid('id').primaryKey(),cashEventId:uuid('cash_event_id').notNull().unique().references(()=>cashEvents.id),operationId:uuid('operation_id').notNull().unique().references(()=>businessOperations.id),reason:text('reason').notNull(),recordedAt:time('recorded_at').notNull().defaultNow()
});
export const settlementAllocations=pgTable('settlement_allocations',{
 id:uuid('id').primaryKey(),customerId:uuid('customer_id').notNull().references(()=>customers.id),sourceLedgerEntryId:uuid('source_ledger_entry_id').notNull().references(()=>customerLedgerEntries.id),targetOrderId:uuid('target_order_id'),targetRefundId:uuid('target_refund_id').references(()=>cashEvents.id),kind:text('kind',{enum:['allocate','release']}).notNull(),amount:money('amount').notNull(),reversesAllocationId:uuid('reverses_allocation_id'),operationId:uuid('operation_id').notNull().references(()=>businessOperations.id),recordedAt:time('recorded_at').notNull().defaultNow()
});
export const statementSnapshots=pgTable('statement_snapshots',{
 id:uuid('id').primaryKey(),customerId:uuid('customer_id').notNull().references(()=>customers.id),periodStart:time('period_start').notNull(),periodEnd:time('period_end').notNull(),asOf:time('as_of').notNull().defaultNow(),sourceWatermark:text('source_watermark').notNull(),openingBalance:money('opening_balance').notNull(),salesAmount:money('sales_amount').notNull(),returnAmount:money('return_amount').notNull(),receiptAmount:money('receipt_amount').notNull(),refundAmount:money('refund_amount').notNull(),closingBalance:money('closing_balance').notNull(),querySnapshot:jsonb('query_snapshot').notNull(),rowsSnapshot:jsonb('rows_snapshot').notNull(),createdAt:time('created_at').notNull().defaultNow(),operationId:uuid('operation_id').notNull().unique().references(()=>businessOperations.id)
});
