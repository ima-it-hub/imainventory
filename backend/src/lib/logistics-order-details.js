function getOrderNumber(row) {
  return String(row.Reference || row.reference || row.Oid || row.oid || '').trim();
}

function buildOrderDetailSnapshots(rows) {
  const detailsByOrder = new Map();

  for (const row of rows || []) {
    const orderNumber = getOrderNumber(row);
    if (!orderNumber) continue;

    if (!detailsByOrder.has(orderNumber)) {
      detailsByOrder.set(orderNumber, []);
    }
    detailsByOrder.get(orderNumber).push(row);
  }

  return Array.from(detailsByOrder, ([orderNumber, details]) => ({ orderNumber, details }));
}

function attachSavedOrderQuantities(details, physicalQuantities = {}, controlQuantities = {}) {
  return details.map((detail) => {
    const detailKey = JSON.stringify([
      String(detail.Document ?? ''),
      String(detail.Batch ?? ''),
      String(detail.Label1 ?? ''),
      String(detail.Quantity ?? ''),
    ]);

    return {
      ...detail,
      detailKey,
      physicalQuantity: physicalQuantities[detailKey] ?? '',
      controlQuantity: controlQuantities[detailKey] ?? '',
    };
  });
}

function serializeOrderDetailSnapshots(snapshots) {
  return JSON.stringify(
    snapshots.map(({ orderNumber, details }) => ({ order_number: orderNumber, details })),
    (_key, value) => typeof value === 'bigint' ? value.toString() : value,
  );
}

module.exports = {
  buildOrderDetailSnapshots,
  attachSavedOrderQuantities,
  serializeOrderDetailSnapshots,
};