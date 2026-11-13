-- Rows and source manifests are captured in one repeatable-read transaction.
CREATE TABLE report_runs (
 id uuid PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN ('sales_summary','customer_product_comparison','inventory','customer_balances','cash_flow','inventory_loss')),
 query_hash text NOT NULL,
 normalized_query jsonb NOT NULL CHECK(jsonb_typeof(normalized_query)='object'),
 as_of timestamptz NOT NULL,
 generated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 source_watermark text NOT NULL,
 current_period jsonb,
 baseline_period jsonb,
 rows_snapshot jsonb NOT NULL CHECK(jsonb_typeof(rows_snapshot)='array'),
 source_manifest jsonb NOT NULL CHECK(jsonb_typeof(source_manifest)='array'),
 created_by uuid NOT NULL REFERENCES users(id),
 expires_at timestamptz NOT NULL CHECK(expires_at>generated_at)
);
CREATE INDEX report_runs_expiry ON report_runs(expires_at);
CREATE TRIGGER report_runs_immutable BEFORE UPDATE OR DELETE ON report_runs
 FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
