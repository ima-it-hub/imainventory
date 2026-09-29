const { query } = require('./db');

async function initializeDatabase() {
  const inventoryTable = `
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
  `;

  const employeesTable = `
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      employee_id VARCHAR(100) NOT NULL UNIQUE,
      name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;

  const auditTable = `
    CREATE TABLE IF NOT EXISTS audit_history (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL,
      employee_id VARCHAR(100),
      notes TEXT,
      expected_qty INTEGER NOT NULL,
      counted_qty INTEGER NOT NULL,
      delta_qty INTEGER NOT NULL,
      status VARCHAR(30) NOT NULL,
      warehouse_name VARCHAR(255) NOT NULL,
      direction VARCHAR(30),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;

  const physicalCountsTable = `
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
  `;

  const driversTable = `
    CREATE TABLE IF NOT EXISTS drivers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(100) NOT NULL UNIQUE,
      region VARCHAR(255) NOT NULL,
      vehicle VARCHAR(255) NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;

  const usersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      full_name VARCHAR(255),
      role VARCHAR(50) NOT NULL DEFAULT 'user',
      allowed_pages TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;

  const logisticsOrdersTable = `
    CREATE TABLE IF NOT EXISTS logistics_orders (
      id SERIAL PRIMARY KEY,
      order_number VARCHAR(100) NOT NULL UNIQUE,
      customer_name VARCHAR(255) NOT NULL,
      wilaya VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'Pending',
      employee_prepared VARCHAR(100),
      driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
      ready_at TIMESTAMP,
      delivered_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;

  const logisticsOrderPhysicalCountsTable = `
    CREATE TABLE IF NOT EXISTS logistics_order_physical_counts (
      order_number VARCHAR(100) PRIMARY KEY,
      physical_quantities JSONB NOT NULL DEFAULT '{}'::jsonb,
      control_quantities JSONB NOT NULL DEFAULT '{}'::jsonb,
      controller_employee_id VARCHAR(100),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const logisticsOrderDetailsTable = `
    CREATE TABLE IF NOT EXISTS logistics_order_details (
      order_number VARCHAR(100) PRIMARY KEY,
      details JSONB NOT NULL DEFAULT '[]'::jsonb,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const assetCategoriesTable = `
    CREATE TABLE IF NOT EXISTS asset_categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const assetPlacesTable = `
    CREATE TABLE IF NOT EXISTS asset_places (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const assetsTable = `
    CREATE TABLE IF NOT EXISTS assets (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category_id INTEGER NOT NULL REFERENCES asset_categories(id) ON DELETE RESTRICT,
      quantity NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
      place_id INTEGER NOT NULL REFERENCES asset_places(id) ON DELETE RESTRICT,
      purchase_value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (purchase_value >= 0),
      current_value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (current_value >= 0),
      repair_status VARCHAR(30) NOT NULL DEFAULT 'Réparable' CHECK (repair_status IN ('Réparable', 'Irréparable')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const sampleSeed = `
    INSERT INTO inventory_items (source_item_oid, sku, name, description, barcode, current_quantity, unit_price, warehouse_name)
    VALUES
      ('demo-1001', 'SKU-1001', 'Packing Tape Roll', 'Industrial tape for shipping', '9781001', 42, 8.75, 'Main warehouse'),
      ('demo-1002', 'SKU-1002', 'Safety Gloves', 'Large-size work gloves', '9781002', 18, 12.50, 'Main warehouse'),
      ('demo-1003', 'SKU-1003', 'Pallet Wrap', 'Stretch film - 500mm', '9781003', 31, 19.90, 'Main warehouse')
    ON CONFLICT (source_item_oid, warehouse_name) DO NOTHING;
  `;

  const sampleDrivers = `
    INSERT INTO drivers (name, phone, region, vehicle, notes)
    VALUES
      ('Samir Benali', '+213 555 0101', 'Algiers', 'Truck 12', 'Primary city deliveries'),
      ('Nadia Khelifi', '+213 555 0102', 'Oran', 'Van 04', 'Cold chain support'),
      ('Yacine Merabet', '+213 555 0103', 'Constantine', 'Truck 09', 'Weekend route coverage')
    ON CONFLICT (phone) DO NOTHING;
  `;

  const sampleUsers = `
    INSERT INTO users (username, password, full_name, role, allowed_pages)
    VALUES
      ('admin', '20199@Ima', 'System Administrator', 'admin', ARRAY['inventory', 'logistics', 'drivers', 'schedule']),
      ('warehouse', 'warehouse123', 'Warehouse Operator', 'user', ARRAY['inventory', 'logistics']),
      ('dispatch', 'dispatch123', 'Dispatch Agent', 'user', ARRAY['logistics', 'drivers', 'schedule'])
    ON CONFLICT (username) DO NOTHING;
  `;

  const sampleLogisticsOrders = `
    INSERT INTO logistics_orders (order_number, customer_name, wilaya, status, employee_prepared, created_at)
    VALUES
      ('ORD-1001', 'Northstar Retail', 'Algiers', 'Pending', 'E-204', '2026-09-19T08:30:00'),
      ('ORD-1002', 'Metro Supplies', 'Oran', 'Ready', 'E-118', '2026-09-19T10:15:00'),
      ('ORD-1003', 'Blue Horizon', 'Constantine', 'Packing', 'E-301', '2026-09-19T12:05:00'),
      ('ORD-1004', 'Al Atlas Group', 'Tlemcen', 'Delivered', 'E-407', '2026-09-19T14:40:00')
    ON CONFLICT (order_number) DO NOTHING;
  `;

  await query(inventoryTable);
  await query(employeesTable);
  await query('ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_source_item_oid_key;');
  await query('DROP INDEX IF EXISTS inventory_items_source_item_oid_key;');
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_source_warehouse
    ON inventory_items(source_item_oid, warehouse_name);
  `);
  await query(auditTable);
  await query(physicalCountsTable);
  await query(driversTable);
  await query(usersTable);
  await query(logisticsOrdersTable);
  await query('ALTER TABLE logistics_orders ADD COLUMN IF NOT EXISTS ready_at TIMESTAMP;');
  await query('ALTER TABLE logistics_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;');
  await query(logisticsOrderPhysicalCountsTable);
  await query(logisticsOrderDetailsTable);
  await query(assetCategoriesTable);
  await query(assetPlacesTable);
  await query(assetsTable);
  await query('ALTER TABLE assets ADD COLUMN IF NOT EXISTS current_value NUMERIC(14,2);');
  await query('UPDATE assets SET current_value = purchase_value WHERE current_value IS NULL;');
  await query('ALTER TABLE assets ALTER COLUMN current_value SET DEFAULT 0;');
  await query('ALTER TABLE assets ALTER COLUMN current_value SET NOT NULL;');
  await query(`
    ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS repair_status VARCHAR(30) NOT NULL DEFAULT 'Réparable';
  `);
  await query(`
    DO $$ BEGIN
      ALTER TABLE assets ADD CONSTRAINT assets_irreparable_value_check
      CHECK (repair_status <> 'Irréparable' OR current_value = 0);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_assets_category_id ON assets(category_id);');
  await query('CREATE INDEX IF NOT EXISTS idx_assets_place_id ON assets(place_id);');
  await query(`
    ALTER TABLE logistics_order_physical_counts
    ADD COLUMN IF NOT EXISTS control_quantities JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);
  await query(`
    ALTER TABLE logistics_order_physical_counts
    ADD COLUMN IF NOT EXISTS controller_employee_id VARCHAR(100);
  `);
  await query('ALTER TABLE logistics_orders ADD COLUMN IF NOT EXISTS driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL;');
  await query(sampleDrivers);
  await query(sampleUsers);
  await query(sampleLogisticsOrders);
  await query('ALTER TABLE audit_history ADD COLUMN IF NOT EXISTS warehouse_name VARCHAR(255);');
  await query('ALTER TABLE physical_counts ADD COLUMN IF NOT EXISTS warehouse_name VARCHAR(255);');
  await query(`
    UPDATE audit_history ah
    SET warehouse_name = TRIM(ii.warehouse_name)
    FROM inventory_items ii
    WHERE ah.item_id = ii.id AND ah.warehouse_name IS NULL;
  `);
  await query(`
    UPDATE physical_counts pc
    SET warehouse_name = TRIM(ii.warehouse_name)
    FROM inventory_items ii
    WHERE pc.item_id = ii.id AND pc.warehouse_name IS NULL;
  `);
  await query(sampleSeed);
}

module.exports = { initializeDatabase };
