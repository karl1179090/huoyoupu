CREATE TABLE customer_accounts (
  customer_id uuid PRIMARY KEY REFERENCES customers(id),
  net_balance numeric(20,2) NOT NULL DEFAULT 0,
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991)
);
CREATE TABLE customer_ledger_entries (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id),
  operation_id uuid NOT NULL REFERENCES business_operations(id),
  kind text NOT NULL CHECK (kind IN ('sale','return','reversal','reclassification','opening','receipt','refund')),
  category text NOT NULL CHECK (category IN ('sale','return','opening','receipt','refund')),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  source_version bigint CHECK (source_version BETWEEN 1 AND 9007199254740991),
  order_id uuid REFERENCES sales_orders(id),
  amount_signed numeric(20,2) NOT NULL,
  effective_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reverses_id uuid REFERENCES customer_ledger_entries(id),
  reclassifies_id uuid REFERENCES customer_ledger_entries(id),
  effect_slot integer NOT NULL CHECK (effect_slot>=0),
  UNIQUE (operation_id,effect_slot), UNIQUE (id,customer_id),
  CHECK ((category IN ('sale','return') AND order_id IS NOT NULL) OR (category NOT IN ('sale','return') AND order_id IS NULL))
);
CREATE INDEX customer_ledger_time ON customer_ledger_entries(customer_id,effective_at,recorded_at,id);
CREATE UNIQUE INDEX customer_ledger_single_reversal ON customer_ledger_entries(reverses_id) WHERE reverses_id IS NOT NULL;
CREATE UNIQUE INDEX customer_ledger_single_reclassification ON customer_ledger_entries(reclassifies_id) WHERE reclassifies_id IS NOT NULL;
CREATE INDEX customer_ledger_order ON customer_ledger_entries(order_id,customer_id);
CREATE TRIGGER customer_ledger_immutable BEFORE UPDATE OR DELETE ON customer_ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TABLE opening_balances (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id),
  amount numeric(20,2) NOT NULL CHECK (amount<>0),
  effective_at timestamptz NOT NULL,
  reason text NOT NULL,
  ledger_entry_id uuid NOT NULL UNIQUE REFERENCES customer_ledger_entries(id),
  operation_id uuid NOT NULL REFERENCES business_operations(id),
  UNIQUE (customer_id,effective_at)
);
CREATE TABLE cash_events (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id),
  kind text NOT NULL CHECK (kind IN ('receipt','refund')),
  amount numeric(20,2) NOT NULL CHECK (amount>0),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  method text NOT NULL CHECK (method IN ('cash','bank_transfer','wechat','alipay','other')),
  reference text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '',
  related_return_id uuid REFERENCES sales_returns(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','reversed')),
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  operation_id uuid NOT NULL UNIQUE REFERENCES business_operations(id),
  ledger_entry_id uuid NOT NULL UNIQUE REFERENCES customer_ledger_entries(id),
  reversed_by_id uuid,
  UNIQUE (id,customer_id),
  CHECK ((status='active' AND reversed_by_id IS NULL) OR (status='reversed' AND reversed_by_id IS NOT NULL))
);
CREATE INDEX cash_events_customer_time ON cash_events(customer_id,occurred_at,id);
CREATE TABLE cash_reversals (
  id uuid PRIMARY KEY,
  cash_event_id uuid NOT NULL UNIQUE REFERENCES cash_events(id),
  operation_id uuid NOT NULL UNIQUE REFERENCES business_operations(id),
  reason text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE cash_events ADD CONSTRAINT cash_event_reversal_fk FOREIGN KEY (reversed_by_id) REFERENCES cash_reversals(id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE settlement_allocations (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id),
  source_ledger_entry_id uuid NOT NULL,
  target_order_id uuid REFERENCES sales_orders(id),
  target_refund_id uuid REFERENCES cash_events(id),
  kind text NOT NULL CHECK (kind IN ('allocate','release')),
  amount numeric(20,2) NOT NULL CHECK (amount>0),
  reverses_allocation_id uuid REFERENCES settlement_allocations(id),
  operation_id uuid NOT NULL REFERENCES business_operations(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(source_ledger_entry_id,customer_id) REFERENCES customer_ledger_entries(id,customer_id),
  CHECK ((target_order_id IS NULL) <> (target_refund_id IS NULL)),
  CHECK ((kind='allocate' AND reverses_allocation_id IS NULL) OR (kind='release' AND reverses_allocation_id IS NOT NULL))
);
CREATE INDEX settlement_source ON settlement_allocations(source_ledger_entry_id);
CREATE INDEX settlement_order ON settlement_allocations(target_order_id);
CREATE INDEX settlement_refund ON settlement_allocations(target_refund_id);
CREATE TRIGGER settlement_allocations_immutable BEFORE UPDATE OR DELETE ON settlement_allocations
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TABLE statement_snapshots (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL CHECK (period_end>period_start),
  as_of timestamptz NOT NULL DEFAULT clock_timestamp(),
  source_watermark text NOT NULL,
  opening_balance numeric(20,2) NOT NULL,
  sales_amount numeric(20,2) NOT NULL CHECK (sales_amount>=0),
  return_amount numeric(20,2) NOT NULL CHECK (return_amount>=0),
  receipt_amount numeric(20,2) NOT NULL CHECK (receipt_amount>=0),
  refund_amount numeric(20,2) NOT NULL CHECK (refund_amount>=0),
  closing_balance numeric(20,2) NOT NULL,
  query_snapshot jsonb NOT NULL,
  rows_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  operation_id uuid NOT NULL UNIQUE REFERENCES business_operations(id),
  CHECK (closing_balance=opening_balance+sales_amount-return_amount-receipt_amount+refund_amount)
);
CREATE INDEX statement_customer_period ON statement_snapshots(customer_id,period_start,period_end,created_at,id);
CREATE TRIGGER statement_snapshots_immutable BEFORE UPDATE OR DELETE ON statement_snapshots
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
