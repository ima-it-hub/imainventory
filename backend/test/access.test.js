const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeAllowedPages, canAccessPage, ADMIN_CREDENTIALS } = require('../src/lib/access');

test('sanitizeAllowedPages keeps only valid sidebar pages', () => {
  const result = sanitizeAllowedPages(['inventory', 'drivers', 'unknown', 'logistics', 'inventory']);
  assert.deepEqual(result, ['inventory', 'drivers', 'logistics']);
});

test('admin credentials are available for the required login', () => {
  assert.equal(ADMIN_CREDENTIALS.username, 'admin');
  assert.equal(ADMIN_CREDENTIALS.password, '20199@Ima');
});

test('permission helper blocks pages not granted to the user', () => {
  assert.equal(canAccessPage('schedule', ['inventory', 'logistics']), false);
  assert.equal(canAccessPage('drivers', ['inventory', 'drivers']), true);
});
