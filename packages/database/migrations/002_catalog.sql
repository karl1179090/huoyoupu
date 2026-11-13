CREATE TABLE products (
  id uuid PRIMARY KEY,
  code varchar(64) NOT NULL CHECK (length(btrim(code)) > 0),
  normalized_code varchar(64) GENERATED ALWAYS AS (lower(btrim(code))) STORED UNIQUE,
  name varchar(200) NOT NULL CHECK (length(btrim(name)) > 0),
  specification varchar(200) NOT NULL DEFAULT '',
  brand varchar(100) NOT NULL DEFAULT '',
  generated_mnemonic varchar(200) NOT NULL,
  mnemonic_override varchar(200),
  effective_mnemonic varchar(200) NOT NULL,
  base_unit_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_units (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id) DEFERRABLE INITIALLY DEFERRED,
  name varchar(30) NOT NULL CHECK (length(btrim(name)) > 0),
  multiplier_base bigint NOT NULL CHECK (multiplier_base BETWEEN 1 AND 9007199254740991),
  default_sale_price numeric(20,6) NOT NULL CHECK (default_sale_price >= 0),
  default_receipt_cost numeric(20,6) CHECK (default_receipt_cost >= 0),
  active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, product_id),
  UNIQUE (product_id, name)
);
ALTER TABLE products ADD CONSTRAINT products_base_unit_fk
  FOREIGN KEY (base_unit_id, id) REFERENCES product_units(id, product_id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION catalog_validate_base_unit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_product_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'products' THEN target_product_id := NEW.id;
  ELSE target_product_id := NEW.product_id; END IF;
  IF EXISTS (SELECT 1 FROM products p JOIN product_units u ON u.id = p.base_unit_id
             WHERE p.id = target_product_id
             AND u.multiplier_base <> 1) THEN
    RAISE EXCEPTION 'Base unit multiplier must be one' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER products_base_unit_multiplier AFTER INSERT OR UPDATE ON products
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog_validate_base_unit();
CREATE CONSTRAINT TRIGGER units_base_unit_multiplier AFTER INSERT OR UPDATE ON product_units
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog_validate_base_unit();
CREATE TABLE product_barcodes (
  barcode_value varchar(100) PRIMARY KEY CHECK (length(btrim(barcode_value)) > 0),
  product_id uuid NOT NULL REFERENCES products(id),
  unit_id uuid NOT NULL,
  FOREIGN KEY (unit_id, product_id) REFERENCES product_units(id, product_id)
);
CREATE TABLE customers (
  id uuid PRIMARY KEY,
  code varchar(64) NOT NULL CHECK (length(btrim(code)) > 0),
  name varchar(200) NOT NULL CHECK (length(btrim(name)) > 0),
  contact_name varchar(80) NOT NULL DEFAULT '',
  phone varchar(40) NOT NULL DEFAULT '',
  notes varchar(1000) NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customers_normalized_code ON customers(lower(btrim(code)));
CREATE TABLE customer_addresses (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id),
  label varchar(80) NOT NULL DEFAULT '',
  contact_name varchar(80) NOT NULL CHECK (length(btrim(contact_name)) > 0),
  phone varchar(40) NOT NULL DEFAULT '',
  address varchar(500) NOT NULL CHECK (length(btrim(address)) > 0),
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, customer_id)
);
CREATE UNIQUE INDEX customer_addresses_one_default ON customer_addresses(customer_id) WHERE active AND is_default;
CREATE TABLE customer_price_rules (
  customer_id uuid NOT NULL REFERENCES customers(id),
  product_id uuid NOT NULL REFERENCES products(id),
  unit_id uuid NOT NULL,
  unit_price numeric(20,6) NOT NULL CHECK (unit_price >= 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, product_id, unit_id),
  FOREIGN KEY (unit_id, product_id) REFERENCES product_units(id, product_id)
);
CREATE TABLE warehouses (
  id uuid PRIMARY KEY,
  code varchar(64) NOT NULL CHECK (length(btrim(code)) > 0),
  name varchar(100) NOT NULL CHECK (length(btrim(name)) > 0),
  active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX warehouses_normalized_code ON warehouses(lower(btrim(code)));
CREATE INDEX products_effective_mnemonic ON products(effective_mnemonic);
CREATE INDEX product_barcodes_product ON product_barcodes(product_id);
CREATE INDEX customer_addresses_customer ON customer_addresses(customer_id, id);
CREATE INDEX customer_price_rules_customer ON customer_price_rules(customer_id, product_id, unit_id);

CREATE VIEW catalog_units AS SELECT u.id, u.product_id,
  jsonb_build_object('id', u.id, 'productId', u.product_id, 'name', u.name,
    'multiplierBase', u.multiplier_base, 'defaultSalePrice', u.default_sale_price::text,
    'defaultReceiptCost', u.default_receipt_cost::text, 'active', u.active, 'version', u.version) AS data
FROM product_units u;
CREATE VIEW catalog_products AS SELECT p.id,
  jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'specification', p.specification,
    'brand', p.brand, 'generatedMnemonicCode', p.generated_mnemonic,
    'mnemonicCodeOverride', p.mnemonic_override, 'mnemonicCode', p.effective_mnemonic,
    'baseUnitId', p.base_unit_id, 'active', p.active, 'version', p.version,
    'units', COALESCE((SELECT jsonb_agg(u.data ORDER BY u.id) FROM catalog_units u WHERE u.product_id=p.id), '[]'::jsonb),
    'barcodes', COALESCE((SELECT jsonb_agg(jsonb_build_object('value', b.barcode_value, 'unitId', b.unit_id) ORDER BY b.barcode_value)
      FROM product_barcodes b WHERE b.product_id=p.id), '[]'::jsonb)) AS data
FROM products p;
CREATE VIEW catalog_addresses AS SELECT a.id, a.customer_id,
  jsonb_build_object('id', a.id, 'customerId', a.customer_id, 'label', a.label, 'contactName', a.contact_name,
    'phone', a.phone, 'address', a.address, 'isDefault', a.is_default, 'active', a.active, 'version', a.version) AS data
FROM customer_addresses a;
CREATE VIEW catalog_customers AS SELECT c.id,
  jsonb_build_object('id', c.id, 'code', c.code, 'name', c.name, 'contactName', c.contact_name, 'phone', c.phone,
    'notes', c.notes, 'active', c.active, 'version', c.version,
    'addresses', COALESCE((SELECT jsonb_agg(a.data ORDER BY a.id) FROM catalog_addresses a WHERE a.customer_id=c.id), '[]'::jsonb)) AS data
FROM customers c;
CREATE VIEW catalog_warehouses AS SELECT w.id,
  jsonb_build_object('id', w.id, 'code', w.code, 'name', w.name, 'active', w.active, 'version', w.version) AS data
FROM warehouses w;
CREATE VIEW catalog_price_rules AS SELECT r.customer_id, r.product_id, r.unit_id,
  jsonb_build_object('customerId', r.customer_id, 'productId', r.product_id, 'unitId', r.unit_id,
    'unitPrice', r.unit_price::text, 'version', r.version) AS data
FROM customer_price_rules r;
