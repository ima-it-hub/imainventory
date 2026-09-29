function computeReconciliation({ item_id, physical_qty, system_qty, employee_id, notes }) {
  const counted = Number(physical_qty);
  const expected = Number(system_qty);
  const delta = counted - expected;

  if (delta === 0) {
    return {
      item_id,
      employee_id,
      notes,
      expected,
      counted,
      delta,
      status: 'MATCH',
      direction: 'MATCH',
      label: 'Matched',
      message: 'Inventory count matches the system stock level.',
    };
  }

  const direction = delta > 0 ? 'OVERSTOCK' : 'SHORTAGE';

  return {
    item_id,
    employee_id,
    notes,
    expected,
    counted,
    delta,
    status: 'DISCREPANCY',
    direction,
    label: direction === 'OVERSTOCK' ? 'Overstock' : 'Shortage',
    message:
      direction === 'OVERSTOCK'
        ? 'Physical stock exceeds the ERP quantity.'
        : 'Physical stock is below the ERP quantity.',
  };
}

module.exports = {
  computeReconciliation,
};
