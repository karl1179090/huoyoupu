CREATE TABLE receipts (
  id uuid PRIMARY KEY,
  receipt_no varchar(64) NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('purchase','opening')),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  supplier_reference varchar(200) NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  operator_id uuid NOT NULL REFERENCES users(id),
  operation_id uuid NOT NULL UNIQUE REFERENCES business_operations(id),
  CHECK (received_at<=recorded_at)
);
CREATE TABLE receipt_lines (
  id uuid PRIMARY KEY,
  receipt_id uuid NOT NULL REFERENCES receipts(id),
  product_id uuid NOT NULL REFERENCES products(id),
  unit_id uuid NOT NULL,
  quantity bigint NOT NULL CHECK (quantity BETWEEN 1 AND 9007199254740991),
  multiplier_snapshot bigint NOT NULL CHECK (multiplier_snapshot BETWEEN 1 AND 9007199254740991),
  quantity_base bigint NOT NULL CHECK (quantity_base BETWEEN 1 AND 9007199254740991),
  input_unit_cost numeric(20,6) NOT NULL CHECK (input_unit_cost>=0),
  cost_amount numeric(20,2) NOT NULL CHECK (cost_amount>=0),
  FOREIGN KEY (unit_id,product_id) REFERENCES product_units(id,product_id),
  CHECK (quantity::numeric*multiplier_snapshot=quantity_base)
);
CREATE TABLE stock_balances (
  product_id uuid NOT NULL REFERENCES products(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  quantity_base bigint NOT NULL DEFAULT 0 CHECK (quantity_base BETWEEN 0 AND 9007199254740991),
  cost_amount numeric(20,2) NOT NULL DEFAULT 0 CHECK (cost_amount>=0),
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY (product_id,warehouse_id),
  CHECK (quantity_base<>0 OR cost_amount=0)
);
CREATE TABLE stocktakes (
  id uuid PRIMARY KEY,
  stocktake_no varchar(64) NOT NULL UNIQUE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  counted_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed')),
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  operator_id uuid NOT NULL REFERENCES users(id),
  operation_id uuid NOT NULL REFERENCES business_operations(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE stocktake_lines (
  id uuid PRIMARY KEY,
  stocktake_id uuid NOT NULL REFERENCES stocktakes(id),
  product_id uuid NOT NULL REFERENCES products(id),
  batch_id uuid,
  snapshot_quantity_base bigint NOT NULL CHECK (snapshot_quantity_base BETWEEN 0 AND 9007199254740991),
  snapshot_batch_version bigint CHECK (snapshot_batch_version BETWEEN 1 AND 9007199254740991),
  snapshot_stock_version bigint NOT NULL CHECK (snapshot_stock_version BETWEEN 1 AND 9007199254740991),
  actual_quantity_base bigint CHECK (actual_quantity_base BETWEEN 0 AND 9007199254740991),
  difference_base bigint GENERATED ALWAYS AS (actual_quantity_base-snapshot_quantity_base) STORED,
  gain_cost_unit_id uuid,
  gain_unit_cost numeric(20,6) CHECK (gain_unit_cost>=0),
  FOREIGN KEY (gain_cost_unit_id,product_id) REFERENCES product_units(id,product_id),
  CHECK ((batch_id IS NULL AND snapshot_batch_version IS NULL AND snapshot_quantity_base=0) OR
         (batch_id IS NOT NULL AND snapshot_batch_version IS NOT NULL)),
  UNIQUE NULLS NOT DISTINCT (stocktake_id,product_id,batch_id)
);
CREATE TABLE inventory_batches (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  source_kind text NOT NULL CHECK (source_kind IN ('receipt','stocktake_gain')),
  receipt_line_id uuid UNIQUE REFERENCES receipt_lines(id),
  stocktake_line_id uuid UNIQUE REFERENCES stocktake_lines(id),
  received_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  cost_unit_id uuid NOT NULL,
  multiplier_snapshot bigint NOT NULL CHECK (multiplier_snapshot BETWEEN 1 AND 9007199254740991),
  input_unit_cost numeric(20,6) NOT NULL CHECK (input_unit_cost>=0),
  initial_quantity_base bigint NOT NULL CHECK (initial_quantity_base BETWEEN 1 AND 9007199254740991),
  remaining_quantity_base bigint NOT NULL CHECK (remaining_quantity_base BETWEEN 0 AND 9007199254740991),
  initial_cost_amount numeric(20,2) NOT NULL CHECK (initial_cost_amount>=0),
  remaining_cost_amount numeric(20,2) NOT NULL CHECK (remaining_cost_amount>=0),
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  FOREIGN KEY (cost_unit_id,product_id) REFERENCES product_units(id,product_id),
  CHECK ((source_kind='receipt' AND receipt_line_id IS NOT NULL AND stocktake_line_id IS NULL) OR
         (source_kind='stocktake_gain' AND receipt_line_id IS NULL AND stocktake_line_id IS NOT NULL)),
  CHECK (remaining_quantity_base<=initial_quantity_base AND remaining_cost_amount<=initial_cost_amount),
  CHECK (remaining_quantity_base<>0 OR remaining_cost_amount=0),
  UNIQUE(id,product_id,warehouse_id)
);
ALTER TABLE stocktake_lines ADD CONSTRAINT stocktake_lines_batch_fk FOREIGN KEY (batch_id) REFERENCES inventory_batches(id);
CREATE TABLE stock_movements (
  id uuid PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES business_operations(id),
  source_kind text NOT NULL,
  source_id uuid NOT NULL,
  source_line_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  quantity_delta_base bigint NOT NULL CHECK (quantity_delta_base BETWEEN -9007199254740991 AND 9007199254740991 AND quantity_delta_base<>0),
  cost_delta_amount numeric(20,2) NOT NULL,
  balance_after_base bigint NOT NULL CHECK (balance_after_base BETWEEN 0 AND 9007199254740991),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  operator_id uuid NOT NULL REFERENCES users(id),
  effect_slot text NOT NULL,
  FOREIGN KEY (batch_id,product_id,warehouse_id) REFERENCES inventory_batches(id,product_id,warehouse_id),
  UNIQUE (source_kind,source_id,source_line_id,effect_slot),
  CHECK ((quantity_delta_base>0 AND cost_delta_amount>=0) OR (quantity_delta_base<0 AND cost_delta_amount<=0))
);
CREATE TABLE inventory_loss_entries (
  id uuid PRIMARY KEY,
  source_kind text NOT NULL,
  source_id uuid NOT NULL,
  source_line_id uuid NOT NULL,
  batch_id uuid REFERENCES inventory_batches(id),
  amount numeric(20,2) NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  operation_id uuid NOT NULL REFERENCES business_operations(id),
  reverses_id uuid UNIQUE REFERENCES inventory_loss_entries(id),
  UNIQUE (source_kind,source_id,source_line_id)
);
CREATE INDEX inventory_batches_fifo ON inventory_batches(product_id,warehouse_id,received_at,recorded_at,id) WHERE remaining_quantity_base>0;
CREATE INDEX stock_movements_product_warehouse ON stock_movements(product_id,warehouse_id,recorded_at,id);
CREATE INDEX stock_movements_source ON stock_movements(source_line_id,source_kind);
CREATE INDEX receipt_lines_receipt ON receipt_lines(receipt_id,id);
CREATE INDEX stocktake_lines_stocktake ON stocktake_lines(stocktake_id,id);
CREATE INDEX receipts_business_time ON receipts(received_at,id);
CREATE INDEX receipts_recorded_time ON receipts(recorded_at,id);
CREATE TRIGGER stock_movements_immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER inventory_loss_entries_immutable BEFORE UPDATE OR DELETE ON inventory_loss_entries FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE VIEW inventory_batch_data AS SELECT b.id,b.product_id,b.warehouse_id,
 jsonb_build_object('id',b.id,'productId',b.product_id,'warehouseId',b.warehouse_id,
 'sourceKind',b.source_kind,'sourceLineId',COALESCE(b.receipt_line_id,b.stocktake_line_id),
 'receivedAt',b.received_at,'recordedAt',b.recorded_at,'costUnitId',b.cost_unit_id,
 'multiplierBase',b.multiplier_snapshot,'unitCost',b.input_unit_cost::text,
 'quantityBase',b.remaining_quantity_base,'costAmount',b.remaining_cost_amount::text,'version',b.version) AS data FROM inventory_batches b;
CREATE VIEW inventory_receipt_data AS SELECT r.id,
 jsonb_build_object('id',r.id,'receiptNo',r.receipt_no,'kind',r.kind,'warehouseId',r.warehouse_id,
 'receivedAt',r.received_at,'recordedAt',r.recorded_at,'supplierReference',r.supplier_reference,
 'lines',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'productId',l.product_id,'unitId',l.unit_id,
   'quantity',l.quantity,'multiplierBase',l.multiplier_snapshot,'quantityBase',l.quantity_base,
   'unitCost',l.input_unit_cost::text,'costAmount',l.cost_amount::text,'batchId',b.id) ORDER BY l.id)
 FROM receipt_lines l JOIN inventory_batches b ON b.receipt_line_id=l.id WHERE l.receipt_id=r.id),'[]'::jsonb)) AS data FROM receipts r;
