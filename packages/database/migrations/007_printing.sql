CREATE TABLE print_templates (
 id uuid PRIMARY KEY,
 name varchar(100) NOT NULL CHECK(length(name)>0),
 active boolean NOT NULL DEFAULT true,
 default_version_id uuid NOT NULL,
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991)
);
CREATE TABLE print_template_versions (
 id uuid PRIMARY KEY,
 template_id uuid NOT NULL REFERENCES print_templates(id),
 version_no bigint NOT NULL CHECK(version_no BETWEEN 1 AND 9007199254740991),
 config_json jsonb NOT NULL CHECK(jsonb_typeof(config_json)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_by uuid NOT NULL REFERENCES users(id),
 UNIQUE(template_id,version_no),UNIQUE(id,template_id)
);
ALTER TABLE print_templates ADD CONSTRAINT print_current_version_fk FOREIGN KEY(default_version_id,id) REFERENCES print_template_versions(id,template_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TRIGGER print_template_versions_immutable BEFORE UPDATE OR DELETE ON print_template_versions FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TABLE company_profiles (
 id smallint PRIMARY KEY CHECK(id=1),
 name varchar(200) NOT NULL DEFAULT '',phone varchar(40) NOT NULL DEFAULT '',address varchar(500) NOT NULL DEFAULT '',
 default_template_id uuid REFERENCES print_templates(id),
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991)
);
INSERT INTO company_profiles(id) VALUES(1);
CREATE TABLE print_jobs (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES sales_orders(id),
 order_revision_id uuid NOT NULL,
 template_version_id uuid NOT NULL REFERENCES print_template_versions(id),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','user_confirmed','user_cancelled','client_error')),
 operator_id uuid NOT NULL REFERENCES users(id),
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 client_platform text NOT NULL CHECK(client_platform IN ('desktop_web','mobile_web')),
 user_note varchar(1000) NOT NULL DEFAULT '',
 operation_id uuid NOT NULL UNIQUE REFERENCES business_operations(id),
 FOREIGN KEY(order_revision_id,order_id) REFERENCES order_revisions(id,order_id)
);
CREATE INDEX print_jobs_order_revision ON print_jobs(order_id,order_revision_id,requested_at DESC,id DESC);
CREATE TABLE print_job_status_events (
 id uuid PRIMARY KEY,job_id uuid NOT NULL REFERENCES print_jobs(id),
 old_status text NOT NULL,new_status text NOT NULL CHECK(new_status IN ('user_confirmed','user_cancelled','client_error')),
 note varchar(1000) NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),
 operation_id uuid NOT NULL UNIQUE REFERENCES business_operations(id),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER print_job_status_events_immutable BEFORE UPDATE OR DELETE ON print_job_status_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
