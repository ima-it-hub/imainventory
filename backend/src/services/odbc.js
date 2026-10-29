const config = require('../config');

let connectionPromise = null;
let odbcModule = null;

function getOdbcModule() {
  if (!odbcModule) {
    try {
      odbcModule = require('odbc');
    } catch (error) {
      throw new Error(`ODBC native module could not load: ${error.message}`, { cause: error });
    }
  }
  return odbcModule;
}

async function getConnection() {
  if (!connectionPromise) {
    connectionPromise = new Promise((resolve, reject) => {
      const connectionString = config.database.odbc.connectionString;
      if (typeof connectionString !== 'string' || !connectionString.trim()) {
        reject(new Error('ODBC_CONNECTION_STRING must be a non-empty string.'));
        return;
      }

      getOdbcModule().connect(connectionString, (err, conn) => {
        if (err) {
          reject(err);
          return;
        }

        if (!conn || typeof conn.query !== 'function') {
          reject(new Error('ODBC connection created without a valid query method.'));
          return;
        }

        resolve(conn);
      });
    });
  }

  return connectionPromise;
}

async function queryOdbc(sql, params = [], options = {}) {
  const connection = await getConnection();

  if (options.fetchSize) {
    const cursor = await connection.query(sql, params, {
      cursor: true,
      fetchSize: options.fetchSize,
    });
    const rows = [];

    try {
      while (!cursor.noData) {
        rows.push(...await cursor.fetch());
      }
      return rows;
    } finally {
      await cursor.close();
    }
  }

  return new Promise((resolve, reject) => {
    connection.query(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

function normalizeWarehouseFilter(warehouseFilter = null) {
  if (warehouseFilter === null || warehouseFilter === undefined) {
    return null;
  }

  const value = String(warehouseFilter).trim();
  if (!value) {
    return null;
  }

  if (/^\d+$/.test(value)) {
    return { id: Number(value), name: null };
  }

  return { id: null, name: value };
}

async function resolveWarehouseFilter(warehouseFilter = null) {
  const normalized = normalizeWarehouseFilter(warehouseFilter);
  if (!normalized) {
    return null;
  }

  if (normalized.id !== null) {
    return { ...normalized, value: Number(normalized.id) };
  }

  const rows = await queryOdbc(
    'SELECT "Oid" AS "WarehouseId" FROM "COM_Warehouse" WHERE "Label1" ILIKE ? ORDER BY "Oid" ASC LIMIT 20;',
    [`%${normalized.name}%`],
  );

  const ids = (rows || []).map((row) => Number(row?.WarehouseId ?? row?.warehouseid ?? row?.Oid ?? row?.oid)).filter(Number.isFinite);
  if (!ids.length) {
    return null;
  }

  return { id: ids[0], name: normalized.name, values: ids };
}

async function buildWarehouseFilterSql(warehouseFilter = null, sourceAlias = 'd', detailAlias = null) {
  const normalized = normalizeWarehouseFilter(warehouseFilter);
  if (!normalized) {
    return { sql: '', params: [] };
  }

  const hasDetailAlias = typeof detailAlias === 'string' && detailAlias.trim().length > 0;

  if (!hasDetailAlias || sourceAlias === detailAlias) {
    if (normalized.id !== null) {
      return {
        sql: `AND ${sourceAlias}."WarehouseSource" = ?`,
        params: [normalized.id],
      };
    }

    const resolved = await resolveWarehouseFilter(warehouseFilter);
    if (!resolved || !Array.isArray(resolved.values) || !resolved.values.length) {
      return { sql: 'AND 1 = 0', params: [] };
    }

    const ids = resolved.values;
    const placeholders = ids.map(() => '?').join(', ');
    return {
      sql: `AND ${sourceAlias}."WarehouseSource" IN (${placeholders})`,
      params: [...ids],
    };
  }

  if (normalized.id !== null) {
    return {
      sql: `AND ${sourceAlias}."WarehouseSource" = ? AND ${detailAlias}."Warehouse" = ?`,
      params: [normalized.id, normalized.id],
    };
  }

  const resolved = await resolveWarehouseFilter(warehouseFilter);
  if (!resolved || !Array.isArray(resolved.values) || !resolved.values.length) {
    return { sql: 'AND 1 = 0', params: [] };
  }

  const ids = resolved.values;
  const placeholders = ids.map(() => '?').join(', ');
  return {
    sql: `AND ${sourceAlias}."WarehouseSource" IN (${placeholders}) AND ${detailAlias}."Warehouse" IN (${placeholders})`,
    params: [...ids, ...ids],
  };
}

async function buildTransferWarehouseFilterSql(warehouseFilter = null) {
  const normalized = normalizeWarehouseFilter(warehouseFilter);
  if (!normalized) return { sql: '', params: [] };

  if (normalized.id !== null) {
    return {
      sql: 'AND (d."WarehouseSource" = ? OR d."WarehouseDestination" = ?)',
      params: [normalized.id, normalized.id],
    };
  }

  const resolved = await resolveWarehouseFilter(warehouseFilter);
  if (!resolved || !Array.isArray(resolved.values) || !resolved.values.length) {
    return { sql: 'AND 1 = 0', params: [] };
  }

  const ids = resolved.values;
  const placeholders = ids.map(() => '?').join(', ');
  return {
    sql: `AND (d."WarehouseSource" IN (${placeholders}) OR d."WarehouseDestination" IN (${placeholders}))`,
    params: [...ids, ...ids],
  };
}

async function getStockSnapshot(warehouseFilter = null) {
  const filters = [];
  const params = [];

  if (warehouseFilter && String(warehouseFilter).trim()) {
    filters.push('"COM_Warehouse"."Label1" ILIKE ?');
    params.push(`%${String(warehouseFilter).trim()}%`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const sql = `
    SELECT "COM_Item"."Oid" AS "OidItem",
      "COM_Item"."Label1" AS "Item",
      "COM_Batch"."Code" AS codelot,
      "COM_Batch"."BatchNum" AS numlot,
      "COM_Warehouse"."Oid" AS "Oiddepot",
      "COM_Warehouse"."Label1" AS "Depot",
      "COM_ItemFamily"."Oid" AS "Oidfamily",
      "COM_ItemFamily"."Label1" AS famille,
      "COM_ItemCategory1"."Oid" AS "Oidcategory",
      "COM_ItemCategory1"."Label1" AS category,
      "COM_Brand"."Oid" AS "Oidmarque",
      "COM_Brand"."Label1" AS "Marque",
      "COM_Batch"."VWAP" AS "PMP",
      sum("COM_BatchWarehouse"."LogicalQuantity") AS "Quantitedepot",
      sum("COM_BatchWarehouse"."LogicalQuantity" * "COM_Item"."VWAP"::double precision) AS "ValeurPMP"
    FROM "COM_Batch"
      JOIN "COM_Item" ON "COM_Batch"."Item" = "COM_Item"."Oid"
      JOIN "COM_BatchWarehouse" ON "COM_BatchWarehouse"."Batch" = "COM_Batch"."Oid"
      JOIN "COM_Warehouse" ON "COM_Warehouse"."Oid" = "COM_BatchWarehouse"."Warehouse"
      LEFT JOIN "COM_ItemFamily" ON "COM_Item"."Family" = "COM_ItemFamily"."Oid"
      LEFT JOIN "COM_ItemCategory1" ON "COM_Item"."Category1" = "COM_ItemCategory1"."Oid"
      LEFT JOIN "COM_Brand" ON "COM_Item"."Brand" = "COM_Brand"."Oid"
    ${whereClause}
    GROUP BY "COM_Item"."Oid", "COM_Item"."Label1", "COM_Batch"."Code", "COM_Batch"."BatchNum", "COM_Warehouse"."Oid", "COM_Warehouse"."Label1", "COM_Batch"."VWAP", "COM_ItemFamily"."Oid", "COM_ItemFamily"."Label1", "COM_ItemCategory1"."Oid", "COM_ItemCategory1"."Label1", "COM_Brand"."Oid", "COM_Brand"."Label1";`;

  return queryOdbc(sql, params);
}

async function getLogisticsOrdersFromOdbc(warehouseFilter = null) {
  const warehouseCondition = await buildWarehouseFilterSql(warehouseFilter, 'd');
  const sql = `
    SELECT
      "d"."Oid",
      "d"."Date",
      "d"."Reference",
      "t"."Label1",
      "t"."Tel1",
      "t"."Tel2",
      "d"."WarehouseSource" AS "WarehouseSource",
      "cw"."Label1" AS "WarehouseName",
      "w"."Label1" AS "Wilaya"
    FROM "COM_Document" AS "d"
    INNER JOIN "COM_ThirdParty" AS "t" ON "d"."ThirdParty" = "t"."Oid"
    LEFT JOIN "COM_Warehouse" AS "cw" ON "d"."WarehouseSource" = "cw"."Oid"
    LEFT JOIN "STD_Department" AS "w" ON "t"."Department" = "w"."Oid"
    WHERE "d"."Type" IN (4, 4)
      AND "d"."DeleteDate" IS NULL
      AND ("d"."DocumentCategory4" != 9)
      ${warehouseCondition.sql || ''}
      AND "d"."Date" >= '2026-01-01';
  `;

  return queryOdbc(sql, warehouseCondition.params);
}

async function getLogisticsOrderDetailsFromOdbc(identifier) {
  return queryOdbc(getLogisticsOrderDetailsSql(`AND (d."Oid"::text = ? OR d."Reference" = ?)`, false, [], 4), [
    String(identifier),
    String(identifier),
  ]);
}

async function getTransferSyncRowsFromOdbc(warehouseFilter = null) {
  const warehouseCondition = await buildTransferWarehouseFilterSql(warehouseFilter);
  const sql = `
    SELECT
      "d"."Oid" AS "id",
      "d"."Date" AS "date",
      "d"."Reference" AS "reference",
      "d"."Reference" AS "Reference",
      "d"."WarehouseSource" AS "warehouseSource",
      "source_wh"."Label1" AS "warehouseSourceName",
      "d"."WarehouseDestination" AS "warehouseDestination",
      "destination_wh"."Label1" AS "warehouseDestinationName",
      "t"."Label1" AS "customerName",
      "d"."DocumentCategory4" AS "documentCategory4",
      "dd"."Batch" AS "Batch",
      "dd"."Label1" AS "Label1",
      "dd"."Quantity" AS "Quantity",
      "dd"."Document" AS "Document",
      "b"."Item" AS "Item",
      "p"."Coefficient" AS "Colisage",
      "p"."Label1" AS "PackingLabel",
      "p"."Code" AS "PackingCode"
    FROM "COM_Document" AS "d"
    LEFT JOIN "COM_DocumentDetail" AS "dd" ON "d"."Oid" = "dd"."Document"
    LEFT JOIN "COM_Warehouse" AS "source_wh" ON "d"."WarehouseSource" = "source_wh"."Oid"
    LEFT JOIN "COM_Warehouse" AS "destination_wh" ON "d"."WarehouseDestination" = "destination_wh"."Oid"
    LEFT JOIN "COM_ThirdParty" AS "t" ON "d"."ThirdParty" = "t"."Oid"
    LEFT JOIN "COM_Batch" AS "b" ON "b"."Oid" = "dd"."Batch"
    LEFT JOIN "COM_Item" AS "i" ON "i"."Oid" = "b"."Item"
    LEFT JOIN "COM_Packing" AS "p" ON "p"."Oid" = "i"."DefaultPacking"
    WHERE "d"."Type" = 67
      AND "d"."DeleteDate" IS NULL
      AND ("d"."DocumentCategory4" != 9)
      ${warehouseCondition.sql || ''}
      AND "d"."Date" >= '2026-01-01'
  `;

  return queryOdbc(sql, warehouseCondition.params, { fetchSize: 1000 });
}

async function getLogisticsOrderDetailsForSyncFromOdbc(warehouseFilter = null) {
  const warehouseCondition = await buildWarehouseFilterSql(warehouseFilter, 'd', 'dd');
  const sql = getLogisticsOrderDetailsSql(`
    AND (d."DocumentCategory4" != 9)
    ${warehouseCondition.sql || ''}
    AND d."Date" >= '2026-01-01'
  `, true, warehouseCondition.params);

  return queryOdbc(sql, warehouseCondition.params, { fetchSize: 100 });
}

function getLogisticsOrderDetailsSql(additionalFilters, syncFieldsOnly = false, warehouseParams = [], documentType = 4) {
  const packingJoins = `
    LEFT JOIN "COM_Batch" AS b ON b."Oid" = dd."Batch"
    LEFT JOIN "COM_Item" AS i ON i."Oid" = b."Item"
    LEFT JOIN "COM_Packing" AS p ON p."Oid" = i."DefaultPacking"
  `;
  const packingColumns = `
      b."Item" AS "Item",
      p."Coefficient" AS "Colisage",
      p."Label1" AS "PackingLabel",
      p."Code" AS "PackingCode"`;

  const selectedColumns = syncFieldsOnly
    ? `d."Oid", d."Reference", dd."Batch", dd."Label1", dd."Quantity", dd."Document",${packingColumns}`
    : `
      d."Oid",
      d."Reference",
      dd."Batch",
      dd."Label1",
      dd."Quantity",
      dd."UnitPriceATI",
      dd."AmountATI",
      dd."Document",
      dd."Warehouse",
      dd."VWAP",
      ${packingColumns},
      d."Date",
      d."Type",
      d."DeleteDate",
      d."DiscountPercent",
      dd."AmountATI" - (dd."AmountATI" * (d."DiscountPercent" / 100)) AS "ttt",
      CASE
        WHEN d."Type" = 4 THEN dd."AmountATI" - (dd."AmountATI" * (d."DiscountPercent" / 100))
        WHEN d."Type" = 12 THEN (dd."AmountATI" - (dd."AmountATI" * (d."DiscountPercent" / 100))) * -1
      END AS "MontantD",
      (CASE
        WHEN d."Type" = 4 THEN dd."VWAP"
        WHEN d."Type" = 12 THEN dd."VWAP" * -1
      END) * dd."Quantity" AS "PMP",
      (CASE
        WHEN d."Type" = 4 THEN dd."AmountATI" - (dd."AmountATI" * (d."DiscountPercent" / 100))
        WHEN d."Type" = 12 THEN (dd."AmountATI" - (dd."AmountATI" * (d."DiscountPercent" / 100))) * -1
      END) - ((CASE
        WHEN d."Type" = 4 THEN dd."VWAP"
        WHEN d."Type" = 12 THEN dd."VWAP" * -1
      END) * dd."Quantity") AS "Marg",
      d."ThirdParty"`;

  return `
    SELECT ${selectedColumns}
    FROM "COM_Document" AS d
    INNER JOIN "COM_DocumentDetail" AS dd ON d."Oid" = dd."Document"
    ${packingJoins}
    WHERE d."Type" IN (${documentType}, ${documentType})
      AND d."DeleteDate" IS NULL
      ${additionalFilters};
  `;
}

module.exports = {
  queryOdbc,
  getStockSnapshot,
  normalizeWarehouseFilter,
  resolveWarehouseFilter,
  buildWarehouseFilterSql,
  buildTransferWarehouseFilterSql,
  getLogisticsOrdersFromOdbc,
  getTransferSyncRowsFromOdbc,
  getLogisticsOrderDetailsFromOdbc,
  getLogisticsOrderDetailsForSyncFromOdbc,
  getConnection,
};
