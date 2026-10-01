const { Pool } = require('pg');
const config = require('../config');
const { getStockSnapshot } = require('./odbc');

const SYNC_BATCH_SIZE = 500;

const pool = new Pool({
  connectionString: config.database.postgres.connectionString,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 15000,
  connectionTimeoutMillis: 15000,
});

pool.on('error', (error) => {
  console.error('Unexpected idle PostgreSQL connection error:', error.message);
});

async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

function normalizeOdbcItem(row) {
  const sourceId = row?.OidItem ?? row?.oiditem ?? row?.id ?? null;
  const name = row?.Item ?? row?.item ?? 'Unknown item';
  const sku = row?.Code ?? row?.code ?? String(sourceId || 'ITEM');
  const barcode = row?.codelot ?? row?.barcode ?? String(sourceId || 'ITEM');
  const quantity = Number(row?.Quantitedepot ?? row?.quantity ?? row?.system_qty ?? 0);
  const warehouseName = String(row?.Depot ?? row?.depot ?? 'Main').trim();

  const unitPrice = Number(row?.PMP ?? row?.price ?? 0);

  return {
    source_item_oid: String(sourceId ?? 'unknown'),
    sku: String(sku),
    name: String(name),
    description: `${name} synced from ODBC`,
    barcode: String(barcode),
    current_quantity: Number.isFinite(quantity) ? quantity : 0,
    unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
    warehouse_name: warehouseName || 'Main',
  };
}

async function syncOdbcToSupabase(warehouseFilter = null) {
  const rows = await getStockSnapshot(warehouseFilter);
  const itemsByKey = new Map();

  for (const row of rows || []) {
    const item = normalizeOdbcItem(row);
    itemsByKey.set(JSON.stringify([item.source_item_oid, item.warehouse_name]), item);
  }

  const items = Array.from(itemsByKey.values());
  const sql = `
    INSERT INTO inventory_items (
      source_item_oid, sku, name, description, barcode, current_quantity, unit_price, warehouse_name, last_synced_at
    )
    SELECT source_item_oid, sku, name, description, barcode, current_quantity, unit_price, warehouse_name, NOW()
    FROM jsonb_to_recordset($1::jsonb) AS incoming(
      source_item_oid TEXT,
      sku TEXT,
      name TEXT,
      description TEXT,
      barcode TEXT,
      current_quantity INTEGER,
      unit_price NUMERIC,
      warehouse_name TEXT
    )
    ON CONFLICT (source_item_oid, warehouse_name)
    DO UPDATE SET
      sku = EXCLUDED.sku,
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      barcode = EXCLUDED.barcode,
      current_quantity = EXCLUDED.current_quantity,
      unit_price = EXCLUDED.unit_price,
      warehouse_name = EXCLUDED.warehouse_name,
      last_synced_at = NOW();
  `;

  for (let offset = 0; offset < items.length; offset += SYNC_BATCH_SIZE) {
    const batch = items.slice(offset, offset + SYNC_BATCH_SIZE);
    await query(sql, [JSON.stringify(batch)]);
  }

  return (rows || []).length;
}

async function getItemBySearch(queryText, warehouseName = null, mismatchOnly = false) {
  const q = `%${String(queryText).trim()}%`;
  const params = [q];
  let warehouseClause = '';
  const mismatchClause = mismatchOnly
    ? `AND i.current_quantity <> COALESCE((
        SELECT pc.physical_quantity
        FROM physical_counts pc
        WHERE pc.item_id = i.id AND TRIM(pc.warehouse_name) = TRIM(i.warehouse_name)
        ORDER BY pc.created_at DESC
        LIMIT 1
      ), 0)`
    : '';

  if (warehouseName && String(warehouseName).trim()) {
    const trimmedWarehouse = String(warehouseName).trim();
    warehouseClause = 'AND TRIM(warehouse_name) = $2';
    params.push(trimmedWarehouse);
  }

  const sql = `
    SELECT
      i.id,
      i.source_item_oid,
      i.sku,
      i.name,
      i.description,
      i.barcode,
      i.current_quantity AS system_qty,
      i.unit_price,
      i.warehouse_name,
      COALESCE((
        SELECT COUNT(*)
        FROM physical_counts pc
        WHERE pc.item_id = i.id AND TRIM(pc.warehouse_name) = TRIM(i.warehouse_name)
      ), 0) AS counted_times,
      COALESCE((
        SELECT pc.physical_quantity
        FROM physical_counts pc
        WHERE pc.item_id = i.id AND TRIM(pc.warehouse_name) = TRIM(i.warehouse_name)
        ORDER BY pc.created_at DESC
        LIMIT 1
      ), 0) AS last_counted_qty,
      COALESCE((
        SELECT pc.difference_quantity
        FROM physical_counts pc
        WHERE pc.item_id = i.id AND TRIM(pc.warehouse_name) = TRIM(i.warehouse_name)
        ORDER BY pc.created_at DESC
        LIMIT 1
      ), 0) AS last_delta_qty,
      COALESCE((
        SELECT pc.employee_id
        FROM physical_counts pc
        WHERE pc.item_id = i.id AND TRIM(pc.warehouse_name) = TRIM(i.warehouse_name)
        ORDER BY pc.created_at DESC
        LIMIT 1
      ), '') AS last_counted_employee
    FROM inventory_items i
    WHERE (
      i.sku ILIKE $1
      OR i.barcode ILIKE $1
      OR i.name ILIKE $1
      OR i.source_item_oid::text ILIKE $1
    )
    ${warehouseClause}
      ${mismatchClause}
    ORDER BY i.name ASC
    LIMIT 30;
  `;

  return query(sql, params);
}

async function getItemById(itemId) {
  const sql = `
    SELECT
      id,
      source_item_oid,
      sku,
      name,
      description,
      barcode,
      current_quantity AS system_qty,
      unit_price,
      warehouse_name
    FROM inventory_items
    WHERE id = $1;
  `;

  return query(sql, [itemId]);
}

async function getSystemQuantityForItem(itemId) {
  const rows = await getItemById(itemId);
  return rows.length ? Number(rows[0].system_qty) : 0;
}

module.exports = {
  pool,
  query,
  syncOdbcToSupabase,
  getItemBySearch,
  getItemById,
  getSystemQuantityForItem,
};
