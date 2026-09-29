const VALID_PAGES = ['inventory', 'logistics', 'drivers', 'schedule', 'qr-scan', 'assets'];

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

module.exports = {
  VALID_PAGES,
  ADMIN_CREDENTIALS,
  sanitizeAllowedPages,
  canAccessPage,
};
