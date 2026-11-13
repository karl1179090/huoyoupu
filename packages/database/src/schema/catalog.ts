import { sql } from 'drizzle-orm';
import { primaryKey, bigint, boolean, numeric, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

const metadata = () => ({
  version: bigint('version', { mode: 'number' }).notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
// Deferred circular and composite foreign keys, checks, triggers, and partial indexes
// are declared by 002_catalog.sql, which is the executable migration authority.
export const products = pgTable('products', {
  id: uuid('id').primaryKey(), code: varchar('code', { length: 64 }).notNull(),
  normalizedCode: varchar('normalized_code', { length: 64 }).generatedAlwaysAs(sql`lower(btrim(code))`),
  name: varchar('name', { length: 200 }).notNull(), specification: varchar('specification', { length: 200 }).notNull().default(''),
  brand: varchar('brand', { length: 100 }).notNull().default(''), generatedMnemonic: varchar('generated_mnemonic', { length: 200 }).notNull(),
  mnemonicOverride: varchar('mnemonic_override', { length: 200 }), effectiveMnemonic: varchar('effective_mnemonic', { length: 200 }).notNull(),
  baseUnitId: uuid('base_unit_id').notNull(), active: boolean('active').notNull().default(true), ...metadata(),
});
export const productUnits = pgTable('product_units', {
  id: uuid('id').primaryKey(), productId: uuid('product_id').notNull().references(() => products.id), name: varchar('name', { length: 30 }).notNull(),
  multiplierBase: bigint('multiplier_base', { mode: 'number' }).notNull(),
  defaultSalePrice: numeric('default_sale_price', { precision: 20, scale: 6 }).notNull(),
  defaultReceiptCost: numeric('default_receipt_cost', { precision: 20, scale: 6 }),
  active: boolean('active').notNull().default(true), ...metadata(),
}, table => [unique().on(table.productId, table.name), unique().on(table.id, table.productId)]);
export const productBarcodes = pgTable('product_barcodes', {
  value: varchar('barcode_value', { length: 100 }).primaryKey(), productId: uuid('product_id').notNull().references(() => products.id), unitId: uuid('unit_id').notNull(),
});
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey(), code: varchar('code', { length: 64 }).notNull(), name: varchar('name', { length: 200 }).notNull(),
  contactName: varchar('contact_name', { length: 80 }).notNull().default(''), phone: varchar('phone', { length: 40 }).notNull().default(''),
  notes: varchar('notes', { length: 1000 }).notNull().default(''), active: boolean('active').notNull().default(true), ...metadata(),
});
export const customerAddresses = pgTable('customer_addresses', {
  id: uuid('id').primaryKey(), customerId: uuid('customer_id').notNull().references(() => customers.id), label: varchar('label', { length: 80 }).notNull().default(''),
  contactName: varchar('contact_name', { length: 80 }).notNull(), phone: varchar('phone', { length: 40 }).notNull().default(''), address: varchar('address', { length: 500 }).notNull(),
  isDefault: boolean('is_default').notNull().default(false), active: boolean('active').notNull().default(true), ...metadata(),
}, table => [unique().on(table.id, table.customerId)]);
export const customerPriceRules = pgTable('customer_price_rules', {
  customerId: uuid('customer_id').notNull().references(() => customers.id), productId: uuid('product_id').notNull().references(() => products.id),
  unitId: uuid('unit_id').notNull(), unitPrice: numeric('unit_price', { precision: 20, scale: 6 }).notNull(), ...metadata(),
}, table => [primaryKey({ columns: [table.customerId, table.productId, table.unitId] })]);
export const warehouses = pgTable('warehouses', {
  id: uuid('id').primaryKey(), code: varchar('code', { length: 64 }).notNull(), name: varchar('name', { length: 100 }).notNull(),
  active: boolean('active').notNull().default(true), ...metadata(),
});
