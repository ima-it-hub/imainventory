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
      getOdbcModule().connect(config.database.odbc.connectionString, (err, conn) => {
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

async function queryOdbc(sql, params = []) {
  const connection = await getConnection();

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

async function getLogisticsOrdersFromOdbc() {
  const sql = `
    SELECT
      "d"."Oid",
      "d"."Date",
      "d"."ThirdParty",
      "d"."Payment",
      "d"."DeleteDate",
      "d"."Reference",
      "d"."WarehouseSource",
      "d"."Amount",
      "d"."AmountATI",
      "d"."Commercial",
      "d"."Type",
      "t"."Family",
      "t"."Department",
      "t"."AssociatedAgent",
      "t"."Label1",
      "w"."Label1" AS "Wilaya"
    FROM "COM_Document" AS "d"
    INNER JOIN "COM_ThirdParty" AS "t" ON "d"."ThirdParty" = "t"."Oid"
    LEFT JOIN "STD_Department" AS "w" ON "t"."Department" = "w"."Oid"
    WHERE "d"."Type" IN (4, 4)
      AND "d"."DeleteDate" IS NULL
      AND ("d"."DocumentCategory4" != 9 OR "d"."DocumentCategory4" IS NULL)
      AND "d"."WarehouseSource" IN (6, 6)
      AND "d"."Date" >= '2026-01-01'
      AND EXISTS (
        SELECT 1
        FROM "COM_DocumentDetail" AS "dd"
        WHERE "dd"."Document" = "d"."Oid"
          AND "dd"."Warehouse" = 6
      );
  `;

  return queryOdbc(sql);
}

async function getLogisticsOrderDetailsFromOdbc(identifier) {
  const sql = `
    SELECT
      d."Oid",
      dd."Batch",
      dd."Label1",
      dd."Quantity",
      dd."UnitPriceATI",
      dd."AmountATI",
      dd."Document",
      dd."Warehouse",
      dd."VWAP",
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
      d."ThirdParty"
    FROM "COM_Document" AS d
    INNER JOIN "COM_DocumentDetail" AS dd ON d."Oid" = dd."Document"
    WHERE d."Type" IN (4, 4)
      AND d."DeleteDate" IS NULL
      AND dd."Warehouse" = 6
      AND (d."Oid"::text = ? OR d."Reference" = ?);
  `;

  return queryOdbc(sql, [String(identifier), String(identifier)]);
}

module.exports = {
  queryOdbc,
  getStockSnapshot,
  getLogisticsOrdersFromOdbc,
  getLogisticsOrderDetailsFromOdbc,
  getConnection,
};
