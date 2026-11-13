CREATE TABLE users (
  id uuid PRIMARY KEY,
  login_name text NOT NULL,
  normalized_login_name text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','employee')),
  active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  token_hash text NOT NULL UNIQUE,
  csrf_token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE TABLE business_operations (
  id uuid PRIMARY KEY,
  kind text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  entity_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE idempotency_records (
  actor_id uuid NOT NULL REFERENCES users(id),
  route_key text NOT NULL,
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 16 AND 128),
  body_hash text NOT NULL,
  state text NOT NULL CHECK (state IN ('in_progress','completed','failed')),
  lease_token uuid NOT NULL,
  lease_until timestamptz NOT NULL,
  operation_id uuid REFERENCES business_operations(id),
  http_status integer,
  response_snapshot jsonb,
  replay_count bigint NOT NULL DEFAULT 0 CHECK (replay_count BETWEEN 0 AND 9007199254740991),
  last_replayed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id,route_key,request_key),
  CHECK ((state='in_progress' AND http_status IS NULL) OR (state<>'in_progress' AND http_status BETWEEN 100 AND 599))
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES business_operations(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  entity_type text NOT NULL,
  entity_id uuid,
  old_version bigint,
  new_version bigint,
  before_snapshot jsonb,
  after_snapshot jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_entity_idx ON audit_events(entity_type,entity_id,recorded_at);
-- Ordinary application writes can append audit facts, but cannot silently overwrite them.
CREATE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit events are append-only' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
