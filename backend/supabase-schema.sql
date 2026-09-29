CREATE TABLE IF NOT EXISTS inventory_items (
  id SERIAL PRIMARY KEY,
  source_item_oid VARCHAR(255),
  sku VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  barcode VARCHAR(100),
  current_quantity INTEGER NOT NULL DEFAULT 0,
  unit_price NUMERIC(12,2) DEFAULT 0,
  warehouse_name VARCHAR(255),
  last_synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_history (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL,
  employee_id VARCHAR(100),
  notes TEXT,
  expected_qty INTEGER NOT NULL,
  counted_qty INTEGER NOT NULL,
  delta_qty INTEGER NOT NULL,
  status VARCHAR(30) NOT NULL,
  warehouse_name VARCHAR(255),
  direction VARCHAR(30),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS physical_counts (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  employee_id VARCHAR(100),
  notes TEXT,
  physical_quantity INTEGER NOT NULL,
  expected_quantity INTEGER NOT NULL,
  difference_quantity INTEGER NOT NULL,
  status VARCHAR(30) NOT NULL,
  warehouse_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logistics_orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(100) NOT NULL UNIQUE,
  customer_name VARCHAR(255) NOT NULL,
  wilaya VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Pending',
  employee_prepared VARCHAR(100),
  ready_at TIMESTAMP,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logistics_order_physical_counts (
  order_number VARCHAR(100) PRIMARY KEY,
  physical_quantities JSONB NOT NULL DEFAULT '{}'::jsonb,
  control_quantities JSONB NOT NULL DEFAULT '{}'::jsonb,
  controller_employee_id VARCHAR(100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_places (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assets (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category_id INTEGER NOT NULL REFERENCES asset_categories(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  place_id INTEGER NOT NULL REFERENCES asset_places(id) ON DELETE RESTRICT,
  purchase_value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (purchase_value >= 0),
  current_value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  repair_status VARCHAR(30) NOT NULL DEFAULT 'Réparable' CHECK (repair_status IN ('Réparable', 'Irréparable')),
  CONSTRAINT assets_irreparable_value_check CHECK (repair_status <> 'Irréparable' OR current_value = 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  allowed_pages TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items(name);
CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON employees(employee_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON inventory_items(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_items_barcode ON inventory_items(barcode);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_source_warehouse ON inventory_items(source_item_oid, warehouse_name);
CREATE INDEX IF NOT EXISTS idx_audit_history_item_id ON audit_history(item_id);
CREATE INDEX IF NOT EXISTS idx_physical_counts_item_id ON physical_counts(item_id);
CREATE INDEX IF NOT EXISTS idx_assets_category_id ON assets(category_id);
CREATE INDEX IF NOT EXISTS idx_assets_place_id ON assets(place_id);
