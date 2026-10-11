const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeWarehouseFilter,
  buildWarehouseFilterSql,
  buildTransferWarehouseFilterSql,
} = require('../src/services/odbc');

test('normalizeWarehouseFilter resolves numeric IDs and label values', () => {
  assert.deepEqual(normalizeWarehouseFilter('6'), { id: 6, name: null });
  assert.deepEqual(normalizeWarehouseFilter('BENZARGA CENTRAL'), { id: null, name: 'BENZARGA CENTRAL' });
  assert.deepEqual(normalizeWarehouseFilter('  6  '), { id: 6, name: null });
  assert.equal(normalizeWarehouseFilter(null), null);
});

test('buildWarehouseFilterSql avoids unjoined detail aliases in the order list query', async () => {
  const result = await buildWarehouseFilterSql('6', 'd');

  assert.equal(result.sql.includes('dd."Warehouse"'), false);
  assert.equal(result.sql.includes('d."WarehouseSource"'), true);
  assert.deepEqual(result.params, [6]);
});

test('buildTransferWarehouseFilterSql matches source or destination warehouse IDs', async () => {
  const result = await buildTransferWarehouseFilterSql('6');

  assert.match(result.sql, /"WarehouseSource" = \? OR d\."WarehouseDestination" = \?/);
  assert.deepEqual(result.params, [6, 6]);
});
