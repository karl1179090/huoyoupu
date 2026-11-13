CREATE TABLE sales_orders (
 id uuid PRIMARY KEY, order_no varchar(64) NOT NULL UNIQUE,
 status text NOT NULL CHECK(status IN ('draft','confirmed','voided')),
 customer_id uuid NOT NULL REFERENCES customers(id), current_revision_id uuid NOT NULL,
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 confirmed_at timestamptz, delivery_status text NOT NULL DEFAULT 'not_delivered' CHECK(delivery_status IN ('not_delivered','delivered')),
 delivered_at timestamptz, void_reason varchar(1000), void_operation_id uuid REFERENCES business_operations(id), created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(status='draft' OR confirmed_at IS NOT NULL)
);
CREATE TABLE order_lines (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES sales_orders(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,order_id)
);
CREATE TABLE order_revisions (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES sales_orders(id), revision_no bigint NOT NULL CHECK(revision_no BETWEEN 1 AND 9007199254740991),
 customer_id uuid NOT NULL REFERENCES customers(id), address_id uuid, customer_snapshot jsonb NOT NULL, address_snapshot jsonb NOT NULL,
 subtotal_amount numeric(20,2) NOT NULL CHECK(subtotal_amount>=0), discount_amount numeric(20,2) NOT NULL CHECK(discount_amount>=0),
 round_off_amount numeric(20,2) NOT NULL CHECK(round_off_amount>=0), total_amount numeric(20,2) NOT NULL CHECK(total_amount>=0),
 cost_amount numeric(20,2) NOT NULL CHECK(cost_amount>=0), gross_profit numeric(20,2) NOT NULL,
 remark varchar(1000) NOT NULL DEFAULT '', change_reason varchar(1000) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by uuid NOT NULL REFERENCES users(id), operation_id uuid NOT NULL REFERENCES business_operations(id),
 FOREIGN KEY(address_id,customer_id) REFERENCES customer_addresses(id,customer_id),
 UNIQUE(order_id,revision_no), UNIQUE(id,order_id),
 CHECK(total_amount=subtotal_amount-discount_amount-round_off_amount), CHECK(gross_profit=total_amount-cost_amount)
);
ALTER TABLE sales_orders ADD CONSTRAINT sales_order_current_revision_fk FOREIGN KEY(current_revision_id,id) REFERENCES order_revisions(id,order_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE revision_lines (
 id uuid PRIMARY KEY, revision_id uuid NOT NULL REFERENCES order_revisions(id), line_id uuid NOT NULL REFERENCES order_lines(id),
 position integer NOT NULL CHECK(position>=0), kind text NOT NULL CHECK(kind IN ('normal','derived','return_history')),
 product_id uuid NOT NULL REFERENCES products(id), warehouse_id uuid NOT NULL REFERENCES warehouses(id), unit_id uuid NOT NULL,
 input_quantity bigint CHECK(input_quantity BETWEEN 0 AND 9007199254740991),
 quantity_base bigint NOT NULL CHECK(quantity_base BETWEEN 0 AND 9007199254740991), multiplier_snapshot bigint NOT NULL CHECK(multiplier_snapshot BETWEEN 1 AND 9007199254740991),
 unit_price numeric(20,6) NOT NULL CHECK(unit_price>=0),
 subtotal_amount numeric(20,2) NOT NULL CHECK(subtotal_amount>=0), discount_allocated numeric(20,2) NOT NULL CHECK(discount_allocated>=0),
 net_amount numeric(20,2) NOT NULL CHECK(net_amount>=0), cost_amount numeric(20,2) NOT NULL CHECK(cost_amount>=0), gross_profit numeric(20,2) NOT NULL,
 snapshot jsonb NOT NULL, allocation_input jsonb NOT NULL,
 returned_quantity_base bigint NOT NULL DEFAULT 0 CHECK(returned_quantity_base BETWEEN 0 AND 9007199254740991),
 returned_net_amount numeric(20,2) NOT NULL DEFAULT 0 CHECK(returned_net_amount>=0),
 returned_subtotal_amount numeric(20,2) NOT NULL DEFAULT 0 CHECK(returned_subtotal_amount>=0),
 returned_discount_amount numeric(20,2) NOT NULL DEFAULT 0 CHECK(returned_discount_amount>=0),
 returned_cost_amount numeric(20,2) NOT NULL DEFAULT 0 CHECK(returned_cost_amount>=0),
 FOREIGN KEY(unit_id,product_id) REFERENCES product_units(id,product_id),
 UNIQUE(revision_id,line_id), UNIQUE(revision_id,position),
 CHECK(net_amount=subtotal_amount-discount_allocated), CHECK(gross_profit=net_amount-cost_amount),
 CHECK(returned_quantity_base<=quantity_base AND returned_net_amount<=net_amount AND returned_subtotal_amount<=subtotal_amount AND returned_discount_amount<=discount_allocated AND returned_cost_amount<=cost_amount)
);
CREATE TABLE sale_allocations (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES sales_orders(id), line_id uuid NOT NULL,
 batch_id uuid NOT NULL REFERENCES inventory_batches(id), issue_sequence bigint NOT NULL CHECK(issue_sequence BETWEEN 1 AND 9007199254740991),
 created_revision_id uuid NOT NULL REFERENCES order_revisions(id) DEFERRABLE INITIALLY DEFERRED,
 issued_quantity_base bigint NOT NULL CHECK(issued_quantity_base BETWEEN 1 AND 9007199254740991), issued_cost_amount numeric(20,2) NOT NULL CHECK(issued_cost_amount>=0),
 released_quantity_base bigint NOT NULL DEFAULT 0, released_cost_amount numeric(20,2) NOT NULL DEFAULT 0,
 returned_quantity_base bigint NOT NULL DEFAULT 0, return_credit_cost_amount numeric(20,2) NOT NULL DEFAULT 0,
 restocked_quantity_base bigint NOT NULL DEFAULT 0, restocked_cost_amount numeric(20,2) NOT NULL DEFAULT 0,
 void_restored_quantity_base bigint NOT NULL DEFAULT 0, void_restored_cost_amount numeric(20,2) NOT NULL DEFAULT 0,
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 FOREIGN KEY(line_id,order_id) REFERENCES order_lines(id,order_id),
 CHECK(released_quantity_base>=0 AND returned_quantity_base>=0 AND restocked_quantity_base>=0 AND void_restored_quantity_base>=0),
 CHECK(released_cost_amount>=0 AND return_credit_cost_amount>=0 AND restocked_cost_amount>=0 AND void_restored_cost_amount>=0),
 CHECK(released_quantity_base+returned_quantity_base<=issued_quantity_base),
 CHECK(released_cost_amount+return_credit_cost_amount<=issued_cost_amount),
 CHECK(restocked_quantity_base<=returned_quantity_base AND restocked_cost_amount<=return_credit_cost_amount),
 CHECK(released_quantity_base+restocked_quantity_base+void_restored_quantity_base<=issued_quantity_base),
 CHECK(released_cost_amount+restocked_cost_amount+void_restored_cost_amount<=issued_cost_amount)
);
CREATE TABLE revision_allocation_links (
 revision_line_id uuid NOT NULL REFERENCES revision_lines(id), sale_allocation_id uuid NOT NULL REFERENCES sale_allocations(id),
 quantity_base bigint NOT NULL CHECK(quantity_base BETWEEN 0 AND 9007199254740991), cost_amount numeric(20,2) NOT NULL CHECK(cost_amount>=0),
 PRIMARY KEY(revision_line_id,sale_allocation_id)
);
CREATE TABLE sale_release_lines (
 id uuid PRIMARY KEY, operation_id uuid NOT NULL REFERENCES business_operations(id),
 revision_id uuid NOT NULL REFERENCES order_revisions(id) DEFERRABLE INITIALLY DEFERRED,
 sale_allocation_id uuid NOT NULL REFERENCES sale_allocations(id),
 quantity_base bigint NOT NULL CHECK(quantity_base BETWEEN 1 AND 9007199254740991), cost_amount numeric(20,2) NOT NULL CHECK(cost_amount>=0),
 UNIQUE(revision_id,sale_allocation_id)
);
CREATE TABLE sales_returns (
 id uuid PRIMARY KEY, return_no varchar(64) NOT NULL UNIQUE, order_id uuid NOT NULL REFERENCES sales_orders(id),
 source_revision_id uuid NOT NULL, customer_id_at_confirmation uuid NOT NULL REFERENCES customers(id), customer_name_at_confirmation varchar(200) NOT NULL,
 confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(), recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason varchar(1000) NOT NULL, status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','absorbed_by_void')), absorbed_operation_id uuid REFERENCES business_operations(id),
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991), operation_id uuid NOT NULL REFERENCES business_operations(id),
 FOREIGN KEY(source_revision_id,order_id) REFERENCES order_revisions(id,order_id)
);
CREATE TABLE return_lines (
 id uuid PRIMARY KEY, return_id uuid NOT NULL REFERENCES sales_returns(id), order_line_id uuid NOT NULL REFERENCES order_lines(id),
 source_revision_line_id uuid NOT NULL REFERENCES revision_lines(id), quantity_base bigint NOT NULL CHECK(quantity_base BETWEEN 1 AND 9007199254740991),
 return_amount numeric(20,2) NOT NULL CHECK(return_amount>=0), subtotal_credit_amount numeric(20,2) NOT NULL CHECK(subtotal_credit_amount>=0),
 discount_credit_amount numeric(20,2) NOT NULL CHECK(discount_credit_amount>=0), cost_credit_amount numeric(20,2) NOT NULL CHECK(cost_credit_amount>=0),
 restock_disposition text NOT NULL CHECK(restock_disposition IN ('pending','not_returning')),
 restocked_quantity_base bigint NOT NULL DEFAULT 0 CHECK(restocked_quantity_base>=0 AND restocked_quantity_base<=quantity_base),
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991), UNIQUE(return_id,order_line_id),
 CHECK(return_amount=subtotal_credit_amount-discount_credit_amount)
);
CREATE TABLE return_allocations (
 id uuid PRIMARY KEY, return_line_id uuid NOT NULL REFERENCES return_lines(id), sale_allocation_id uuid NOT NULL REFERENCES sale_allocations(id),
 quantity_base bigint NOT NULL CHECK(quantity_base BETWEEN 1 AND 9007199254740991), return_amount numeric(20,2) NOT NULL CHECK(return_amount>=0),
 cost_credit_amount numeric(20,2) NOT NULL CHECK(cost_credit_amount>=0),
 restocked_quantity_base bigint NOT NULL DEFAULT 0 CHECK(restocked_quantity_base>=0 AND restocked_quantity_base<=quantity_base),
 restocked_cost_amount numeric(20,2) NOT NULL DEFAULT 0 CHECK(restocked_cost_amount>=0 AND restocked_cost_amount<=cost_credit_amount),
 UNIQUE(return_line_id,sale_allocation_id)
);
CREATE TABLE restock_events (
 id uuid PRIMARY KEY, return_id uuid NOT NULL REFERENCES sales_returns(id), restocked_at timestamptz NOT NULL, reason varchar(1000) NOT NULL DEFAULT '',
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), operator_id uuid NOT NULL REFERENCES users(id), operation_id uuid NOT NULL REFERENCES business_operations(id)
);
CREATE TABLE restock_lines (
 id uuid PRIMARY KEY, restock_event_id uuid NOT NULL REFERENCES restock_events(id), return_allocation_id uuid NOT NULL REFERENCES return_allocations(id),
 quantity_base bigint NOT NULL CHECK(quantity_base BETWEEN 1 AND 9007199254740991), cost_amount numeric(20,2) NOT NULL CHECK(cost_amount>=0),
 UNIQUE(restock_event_id,return_allocation_id)
);
CREATE INDEX sales_orders_confirmed ON sales_orders(confirmed_at,id);
CREATE INDEX sales_orders_customer ON sales_orders(customer_id,confirmed_at,id);
CREATE INDEX revision_lines_history ON revision_lines(product_id,unit_id,revision_id,position);
CREATE INDEX sale_allocations_order ON sale_allocations(order_id,line_id,issue_sequence);
CREATE INDEX return_allocations_source ON return_allocations(sale_allocation_id);
CREATE INDEX sales_returns_order ON sales_returns(order_id,confirmed_at,id);
CREATE TRIGGER order_revisions_immutable BEFORE UPDATE OR DELETE ON order_revisions FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE FUNCTION protect_revision_line_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Revision content is immutable'; END IF;
 IF (to_jsonb(NEW)-ARRAY['returned_quantity_base','returned_net_amount','returned_subtotal_amount','returned_discount_amount','returned_cost_amount']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['returned_quantity_base','returned_net_amount','returned_subtotal_amount','returned_discount_amount','returned_cost_amount']) THEN
  RAISE EXCEPTION 'Revision content is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER revision_lines_content_immutable BEFORE UPDATE OR DELETE ON revision_lines FOR EACH ROW EXECUTE FUNCTION protect_revision_line_content();
CREATE TRIGGER revision_allocation_links_immutable BEFORE UPDATE OR DELETE ON revision_allocation_links FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER sale_release_lines_immutable BEFORE UPDATE OR DELETE ON sale_release_lines FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER restock_events_immutable BEFORE UPDATE OR DELETE ON restock_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER restock_lines_immutable BEFORE UPDATE OR DELETE ON restock_lines FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
