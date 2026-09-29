const test = require('node:test');
const assert = require('node:assert/strict');
const { computeReconciliation } = require('../src/lib/reconciliation');

test('computeReconciliation returns MATCH when values align', () => {
  const result = computeReconciliation({
    item_id: 101,
    physical_qty: 42,
    system_qty: 42,
    employee_id: 'E-100',
    notes: 'Count checked twice',
  });

  assert.equal(result.status, 'MATCH');
  assert.equal(result.delta, 0);
  assert.equal(result.label, 'Matched');
});

test('computeReconciliation returns DISCREPANCY with shortage status', () => {
  const result = computeReconciliation({
    item_id: 101,
    physical_qty: 30,
    system_qty: 42,
    employee_id: 'E-100',
    notes: 'Shortage found',
  });

  assert.equal(result.status, 'DISCREPANCY');
  assert.equal(result.delta, -12);
  assert.equal(result.direction, 'SHORTAGE');
});
