const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizeAllowedPages,
  canAccessPage,
  canViewTeamTask,
  canCommentOnTeamTask,
  ADMIN_CREDENTIALS,
} = require('../src/lib/access');

test('sanitizeAllowedPages keeps only valid sidebar pages', () => {
  const result = sanitizeAllowedPages(['inventory', 'drivers', 'unknown', 'logistics', 'status-dashboard', 'team-tasks', 'transfer', 'inventory']);
  assert.deepEqual(result, ['inventory', 'drivers', 'logistics', 'status-dashboard', 'team-tasks', 'transfer']);
});

test('admin credentials are available for the required login', () => {
  assert.equal(ADMIN_CREDENTIALS.username, 'admin');
  assert.equal(ADMIN_CREDENTIALS.password, '20199@Ima');
});

test('permission helper blocks pages not granted to the user', () => {
  assert.equal(canAccessPage('schedule', ['inventory', 'logistics']), false);
  assert.equal(canAccessPage('transfer', ['inventory', 'transfer']), true);
  assert.equal(canAccessPage('status-dashboard', ['inventory', 'status-dashboard']), true);
  assert.equal(canAccessPage('team-tasks', ['inventory', 'team-tasks']), true);
  assert.equal(canAccessPage('drivers', ['inventory', 'drivers']), true);
});

test('task visibility allows assignees, creators, and admins only', () => {
  const task = { assigneeUserId: 12, createdByUserId: 34 };

  assert.equal(canViewTeamTask({ id: 12, role: 'user' }, task), true);
  assert.equal(canViewTeamTask({ id: 34, role: 'user' }, task), true);
  assert.equal(canViewTeamTask({ id: 56, role: 'admin' }, task), true);
  assert.equal(canViewTeamTask({ id: 56, role: 'user' }, task), false);
});

test('assignees, creators, and admins can comment on a task', () => {
  const task = { assigneeUserId: 12, createdByUserId: 34 };

  assert.equal(canCommentOnTeamTask({ id: 12, role: 'user' }, task), true);
  assert.equal(canCommentOnTeamTask({ id: 34, role: 'user' }, task), true);
  assert.equal(canCommentOnTeamTask({ id: 56, role: 'admin' }, task), true);
  assert.equal(canCommentOnTeamTask({ id: 78, role: 'user' }, task), false);
});