CREATE VIEW inventory_stocktake_data AS SELECT s.id,
 jsonb_build_object('id',s.id,'stocktakeNo',s.stocktake_no,'warehouseId',s.warehouse_id,'countedAt',s.counted_at,
 'status',s.status,'version',s.version,'lines',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,
 'productId',l.product_id,'batchId',l.batch_id,'snapshotQuantityBase',l.snapshot_quantity_base,
 'snapshotBatchVersion',l.snapshot_batch_version,'actualQuantityBase',l.actual_quantity_base,
 'differenceBase',l.difference_base,'gainCostUnitId',l.gain_cost_unit_id,'gainUnitCost',l.gain_unit_cost::text,
 'resultBatchId',b.id) ORDER BY l.id) FROM stocktake_lines l LEFT JOIN inventory_batches b ON b.stocktake_line_id=l.id WHERE l.stocktake_id=s.id),'[]'::jsonb)) AS data FROM stocktakes s;
CREATE VIEW inventory_balance_data AS SELECT s.product_id,s.warehouse_id,
 jsonb_build_object('productId',s.product_id,'warehouseId',s.warehouse_id,'quantityBase',s.quantity_base,
 'costAmount',s.cost_amount::text,'version',s.version) AS data FROM stock_balances s;
CREATE VIEW inventory_movement_data AS SELECT m.id,
 jsonb_build_object('id',m.id,'operationId',m.operation_id,'sourceKind',m.source_kind,'sourceId',m.source_id,
 'batchId',m.batch_id,'productId',m.product_id,'warehouseId',m.warehouse_id,'quantityDeltaBase',m.quantity_delta_base,
 'costDeltaAmount',m.cost_delta_amount::text,'balanceAfterBase',m.balance_after_base,'recordedAt',m.recorded_at) AS data FROM stock_movements m;
