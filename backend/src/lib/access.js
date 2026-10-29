const VALID_PAGES = ['inventory', 'logistics', 'status-dashboard', 'team-tasks', 'transfer', 'demand-transfer', 'vente-ratee', 'drivers', 'schedule', 'qr-scan', 'assets'];

const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: '20199@Ima',
};

function sanitizeAllowedPages(value) {
  const list = Array.isArray(value) ? value : [];
  const unique = [];

  for (const page of list) {
    const normalized = String(page || '').trim();
    if (!normalized || !VALID_PAGES.includes(normalized)) {
      continue;
    }
    if (!unique.includes(normalized)) {
      unique.push(normalized);
    }
  }

  return unique;
}

function canAccessPage(page, allowedPages = []) {
  if (!page) return false;
  const normalizedPage = String(page).trim();
  if (!normalizedPage) return false;

  const allowed = sanitizeAllowedPages(allowedPages);
  return allowed.includes(normalizedPage);
}

function canViewTeamTask(user, task) {
  if (!user || !task) return false;
  return user.role === 'admin'
    || Number(user.id) === Number(task.assigneeUserId)
    || Number(user.id) === Number(task.createdByUserId);
}

function canCommentOnTeamTask(user, task) {
  if (!user || !task) return false;
  return user.role === 'admin'
    || Number(user.id) === Number(task.assigneeUserId)
    || Number(user.id) === Number(task.createdByUserId);
}

module.exports = {
  VALID_PAGES,
  ADMIN_CREDENTIALS,
  sanitizeAllowedPages,
  canAccessPage,
  canViewTeamTask,
  canCommentOnTeamTask,
};
