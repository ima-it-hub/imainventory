const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildOrderDetailSnapshots,
  attachSavedOrderQuantities,
  orderQuantitiesMatch,
  serializeOrderDetailSnapshots,
} = require('../src/lib/logistics-order-details');

test('buildOrderDetailSnapshots groups lines by reference and falls back to document OID', () => {
  const firstLine = { Reference: 'SO-100', Document: 'doc-1', Label1: 'Valve' };
  const secondLine = { Reference: 'SO-100', Document: 'doc-1', Label1: 'Pipe' };
  const thirdLine = { Oid: 'doc-2', Document: 'doc-2', Label1: 'Fitting' };

  assert.deepEqual(buildOrderDetailSnapshots([firstLine, secondLine, thirdLine, { Label1: 'Invalid' }]), [
    { orderNumber: 'SO-100', details: [firstLine, secondLine] },
    { orderNumber: 'doc-2', details: [thirdLine] },
  ]);
});

test('attachSavedOrderQuantities preserves the stable key and saved counts', () => {
  const detail = { Document: 'doc-1', Batch: 'batch-1', Label1: 'Valve', Quantity: 3 };
  const detailKey = JSON.stringify(['doc-1', 'batch-1', 'Valve', '3']);

  assert.deepEqual(attachSavedOrderQuantities([detail], { [detailKey]: 2 }, { [detailKey]: 3 }), [
    { ...detail, detailKey, physicalQuantity: 2, controlQuantity: 3 },
  ]);
});

test('orderQuantitiesMatch requires every system quantity to match a saved physical quantity', () => {
  const details = [
    { Document: 'doc-1', Batch: 'batch-1', Label1: 'Valve', Quantity: 3 },
    { Document: 'doc-1', Batch: 'batch-2', Label1: 'Pipe', Quantity: '2.5' },
  ];
  const matchingCounts = {
    [JSON.stringify(['doc-1', 'batch-1', 'Valve', '3'])]: '3.0',
    [JSON.stringify(['doc-1', 'batch-2', 'Pipe', '2.5'])]: 2.5,
  };

  assert.equal(orderQuantitiesMatch(details, matchingCounts), true);
  assert.equal(orderQuantitiesMatch(details, { ...matchingCounts, [JSON.stringify(['doc-1', 'batch-1', 'Valve', '3'])]: 2 }), false);
  assert.equal(orderQuantitiesMatch(details, null), false);
  assert.equal(orderQuantitiesMatch(details), false);
  assert.equal(orderQuantitiesMatch([]), false);
});

test('serializeOrderDetailSnapshots converts ODBC BigInt values to JSON strings', () => {
  const serialized = serializeOrderDetailSnapshots([
    { orderNumber: 'SO-100', details: [{ Batch: 42n }] },
  ]);

  assert.deepEqual(JSON.parse(serialized), [
    { order_number: 'SO-100', details: [{ Batch: '42' }] },
  ]);
});