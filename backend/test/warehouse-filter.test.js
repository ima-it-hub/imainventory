const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeWarehouseFilter, buildWarehouseFilterSql } = require('../src/services/odbc');

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
