CREATE TABLE ai_query_runs (
 id uuid PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES users(id),
 question varchar(4000) NOT NULL,
 normalized_intent jsonb NOT NULL,
 report_run_id uuid REFERENCES report_runs(id),
 status text NOT NULL CHECK(status IN ('answered','needs_clarification')),
 clarification_snapshot jsonb,
 result_snapshot jsonb NOT NULL,
 model_reference varchar(200) NOT NULL,
 parent_run_id uuid REFERENCES ai_query_runs(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((status='answered' AND report_run_id IS NOT NULL) OR (status='needs_clarification' AND report_run_id IS NULL))
);
CREATE INDEX ai_query_runs_actor ON ai_query_runs(actor_id,created_at DESC,id);
CREATE TRIGGER ai_query_runs_immutable BEFORE UPDATE OR DELETE ON ai_query_runs FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
