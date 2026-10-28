const express = require('express');
const cors = require('cors');
const crypto = require('node:crypto');
const {
  query,
  getItemBySearch,
  getItemById,
  getSystemQuantityForItem,
  syncOdbcToSupabase,
} = require('./src/services/db');
const {
  getStockSnapshot,
  getLogisticsOrdersFromOdbc,
  getTransferSyncRowsFromOdbc,
  getLogisticsOrderDetailsForSyncFromOdbc,
  normalizeWarehouseFilter,
} = require('./src/services/odbc');
const { computeReconciliation } = require('./src/lib/reconciliation');
const {
  buildOrderDetailSnapshots,
  attachSavedOrderQuantities,
  orderQuantitiesMatch,
  serializeOrderDetailSnapshots,
} = require('./src/lib/logistics-order-details');
const { initializeDatabase } = require('./src/services/init-db');
const {
  ADMIN_CREDENTIALS,
  sanitizeAllowedPages,
  VALID_PAGES,
  canViewTeamTask,
  canCommentOnTeamTask,
} = require('./src/lib/access');
const config = require('./src/config');

const app = express();
// app.use(cors({
//   origin(origin, callback) {
//     const isRenderFrontend = /^https:\/\/[a-z0-9-]+\.onrender\.com$/i.test(origin || '');
//     callback(null, !origin || origin === config.app.corsOrigin || isRenderFrontend);
//   },
//   credentials: true,
// }));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

function normalizeJsonValue(value) {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJsonValue(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeJsonValue(nestedValue)]),
    );
  }

  return value;
}

async function getTaskSessionUser(req) {
  const token = String(req.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;

  const rows = await query(`
    SELECT users.id, users.role, users.allowed_pages AS "allowedPages"
    FROM app_sessions sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.session_token = $1 AND sessions.expires_at > NOW()
    LIMIT 1;
  `, [token]);
  return rows[0] || null;
}

function canUseTeamTasks(user) {
  return user?.role === 'admin' || (Array.isArray(user?.allowedPages) && user.allowedPages.includes('team-tasks'));
}

async function getTeamTaskForViewer(taskId, viewer) {
  const rows = await query(`
    SELECT id, assignee_user_id AS "assigneeUserId", created_by_user_id AS "createdByUserId"
    FROM team_tasks WHERE id = $1 LIMIT 1;
  `, [taskId]);
  if (!rows.length) return { error: 'Task not found.', status: 404 };

  const task = rows[0];
  const isAssignee = Number(task.assigneeUserId) === Number(viewer.id);
  if (!canViewTeamTask(viewer, task)) {
    return { error: 'You do not have access to this task.', status: 403 };
  }

  return { task, isAssignee };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'inventory-reconciliation-api', timestamp: new Date().toISOString() });
});

app.get('/api/items', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const warehouse = String(req.query.warehouse || '').trim();
    const mismatchOnly = String(req.query.mismatchOnly || '') === 'true';

    if (!q && !warehouse) {
      const rows = await query('SELECT * FROM inventory_items ORDER BY name ASC LIMIT 50;');
      return res.json({ items: rows, count: rows.length, warehouse: warehouse || null, query: q || '' });
    }

    const items = await getItemBySearch(q || '', warehouse || null, mismatchOnly);
    res.json({ items, count: items.length, warehouse: warehouse || null, query: q || '' });
  } catch (error) {
    console.error('Items fetch error:', error);
    res.status(500).json({ error: 'Unable to fetch inventory items', details: error.message });
  }
});

app.get('/api/items/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const warehouse = String(req.query.warehouse || '').trim();
    const mismatchOnly = String(req.query.mismatchOnly || '') === 'true';

    if (!q && !warehouse) {
      const rows = await query('SELECT * FROM inventory_items ORDER BY name ASC LIMIT 50;');
      return res.json({ items: rows, count: rows.length, query: q, warehouse });
    }

    const items = await getItemBySearch(q || '', warehouse || null, mismatchOnly);
    res.json({ items, count: items.length, query: q, warehouse });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Unable to search inventory items', details: error.message });
  }
});

app.get('/api/items/:id', async (req, res) => {
  try {
    const itemId = Number(req.params.id);
    const rows = await query('SELECT * FROM inventory_items WHERE id = $1', [itemId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Get item error:', error);
    res.status(500).json({ error: 'Unable to fetch item details', details: error.message });
  }
});

app.get('/api/odbc/stock', async (req, res) => {
  try {
    const data = await getStockSnapshot();
    res.json({ count: data.length, rows: data });
  } catch (error) {
    console.error('ODBC fetch error:', error);
    res.status(500).json({ error: 'Unable to read ODBC stock snapshot', details: error.message });
  }
});

app.get('/api/warehouses', async (req, res) => {
  try {
    const rows = await query('SELECT DISTINCT TRIM(warehouse_name) AS warehouse_name FROM inventory_items WHERE warehouse_name IS NOT NULL ORDER BY TRIM(warehouse_name) ASC;');
    const warehouses = rows.map((row) => row.warehouse_name).filter(Boolean);
    res.json({ warehouses, count: warehouses.length });
  } catch (error) {
    console.error('Warehouses fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch warehouses', details: error.message });
  }
});

app.get('/api/asset-categories', async (_req, res) => {
  try {
    const categories = await query('SELECT id, name FROM asset_categories ORDER BY name ASC;');
    res.json({ categories, count: categories.length });
  } catch (error) {
    console.error('Asset categories fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch asset categories', details: error.message });
  }
});

app.post('/api/asset-categories', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required.' });
    const rows = await query(
      'INSERT INTO asset_categories (name) VALUES ($1) RETURNING id, name;',
      [name],
    );
    res.status(201).json({ category: rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'That category already exists.' });
    console.error('Asset category creation failed:', error);
    res.status(500).json({ error: 'Unable to create asset category', details: error.message });
  }
});

app.delete('/api/asset-categories/:id', async (req, res) => {
  try {
    const rows = await query('DELETE FROM asset_categories WHERE id = $1 RETURNING id;', [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Category not found.' });
    res.json({ ok: true });
  } catch (error) {
    if (error.code === '23503') return res.status(409).json({ error: 'Move or delete assets in this category before deleting it.' });
    console.error('Asset category deletion failed:', error);
    res.status(500).json({ error: 'Unable to delete asset category', details: error.message });
  }
});

app.get('/api/asset-places', async (_req, res) => {
  try {
    const places = await query(`
      SELECT p.id, p.name, COUNT(a.id)::integer AS "assetCount"
      FROM asset_places p
      LEFT JOIN assets a ON a.place_id = p.id
      GROUP BY p.id
      ORDER BY p.name ASC;
    `);
    res.json({ places, count: places.length });
  } catch (error) {
    console.error('Asset places fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch asset places', details: error.message });
  }
});

app.post('/api/asset-places', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Place name is required.' });
    const rows = await query('INSERT INTO asset_places (name) VALUES ($1) RETURNING id, name;', [name]);
    res.status(201).json({ place: rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'That place already exists.' });
    console.error('Asset place creation failed:', error);
    res.status(500).json({ error: 'Unable to create asset place', details: error.message });
  }
});

app.delete('/api/asset-places/:id', async (req, res) => {
  try {
    const rows = await query('DELETE FROM asset_places WHERE id = $1 RETURNING id;', [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Place not found.' });
    res.json({ ok: true });
  } catch (error) {
    if (error.code === '23503') return res.status(409).json({ error: 'Move or delete assets at this place before deleting it.' });
    console.error('Asset place deletion failed:', error);
    res.status(500).json({ error: 'Unable to delete asset place', details: error.message });
  }
});

app.get('/api/assets', async (_req, res) => {
  try {
    const assets = await query(`
      SELECT
        asset.id,
        asset.name,
        asset.category_id AS "categoryId",
        category.name AS "categoryName",
        asset.quantity,
        asset.place_id AS "placeId",
        place.name AS "placeName",
        asset.purchase_value AS "purchaseValue",
        asset.current_value AS "currentValue",
        asset.repair_status AS "repairStatus"
      FROM assets AS asset
      INNER JOIN asset_categories AS category ON category.id = asset.category_id
      INNER JOIN asset_places AS place ON place.id = asset.place_id
      ORDER BY asset.name ASC, asset.id ASC;
    `);
    res.json({ assets, count: assets.length });
  } catch (error) {
    console.error('Assets fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch assets', details: error.message });
  }
});

app.post('/api/assets', async (req, res) => {
  try {
    const { name, categoryId, quantity, placeId, purchaseValue, currentValue, repairStatus } = req.body || {};
    const cleanName = String(name || '').trim();
    const numericQuantity = Number(quantity);
    const numericPurchaseValue = Number(purchaseValue);
    const numericCurrentValue = currentValue === undefined || currentValue === ''
      ? numericPurchaseValue
      : Number(currentValue);
    const numericCategoryId = Number(categoryId);
    const numericPlaceId = Number(placeId);
    const normalizedRepairStatus = repairStatus || 'Réparable';
    const savedCurrentValue = normalizedRepairStatus === 'Irréparable' ? 0 : numericCurrentValue;

    if (!cleanName || !Number.isInteger(numericCategoryId) || numericCategoryId <= 0
      || !Number.isInteger(numericPlaceId) || numericPlaceId <= 0
      || !Number.isFinite(numericQuantity) || numericQuantity < 0
      || !Number.isFinite(numericPurchaseValue) || numericPurchaseValue < 0
      || !Number.isFinite(numericCurrentValue) || numericCurrentValue < 0
      || !['Réparable', 'Irréparable', 'Sent to maintenance'].includes(normalizedRepairStatus)) {
      return res.status(400).json({ error: 'Enter a name, category, place, and valid non-negative quantity and values.' });
    }

    const rows = await query(`
      INSERT INTO assets (name, category_id, quantity, place_id, purchase_value, current_value, repair_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, category_id AS "categoryId", quantity, place_id AS "placeId", purchase_value AS "purchaseValue", current_value AS "currentValue", repair_status AS "repairStatus";
    `, [cleanName, numericCategoryId, numericQuantity, numericPlaceId, numericPurchaseValue, savedCurrentValue, normalizedRepairStatus]);
    res.status(201).json({ asset: rows[0] });
  } catch (error) {
    if (error.code === '23503') return res.status(400).json({ error: 'Select an existing category and place.' });
    console.error('Asset creation failed:', error);
    res.status(500).json({ error: 'Unable to create asset', details: error.message });
  }
});

app.put('/api/assets/:id', async (req, res) => {
  try {
    const { name, categoryId, quantity, placeId, purchaseValue, currentValue, repairStatus } = req.body || {};
    const cleanName = String(name || '').trim();
    const numericQuantity = Number(quantity);
    const numericPurchaseValue = Number(purchaseValue);
    const numericCurrentValue = currentValue === undefined || currentValue === ''
      ? numericPurchaseValue
      : Number(currentValue);
    const numericCategoryId = Number(categoryId);
    const numericPlaceId = Number(placeId);
    const normalizedRepairStatus = repairStatus || 'Réparable';
    const savedCurrentValue = normalizedRepairStatus === 'Irréparable' ? 0 : numericCurrentValue;

    if (!cleanName || !Number.isInteger(numericCategoryId) || numericCategoryId <= 0
      || !Number.isInteger(numericPlaceId) || numericPlaceId <= 0
      || !Number.isFinite(numericQuantity) || numericQuantity < 0
      || !Number.isFinite(numericPurchaseValue) || numericPurchaseValue < 0
      || !Number.isFinite(numericCurrentValue) || numericCurrentValue < 0
      || !['Réparable', 'Irréparable', 'Sent to maintenance'].includes(normalizedRepairStatus)) {
      return res.status(400).json({ error: 'Enter a name, category, place, and valid non-negative quantity and values.' });
    }

    const rows = await query(`
      UPDATE assets
      SET name = $1, category_id = $2, quantity = $3, place_id = $4,
          purchase_value = $5, current_value = $6, repair_status = $7, updated_at = NOW()
      WHERE id = $8
      RETURNING id, name, category_id AS "categoryId", quantity, place_id AS "placeId", purchase_value AS "purchaseValue", current_value AS "currentValue", repair_status AS "repairStatus";
    `, [cleanName, numericCategoryId, numericQuantity, numericPlaceId, numericPurchaseValue, savedCurrentValue, normalizedRepairStatus, Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Asset not found.' });
    res.json({ asset: rows[0] });
  } catch (error) {
    if (error.code === '23503') return res.status(400).json({ error: 'Select an existing category and place.' });
    console.error('Asset update failed:', error);
    res.status(500).json({ error: 'Unable to update asset', details: error.message });
  }
});

app.patch('/api/assets/:id/repair-status', async (req, res) => {
  try {
    const repairStatus = String(req.body?.repairStatus || '').trim();
    if (!['Réparable', 'Irréparable', 'Sent to maintenance'].includes(repairStatus)) {
      return res.status(400).json({ error: 'Choose a valid asset repair status.' });
    }

    const isNotRepairable = repairStatus === 'Irréparable';
    const rows = await query(`
      UPDATE assets
      SET repair_status = $1,
          current_value = ${isNotRepairable ? '0' : 'current_value'},
          updated_at = NOW()
      WHERE id = $2
      RETURNING id, repair_status AS "repairStatus", current_value AS "currentValue";
    `, [repairStatus, Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Asset not found.' });
    res.json({ asset: rows[0] });
  } catch (error) {
    console.error('Asset repair status update failed:', error);
    res.status(500).json({ error: 'Unable to update repair status', details: error.message });
  }
});

app.patch('/api/assets/:id/current-value', async (req, res) => {
  try {
    const currentValue = Number(req.body?.currentValue);
    if (!Number.isFinite(currentValue) || currentValue < 0) {
      return res.status(400).json({ error: 'Current value must be a non-negative number.' });
    }

    const rows = await query(`
      UPDATE assets
        SET current_value = CASE WHEN repair_status = 'Irréparable' THEN 0 ELSE $1 END,
          updated_at = NOW()
      WHERE id = $2
        RETURNING id, current_value AS "currentValue", repair_status AS "repairStatus";
    `, [currentValue, Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Asset not found.' });
    res.json({ asset: rows[0] });
  } catch (error) {
    console.error('Asset current value update failed:', error);
    res.status(500).json({ error: 'Unable to update current value', details: error.message });
  }
});

app.delete('/api/assets/:id', async (req, res) => {
  try {
    const rows = await query('DELETE FROM assets WHERE id = $1 RETURNING id;', [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Asset not found.' });
    res.json({ ok: true });
  } catch (error) {
    console.error('Asset deletion failed:', error);
    res.status(500).json({ error: 'Unable to delete asset', details: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const normalizedUsername = String(username || '').trim();
    const normalizedPassword = String(password || '').trim();

    if (!normalizedUsername || !normalizedPassword) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const rows = await query(
      'SELECT id, username, password, full_name, role, allowed_pages, working_warehouse FROM users WHERE username = $1 LIMIT 1;',
      [normalizedUsername],
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const user = rows[0];
    const isAdminLogin = normalizedUsername === ADMIN_CREDENTIALS.username && normalizedPassword === ADMIN_CREDENTIALS.password;
    const matchesPassword = normalizedPassword === user.password;

    if (!isAdminLogin && !matchesPassword) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const safeUser = {
      id: user.id,
      username: user.username,
      fullName: user.full_name || user.username,
      role: user.role || 'user',
      allowedPages: Array.isArray(user.allowed_pages) ? sanitizeAllowedPages(user.allowed_pages) : [],
      workingWarehouse: String(user.working_warehouse || '').trim(),
    };
    const sessionToken = crypto.randomBytes(32).toString('hex');
    await query(`
      INSERT INTO app_sessions (session_token, user_id, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '30 days');
    `, [sessionToken, user.id]);
    safeUser.sessionToken = sessionToken;

    res.json({ user: safeUser, message: 'Login successful.' });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Unable to authenticate user', details: error.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const rows = await query('SELECT id, username, full_name, role, allowed_pages, working_warehouse FROM users ORDER BY username ASC;');
    const users = rows.map((user) => ({
      id: user.id,
      username: user.username,
      fullName: user.full_name || user.username,
      role: user.role || 'user',
      allowedPages: Array.isArray(user.allowed_pages) ? sanitizeAllowedPages(user.allowed_pages) : [],
      workingWarehouse: String(user.working_warehouse || '').trim(),
    }));

    res.json({ users, count: users.length });
  } catch (error) {
    console.error('Users fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch users', details: error.message });
  }
});

app.delete('/api/auth/session', async (req, res) => {
  try {
    const token = String(req.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (token) await query('DELETE FROM app_sessions WHERE session_token = $1;', [token]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Session revocation failed:', error);
    res.status(500).json({ error: 'Unable to revoke session', details: error.message });
  }
});

app.get('/api/team-tasks', async (req, res) => {
  try {
    const viewer = await getTaskSessionUser(req);
    if (!viewer) return res.status(401).json({ error: 'Sign in to access team tasks.' });
    if (!canUseTeamTasks(viewer)) return res.status(403).json({ error: 'You do not have access to team tasks.' });
    const visibilityClause = viewer.role === 'admin'
      ? ''
      : 'WHERE task.assignee_user_id = $1 OR task.created_by_user_id = $1';
    const params = [viewer.id];
    const tasks = await query(`
      SELECT
        task.id,
        task.title,
        task.description,
        task.status,
        task.assignee_user_id AS "assigneeUserId",
        COALESCE(assignee.full_name, assignee.username) AS "assigneeName",
        task.created_by_user_id AS "createdByUserId",
        COALESCE(creator.full_name, creator.username, 'Unknown user') AS "createdByName",
        EXISTS (
          SELECT 1
          FROM team_task_comments unread_comment
          LEFT JOIN team_task_reads task_read
            ON task_read.task_id = task.id AND task_read.user_id = $1
          WHERE unread_comment.task_id = task.id
            AND unread_comment.author_user_id IS DISTINCT FROM $1
            AND unread_comment.created_at > COALESCE(task_read.last_viewed_at, '-infinity'::timestamptz)
        ) AS "hasUnreadComments",
        task.created_at AS "createdAt",
        task.updated_at AS "updatedAt"
      FROM team_tasks task
      LEFT JOIN users assignee ON assignee.id = task.assignee_user_id
      LEFT JOIN users creator ON creator.id = task.created_by_user_id
      ${visibilityClause}
      ORDER BY task.updated_at DESC, task.id DESC;
    `, params);

    res.json({ tasks, count: tasks.length });
  } catch (error) {
    console.error('Team tasks fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch team tasks', details: error.message });
  }
});

app.get('/api/team-tasks/summary', async (req, res) => {
  try {
    const viewer = await getTaskSessionUser(req);
    if (!viewer) return res.status(401).json({ error: 'Sign in to view team task counts.' });
    if (!canUseTeamTasks(viewer)) return res.status(403).json({ error: 'You do not have access to team tasks.' });

    const assigneeClause = viewer.role === 'admin' ? '' : 'AND assignee_user_id = $1';
    const rows = await query(`
      SELECT COUNT(*)::integer AS "todoCount"
      FROM team_tasks
      WHERE status = 'todo' ${assigneeClause};
    `, viewer.role === 'admin' ? [] : [viewer.id]);
    res.json({ todoCount: rows[0]?.todoCount || 0 });
  } catch (error) {
    console.error('Team task summary fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch team task summary', details: error.message });
  }
});

app.post('/api/team-tasks', async (req, res) => {
  try {
    const viewer = await getTaskSessionUser(req);
    if (!viewer) return res.status(401).json({ error: 'Sign in to create team tasks.' });
    if (!canUseTeamTasks(viewer)) return res.status(403).json({ error: 'You do not have access to team tasks.' });

    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const assigneeUserId = Number(req.body?.assigneeUserId);
    const createdByUserId = Number(viewer.id);

    if (!title || title.length > 255) {
      return res.status(400).json({ error: 'Enter a task title of at most 255 characters.' });
    }
    if (!Number.isInteger(assigneeUserId) || assigneeUserId <= 0) {
      return res.status(400).json({ error: 'Choose a valid assignee.' });
    }

    const users = await query('SELECT id FROM users WHERE id = ANY($1::integer[]);', [[assigneeUserId, createdByUserId]]);
    if (!users.some((user) => Number(user.id) === assigneeUserId)
      || !users.some((user) => Number(user.id) === createdByUserId)) {
      return res.status(400).json({ error: 'The creator or assignee account was not found.' });
    }

    const inserted = await query(`
      INSERT INTO team_tasks (title, description, assignee_user_id, created_by_user_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `, [title, description, assigneeUserId, createdByUserId]);
    const rows = await query(`
      SELECT
        task.id, task.title, task.description, task.status,
        task.assignee_user_id AS "assigneeUserId",
        COALESCE(assignee.full_name, assignee.username) AS "assigneeName",
        task.created_by_user_id AS "createdByUserId",
        COALESCE(creator.full_name, creator.username, 'Unknown user') AS "createdByName",
        task.created_at AS "createdAt", task.updated_at AS "updatedAt"
      FROM team_tasks task
      LEFT JOIN users assignee ON assignee.id = task.assignee_user_id
      LEFT JOIN users creator ON creator.id = task.created_by_user_id
      WHERE task.id = $1;
    `, [inserted[0].id]);

    res.status(201).json({ task: rows[0] });
  } catch (error) {
    console.error('Team task creation failed:', error);
    res.status(500).json({ error: 'Unable to create team task', details: error.message });
  }
});

app.patch('/api/team-tasks/:id/status', async (req, res) => {
  try {
    const viewer = await getTaskSessionUser(req);
    if (!viewer) return res.status(401).json({ error: 'Sign in to update team tasks.' });
    if (!canUseTeamTasks(viewer)) return res.status(403).json({ error: 'You do not have access to team tasks.' });

    const taskId = Number(req.params.id);
    const status = String(req.body?.status || '').trim();
    const validStatuses = ['todo', 'in_progress', 'done'];

    if (!Number.isInteger(taskId) || taskId <= 0
      || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Provide a valid task and status.' });
    }

    const taskRows = await query('SELECT id, assignee_user_id FROM team_tasks WHERE id = $1 LIMIT 1;', [taskId]);
    if (!taskRows.length) return res.status(404).json({ error: 'Task not found.' });
    if (viewer.role !== 'admin' && Number(taskRows[0].assignee_user_id) !== Number(viewer.id)) {
      return res.status(403).json({ error: 'Only the assignee or an admin can change this task status.' });
    }

    const updatedRows = await query(`
      UPDATE team_tasks
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, title, description, status,
        assignee_user_id AS "assigneeUserId",
        created_by_user_id AS "createdByUserId",
        created_at AS "createdAt", updated_at AS "updatedAt";
    `, [status, taskId]);
    res.json({ task: updatedRows[0] });
  } catch (error) {
    console.error('Team task status update failed:', error);
    res.status(500).json({ error: 'Unable to update team task status', details: error.message });
  }
});

app.get('/api/team-tasks/:id/comments', async (req, res) => {
  try {
    const viewer = await getTaskSessionUser(req);
    if (!viewer) return res.status(401).json({ error: 'Sign in to access task comments.' });
    if (!canUseTeamTasks(viewer)) return res.status(403).json({ error: 'You do not have access to team tasks.' });

    const taskId = Number(req.params.id);
    if (!Number.isInteger(taskId) || taskId <= 0) return res.status(400).json({ error: 'Invalid task ID.' });
    const access = await getTeamTaskForViewer(taskId, viewer);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const comments = await query(`
      SELECT
        comment.id,
        comment.comment,
        comment.author_user_id AS "authorUserId",
        COALESCE(author.full_name, author.username, 'Former user') AS "authorName",
        comment.created_at AS "createdAt"
      FROM team_task_comments comment
      LEFT JOIN users author ON author.id = comment.author_user_id
      WHERE comment.task_id = $1
      ORDER BY comment.created_at ASC, comment.id ASC;
    `, [taskId]);
    await query(`
      INSERT INTO team_task_reads (task_id, user_id, last_viewed_at)
      VALUES ($1, $2, COALESCE($3, NOW()))
      ON CONFLICT (task_id, user_id) DO UPDATE
      SET last_viewed_at = EXCLUDED.last_viewed_at;
    `, [taskId, viewer.id, comments.at(-1)?.createdAt || null]);
    res.json({ comments, count: comments.length });
  } catch (error) {
    console.error('Team task comments fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch task comments', details: error.message });
  }
});

app.post('/api/team-tasks/:id/comments', async (req, res) => {
  try {
    const viewer = await getTaskSessionUser(req);
    if (!viewer) return res.status(401).json({ error: 'Sign in to comment on tasks.' });
    if (!canUseTeamTasks(viewer)) return res.status(403).json({ error: 'You do not have access to team tasks.' });

    const taskId = Number(req.params.id);
    const body = String(req.body?.comment || '').trim();
    if (!Number.isInteger(taskId) || taskId <= 0 || !body || body.length > 5000) {
      return res.status(400).json({ error: 'Enter a comment of at most 5,000 characters.' });
    }

    const access = await getTeamTaskForViewer(taskId, viewer);
    if (access.error) return res.status(access.status).json({ error: access.error });
    if (!canCommentOnTeamTask(viewer, access.task)) {
      return res.status(403).json({ error: 'Only the assignee, creator, or an admin can comment on this task.' });
    }

    const inserted = await query(`
      INSERT INTO team_task_comments (task_id, author_user_id, comment)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, [taskId, viewer.id, body]);
    await query('UPDATE team_tasks SET updated_at = NOW() WHERE id = $1;', [taskId]);
    const rows = await query(`
      SELECT
        task_comment.id,
        task_comment.comment,
        task_comment.author_user_id AS "authorUserId",
        COALESCE(author.full_name, author.username, 'Former user') AS "authorName",
        task_comment.created_at AS "createdAt"
      FROM team_task_comments task_comment
      LEFT JOIN users author ON author.id = task_comment.author_user_id
      WHERE task_comment.id = $1;
    `, [inserted[0].id]);
    res.status(201).json({ comment: rows[0] });
  } catch (error) {
    console.error('Team task comment creation failed:', error);
    res.status(500).json({ error: 'Unable to add task comment', details: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, fullName, role, allowedPages, workingWarehouse } = req.body || {};
    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '').trim();

    if (!cleanUsername || !cleanPassword) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const safeAllowedPages = sanitizeAllowedPages(allowedPages || []);
    const safeWorkingWarehouse = String(workingWarehouse || '').trim();
    const row = await query(`
      INSERT INTO users (username, password, full_name, role, allowed_pages, working_warehouse)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, username, full_name, role, allowed_pages, working_warehouse;
    `, [cleanUsername, cleanPassword, String(fullName || '').trim() || cleanUsername, String(role || 'user').trim() || 'user', safeAllowedPages, safeWorkingWarehouse || null]);

    const user = row[0];
    res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name || user.username,
        role: user.role || 'user',
        allowedPages: Array.isArray(user.allowed_pages) ? sanitizeAllowedPages(user.allowed_pages) : [],
        workingWarehouse: String(user.working_warehouse || '').trim(),
      },
      message: 'User created successfully.',
    });
  } catch (error) {
    console.error('User creation failed:', error);
    res.status(500).json({ error: 'Unable to create user', details: error.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, fullName, role, allowedPages, password, workingWarehouse } = req.body || {};
    const cleanUsername = String(username || '').trim();
    const safeAllowedPages = sanitizeAllowedPages(allowedPages || []);

    if (!cleanUsername) {
      return res.status(400).json({ error: 'Username is required.' });
    }

    const currentUser = await query('SELECT id, username FROM users WHERE id = $1 LIMIT 1;', [Number(id)]);
    if (!currentUser.length) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const updates = [];
    const params = [];
    updates.push('username = $' + (params.length + 1)); params.push(cleanUsername);
    updates.push('full_name = $' + (params.length + 1)); params.push(String(fullName || '').trim() || cleanUsername);
    updates.push('role = $' + (params.length + 1)); params.push(String(role || 'user').trim() || 'user');
    updates.push('allowed_pages = $' + (params.length + 1)); params.push(safeAllowedPages);
    updates.push('working_warehouse = $' + (params.length + 1)); params.push(String(workingWarehouse || '').trim() || null);

    if (password && String(password).trim()) {
      updates.push('password = $' + (params.length + 1));
      params.push(String(password).trim());
    }

    const row = await query(`
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${params.length + 1}
      RETURNING id, username, full_name, role, allowed_pages, working_warehouse;
    `, [...params, Number(id)]);

    const user = row[0];
    res.json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name || user.username,
        role: user.role || 'user',
        allowedPages: Array.isArray(user.allowed_pages) ? sanitizeAllowedPages(user.allowed_pages) : [],
        workingWarehouse: String(user.working_warehouse || '').trim(),
      },
      message: 'User updated successfully.',
    });
  } catch (error) {
    console.error('User update failed:', error);
    res.status(500).json({ error: 'Unable to update user', details: error.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const numericId = Number(id);

    if (!Number.isFinite(numericId)) {
      return res.status(400).json({ error: 'User id is invalid.' });
    }

    const rows = await query('DELETE FROM users WHERE id = $1 AND username <> $2 RETURNING id, username;', [numericId, ADMIN_CREDENTIALS.username]);

    if (!rows.length) {
      return res.status(400).json({ error: 'The admin account cannot be deleted.' });
    }

    res.json({ deleted: rows[0], message: 'User deleted successfully.' });
  } catch (error) {
    console.error('User deletion failed:', error);
    res.status(500).json({ error: 'Unable to delete user', details: error.message });
  }
});

app.get('/api/employees', async (req, res) => {
  try {
    const employees = await query('SELECT employee_id, name FROM employees ORDER BY employee_id ASC;');
    res.json({ employees, count: employees.length });
  } catch (error) {
    console.error('Employees fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch employee list', details: error.message });
  }
});

app.get('/api/delivery-schedule', async (req, res) => {
  try {
    const warehouse = String(req.query.warehouse || '').trim();
    if (!warehouse) return res.json({ routes: [], count: 0, warehouse: null });

    const routes = await query(`
      SELECT id, wilaya, day, warehouse_name AS "warehouseName", COALESCE(driver_id::text, '') AS "driverId"
      FROM delivery_schedule
      WHERE LOWER(TRIM(warehouse_name)) = LOWER(TRIM($1))
      ORDER BY ARRAY_POSITION(ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], day), wilaya, id;
    `, [warehouse]);
    res.json({ routes, count: routes.length, warehouse });
  } catch (error) {
    console.error('Delivery schedule fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch delivery schedule', details: error.message });
  }
});

app.post('/api/delivery-schedule', async (req, res) => {
  try {
    const wilaya = String(req.body?.wilaya || '').trim();
    const day = String(req.body?.day || '').trim();
    const warehouse = String(req.body?.warehouse || '').trim();
    const driverValue = String(req.body?.driverId || '').trim();
    const driverId = driverValue ? Number(driverValue) : null;
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    if (!wilaya || !warehouse || !validDays.includes(day)) {
      return res.status(400).json({ error: 'Select a warehouse, wilaya, and valid day for the delivery route.' });
    }
    if (driverId !== null && (!Number.isInteger(driverId) || driverId <= 0)) {
      return res.status(400).json({ error: 'Select a valid driver.' });
    }

    const rows = await query(`
      INSERT INTO delivery_schedule (wilaya, day, warehouse_name, driver_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, wilaya, day, warehouse_name AS "warehouseName", COALESCE(driver_id::text, '') AS "driverId";
    `, [wilaya, day, warehouse, driverId]);
    res.status(201).json({ route: rows[0] });
  } catch (error) {
    if (error.code === '23503') return res.status(400).json({ error: 'Select an existing driver.' });
    console.error('Delivery route creation failed:', error);
    res.status(500).json({ error: 'Unable to save delivery route', details: error.message });
  }
});

app.delete('/api/delivery-schedule/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const warehouse = String(req.query.warehouse || '').trim();
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Delivery route id must be a positive integer.' });
    }
    if (!warehouse) return res.status(400).json({ error: 'A warehouse is required to delete a delivery route.' });
    const rows = await query(`
      DELETE FROM delivery_schedule
      WHERE id = $1 AND LOWER(TRIM(warehouse_name)) = LOWER(TRIM($2))
      RETURNING id;
    `, [id, warehouse]);
    if (!rows.length) return res.status(404).json({ error: 'Delivery route not found.' });
    res.json({ deleted: rows[0] });
  } catch (error) {
    console.error('Delivery route deletion failed:', error);
    res.status(500).json({ error: 'Unable to delete delivery route', details: error.message });
  }
});

app.get('/api/drivers', async (req, res) => {
  try {
    const drivers = await query('SELECT id, name, phone, region, vehicle, notes, created_at AS "createdAt" FROM drivers ORDER BY name ASC;');
    res.json({ drivers, count: drivers.length });
  } catch (error) {
    console.error('Drivers fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch driver list', details: error.message });
  }
});

app.post('/api/drivers', async (req, res) => {
  try {
    const { name, phone, region, vehicle, notes } = req.body || {};

    if (!name || !phone || !region || !vehicle) {
      return res.status(400).json({ error: 'Driver name, phone, region, and vehicle are required.' });
    }

    const row = await query(`
      INSERT INTO drivers (name, phone, region, vehicle, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, phone, region, vehicle, notes, created_at AS "createdAt";
    `, [String(name).trim(), String(phone).trim(), String(region).trim(), String(vehicle).trim(), String(notes || '').trim()]);

    res.status(201).json({ driver: row[0], message: 'Driver created successfully.' });
  } catch (error) {
    console.error('Driver creation failed:', error);
    res.status(500).json({ error: 'Unable to create driver', details: error.message });
  }
});

app.delete('/api/drivers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await query('DELETE FROM drivers WHERE id = $1 RETURNING id, name, phone, region, vehicle, notes;', [Number(id)]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Driver not found.' });
    }

    res.json({ deleted: rows[0], message: 'Driver deleted successfully.' });
  } catch (error) {
    console.error('Driver deletion failed:', error);
    res.status(500).json({ error: 'Unable to delete driver', details: error.message });
  }
});

app.get('/api/logistics/orders', async (req, res) => {
  try {
    const warehouseFilter = String(req.query.warehouse || '').trim();
    const params = [];
    let warehouseClause = '';

    if (warehouseFilter) {
      const normalized = normalizeWarehouseFilter(warehouseFilter);
      const warehouseName = String(warehouseFilter).trim();

      if (normalized && normalized.id !== null) {
        warehouseClause = `WHERE (
          LOWER(COALESCE(lo.warehouse_name, '')) = LOWER($1)
          OR lo.warehouse_id = $2
          OR CAST(lo.warehouse_id AS TEXT) = $3
        )`;
        params.push(warehouseName, Number(normalized.id), String(normalized.id));
      } else {
        warehouseClause = `WHERE (
          LOWER(COALESCE(lo.warehouse_name, '')) = LOWER($1)
          OR LOWER(COALESCE(CAST(lo.warehouse_id AS TEXT), '')) = LOWER($2)
        )`;
        params.push(warehouseName, warehouseName.toLowerCase());
      }
    }

    const rows = await query(`
      SELECT
        lo.id,
        lo.order_number AS "orderNumber",
        lo.customer_name AS "customerName",
        lo.wilaya,
        lo.warehouse_name AS "warehouseName",
        lo.warehouse_id AS "warehouseId",
        lo.status,
        lo.employee_prepared AS "employeePrepared",
        CASE
          WHEN lo.ready_at IS NOT NULL THEN EXTRACT(EPOCH FROM (lo.ready_at - lo.created_at))
          ELSE NULL
        END AS "pendingToReadySeconds",
        CASE
          WHEN lo.delivered_at IS NOT NULL THEN EXTRACT(EPOCH FROM (lo.delivered_at - lo.created_at))
          ELSE NULL
        END AS "pendingToDeliveredSeconds",
        lo.packing_started_at AS "packingStartedAt",
        CASE
          WHEN lo.packing_started_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM lo.packing_started_at)::bigint
          ELSE NULL
        END AS "packingStartedAtEpoch",
        CASE
          WHEN lo.packing_started_at IS NOT NULL AND lo.ready_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (lo.ready_at - lo.packing_started_at))
          ELSE NULL
        END AS "packingDurationSeconds",
        lo.ready_at AS "readyAt",
        COALESCE(prepared_employee.name, lo.employee_prepared) AS "preparedBy",
        counts.controller_employee_id AS "controllerEmployeeId",
        COALESCE(controller_employee.name, counts.controller_employee_id) AS "controlledBy",
        order_details.details AS "systemDetails",
        counts.physical_quantities AS "physicalQuantities",
        lo.driver_id AS "driverId",
        d.name AS "driverName",
        lo.created_at AS "createdAt"
      FROM logistics_orders lo
      LEFT JOIN drivers d ON d.id = lo.driver_id
      LEFT JOIN employees prepared_employee ON prepared_employee.employee_id = lo.employee_prepared
      LEFT JOIN logistics_order_physical_counts counts ON counts.order_number = lo.order_number
      LEFT JOIN employees controller_employee ON controller_employee.employee_id = counts.controller_employee_id
      LEFT JOIN logistics_order_details order_details ON order_details.order_number = lo.order_number
      ${warehouseClause}
      ORDER BY lo.created_at DESC;
    `, params);

    const orders = rows.map(({ systemDetails, physicalQuantities, ...order }) => ({
      ...order,
      quantitiesMatch: orderQuantitiesMatch(systemDetails, physicalQuantities),
    }));
    res.json({ orders, count: orders.length, warehouse: warehouseFilter || null });
  } catch (error) {
    console.error('Logistics orders fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch logistics orders', details: error.message });
  }
});

app.get('/api/logistics/transfers', async (req, res) => {
  try {
    const warehouse = String(req.query.warehouse || '').trim();
    const rows = await query(`
      SELECT
        transfer.transfer_reference AS "reference",
        transfer.document_oid AS "id",
        transfer.document_date AS "date",
        transfer.warehouse_source_id AS "warehouseSource",
        transfer.warehouse_source_name AS "warehouseSourceName",
        transfer.warehouse_destination_id AS "warehouseDestination",
        transfer.warehouse_destination_name AS "warehouseDestinationName",
        transfer.customer_name AS "customerName",
        transfer.document_category4 AS "documentCategory4",
        COALESCE(status.status, 'Pending') AS "status",
        COALESCE(prepared_employee.name, counts.employee_prepared_id) AS "preparedBy",
        COALESCE(controller_employee.name, counts.controller_employee_id) AS "controlledBy"
      FROM logistics_transfers transfer
      LEFT JOIN logistics_transfer_statuses status ON status.transfer_reference = transfer.transfer_reference
      LEFT JOIN logistics_order_physical_counts counts ON counts.order_number = transfer.transfer_reference
      LEFT JOIN employees prepared_employee ON prepared_employee.employee_id = counts.employee_prepared_id
      LEFT JOIN employees controller_employee ON controller_employee.employee_id = counts.controller_employee_id
      WHERE ($1::text IS NULL
        OR LOWER(TRIM(COALESCE(transfer.warehouse_source_name, ''))) = LOWER(TRIM($1))
        OR COALESCE(transfer.warehouse_source_id, '') = $1
        OR LOWER(TRIM(COALESCE(transfer.warehouse_destination_name, ''))) = LOWER(TRIM($1))
        OR COALESCE(transfer.warehouse_destination_id, '') = $1)
      ORDER BY transfer.document_date DESC NULLS LAST, transfer.transfer_reference DESC;
    `, [warehouse || null]);

    const transfers = rows.map((row) => ({
      ...row,
      sourceWarehouse: row.warehouseSourceName || row.warehouseSource || '—',
      destinationWarehouse: row.warehouseDestinationName || row.warehouseDestination || '—',
    }));

    const payload = normalizeJsonValue({ transfers, count: transfers.length, warehouse: warehouse || null });
    res.json(payload);
  } catch (error) {
    console.error('Logistics transfers fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch transfer records', details: error.message });
  }
});

app.post('/api/logistics/transfers/sync-odbc', async (req, res) => {
  try {
    const warehouse = String(req.body?.warehouse || req.query?.warehouse || '').trim();
    const rows = await getTransferSyncRowsFromOdbc(warehouse || null);
    const detailRows = rows.filter((row) => row.Document !== null && row.Document !== undefined);
    const transfersByReference = new Map();

    for (const row of rows || []) {
      const documentOid = String(row.id ?? row.oid ?? row.Oid ?? '').trim();
      const reference = String(row.reference ?? row.Reference ?? documentOid).trim();
      if (!reference) continue;

      const rawDate = row.date ?? row.Date ?? null;
      const documentDate = rawDate ? new Date(rawDate) : null;
      const documentCategory4 = Number(row.documentCategory4 ?? row.DocumentCategory4 ?? 19);
      transfersByReference.set(reference, {
        transfer_reference: reference,
        document_oid: documentOid || null,
        document_date: documentDate && Number.isFinite(documentDate.getTime()) ? documentDate.toISOString() : null,
        warehouse_source_id: String(row.warehouseSource ?? row.WarehouseSource ?? '').trim() || null,
        warehouse_source_name: String(row.warehouseSourceName ?? row.WarehouseSourceName ?? '').trim() || null,
        warehouse_destination_id: String(row.warehouseDestination ?? row.WarehouseDestination ?? '').trim() || null,
        warehouse_destination_name: String(row.warehouseDestinationName ?? row.WarehouseDestinationName ?? '').trim() || null,
        customer_name: String(row.customerName ?? row.CustomerName ?? row.Label1 ?? row.label1 ?? '').trim() || null,
        document_category4: Number.isFinite(documentCategory4) ? documentCategory4 : null,
      });
    }

    const transferRecords = Array.from(transfersByReference.values());
    const transferBatchSize = 500;
    for (let offset = 0; offset < transferRecords.length; offset += transferBatchSize) {
      const batch = transferRecords.slice(offset, offset + transferBatchSize);
      await query(`
        INSERT INTO logistics_transfers (
          transfer_reference, document_oid, document_date,
          warehouse_source_id, warehouse_source_name,
          warehouse_destination_id, warehouse_destination_name,
          customer_name, document_category4, synced_at
        )
        SELECT
          transfer_reference, document_oid, document_date,
          warehouse_source_id, warehouse_source_name,
          warehouse_destination_id, warehouse_destination_name,
          customer_name, document_category4, NOW()
        FROM jsonb_to_recordset($1::jsonb) AS incoming(
          transfer_reference TEXT, document_oid TEXT, document_date TIMESTAMPTZ,
          warehouse_source_id TEXT, warehouse_source_name TEXT,
          warehouse_destination_id TEXT, warehouse_destination_name TEXT,
          customer_name TEXT, document_category4 INTEGER
        )
        ON CONFLICT (transfer_reference) DO UPDATE SET
          document_oid = EXCLUDED.document_oid,
          document_date = EXCLUDED.document_date,
          warehouse_source_id = EXCLUDED.warehouse_source_id,
          warehouse_source_name = EXCLUDED.warehouse_source_name,
          warehouse_destination_id = EXCLUDED.warehouse_destination_id,
          warehouse_destination_name = EXCLUDED.warehouse_destination_name,
          customer_name = EXCLUDED.customer_name,
          document_category4 = EXCLUDED.document_category4,
          synced_at = NOW()
        WHERE logistics_transfers.document_oid IS DISTINCT FROM EXCLUDED.document_oid
          OR logistics_transfers.document_date IS DISTINCT FROM EXCLUDED.document_date
          OR logistics_transfers.warehouse_source_id IS DISTINCT FROM EXCLUDED.warehouse_source_id
          OR logistics_transfers.warehouse_source_name IS DISTINCT FROM EXCLUDED.warehouse_source_name
          OR logistics_transfers.warehouse_destination_id IS DISTINCT FROM EXCLUDED.warehouse_destination_id
          OR logistics_transfers.warehouse_destination_name IS DISTINCT FROM EXCLUDED.warehouse_destination_name
          OR logistics_transfers.customer_name IS DISTINCT FROM EXCLUDED.customer_name
          OR logistics_transfers.document_category4 IS DISTINCT FROM EXCLUDED.document_category4;
      `, [JSON.stringify(batch)]);
    }

    const detailSnapshots = buildOrderDetailSnapshots(detailRows);
    const detailBatchSize = 200;
    for (let offset = 0; offset < detailSnapshots.length; offset += detailBatchSize) {
      const batch = detailSnapshots.slice(offset, offset + detailBatchSize);
      const serializedSnapshots = JSON.stringify(
        batch.map(({ orderNumber, details }) => ({ transfer_reference: orderNumber, details })),
        (_key, value) => typeof value === 'bigint' ? value.toString() : value,
      );
      await query(`
        INSERT INTO logistics_transfer_details (transfer_reference, details, synced_at)
        SELECT transfer_reference, details, NOW()
        FROM jsonb_to_recordset($1::jsonb) AS snapshots(transfer_reference TEXT, details JSONB)
        ON CONFLICT (transfer_reference) DO UPDATE
        SET details = EXCLUDED.details, synced_at = EXCLUDED.synced_at
        WHERE logistics_transfer_details.details IS DISTINCT FROM EXCLUDED.details;
      `, [serializedSnapshots]);
    }

    res.json({
      ok: true,
      synced: transferRecords.length,
      detailsSynced: detailSnapshots.length,
      warehouse: warehouse || null,
    });
  } catch (error) {
    console.error('Logistics transfer sync failed:', error);
    res.status(500).json({ error: 'Unable to sync transfers from ODBC', details: error.message });
  }
});

app.put('/api/logistics/transfers/:reference/status', async (req, res) => {
  try {
    const reference = String(req.params.reference || '').trim();
    const status = String(req.body?.status || '').trim();
    if (!reference || !['Pending', 'Packing', 'Ready', 'Delivered'].includes(status)) {
      return res.status(400).json({ error: 'Choose a valid transfer reference and status.' });
    }

    const rows = await query(`
      INSERT INTO logistics_transfer_statuses (transfer_reference, status, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (transfer_reference) DO UPDATE
      SET status = EXCLUDED.status, updated_at = NOW()
      RETURNING transfer_reference AS "transferReference", status;
    `, [reference, status]);

    res.json({ ok: true, transfer: rows[0] });
  } catch (error) {
    console.error('Transfer status update failed:', error);
    res.status(500).json({ error: 'Unable to update transfer status', details: error.message });
  }
});

app.get('/api/logistics/orders/:orderNumber/details', async (req, res) => {
  try {
    const orderNumber = String(req.params.orderNumber);
    const [detailRows, savedRows] = await Promise.all([
      query('SELECT details FROM logistics_order_details WHERE order_number = $1', [orderNumber]),
      query('SELECT physical_quantities, control_quantities FROM logistics_order_physical_counts WHERE order_number = $1', [orderNumber]),
    ]);
    let demandRows = [];
    try {
      demandRows = await query(`
        SELECT detail_key AS "detailKey", source_warehouse AS "sourceWarehouse", status
        FROM demand_transfers
        WHERE order_number = $1
          AND status IN ('pending', 'accepted')
      `, [orderNumber]);
    } catch (demandError) {
      console.warn('Demand transfers lookup skipped:', demandError.message);
    }
    const savedQuantities = savedRows[0]?.physical_quantities || {};
    const savedControlQuantities = savedRows[0]?.control_quantities || {};
    const demandByKey = Object.fromEntries(
      (demandRows || []).map((row) => [row.detailKey, row.sourceWarehouse]),
    );
    const details = attachSavedOrderQuantities(
      detailRows[0]?.details || [],
      savedQuantities,
      savedControlQuantities,
    ).map((detail) => ({
      ...detail,
      demandSourceWarehouse: demandByKey[detail.detailKey] || '',
    }));
    const payload = JSON.stringify(
      { details, count: details.length },
      (_key, value) => typeof value === 'bigint' ? value.toString() : value,
    );
    res.type('json').send(payload);
  } catch (error) {
    console.error('Logistics order details fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch logistics order details', details: error.message });
  }
});

app.get('/api/logistics/transfers/:reference/details', async (req, res) => {
  try {
    const transferReference = String(req.params.reference);
    const [detailRows, savedRows] = await Promise.all([
      query('SELECT details FROM logistics_transfer_details WHERE transfer_reference = $1', [transferReference]),
      query('SELECT physical_quantities, control_quantities FROM logistics_order_physical_counts WHERE order_number = $1', [transferReference]),
    ]);

    const savedQuantities = savedRows[0]?.physical_quantities || {};
    const savedControlQuantities = savedRows[0]?.control_quantities || {};
    const details = attachSavedOrderQuantities(
      detailRows[0]?.details || [],
      savedQuantities,
      savedControlQuantities,
    );

    const payload = JSON.stringify(
      { details, count: details.length },
      (_key, value) => typeof value === 'bigint' ? value.toString() : value,
    );
    res.type('json').send(payload);
  } catch (error) {
    console.error('Transfer details fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch transfer details', details: error.message });
  }
});

app.put('/api/logistics/orders/:orderNumber/physical-counts', async (req, res) => {
  try {
    const orderNumber = String(req.params.orderNumber);
    const input = req.body?.physicalQuantities;
    const controlInput = req.body?.controlQuantities || {};
    const demandTransferInput = req.body?.demandTransfers || {};
    const employeePrepared = String(req.body?.employeePrepared || '').trim();
    const controllerEmployeeId = String(req.body?.controllerEmployeeId || '').trim();
    const requestingWarehouse = String(req.body?.requestingWarehouse || '').trim();

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return res.status(400).json({ error: 'Physical quantities must be provided as an object.' });
    }
    if (typeof controlInput !== 'object' || Array.isArray(controlInput)) {
      return res.status(400).json({ error: 'Control quantities must be provided as an object.' });
    }
    if (typeof demandTransferInput !== 'object' || Array.isArray(demandTransferInput)) {
      return res.status(400).json({ error: 'Demand transfers must be provided as an object.' });
    }

    const physicalQuantities = {};
    const controlQuantities = {};
    for (const [quantities, target, label] of [
      [input, physicalQuantities, 'Physical'],
      [controlInput, controlQuantities, 'Control'],
    ]) {
      for (const [detailKey, rawQuantity] of Object.entries(quantities)) {
        if (rawQuantity === '' || rawQuantity === null || rawQuantity === undefined) continue;
        const quantity = Number(rawQuantity);
        if (!Number.isFinite(quantity) || quantity < 0) {
          return res.status(400).json({ error: `${label} quantities must be non-negative numbers.` });
        }
        target[detailKey] = String(rawQuantity);
      }
    }

    const hasPhysicalQuantity = Object.keys(physicalQuantities).length > 0;
    const hasControlQuantity = Object.keys(controlQuantities).length > 0;
    const employeeRows = hasPhysicalQuantity && employeePrepared
      ? await query('SELECT employee_id FROM employees WHERE employee_id = $1 LIMIT 1', [employeePrepared])
      : [];
    const controllerRows = hasControlQuantity && controllerEmployeeId
      ? await query('SELECT employee_id FROM employees WHERE employee_id = $1 LIMIT 1', [controllerEmployeeId])
      : [];
    const assignedEmployee = employeeRows.length ? employeePrepared : '';
    const assignedController = controllerRows.length ? controllerEmployeeId : '';
    const rows = await query(`
      WITH updated_order AS (
        UPDATE logistics_orders
        SET employee_prepared = CASE
          WHEN $3 <> '' THEN $3
          ELSE employee_prepared
        END
        WHERE order_number = $1
        RETURNING employee_prepared AS "employeePrepared", warehouse_name AS "warehouseName"
      ), saved_counts AS (
        INSERT INTO logistics_order_physical_counts (order_number, physical_quantities, control_quantities, controller_employee_id, updated_at)
        SELECT $1, $2::jsonb, $4::jsonb, NULLIF($5, ''), NOW()
        WHERE EXISTS (SELECT 1 FROM updated_order)
        ON CONFLICT (order_number) DO UPDATE
        SET physical_quantities = EXCLUDED.physical_quantities,
            control_quantities = EXCLUDED.control_quantities,
            controller_employee_id = COALESCE(EXCLUDED.controller_employee_id, logistics_order_physical_counts.controller_employee_id),
            updated_at = NOW()
        RETURNING
          updated_at AS "updatedAt",
          controller_employee_id AS "controllerEmployeeId"
      )
      SELECT
        saved_counts."updatedAt",
        saved_counts."controllerEmployeeId",
        updated_order."employeePrepared",
        updated_order."warehouseName"
      FROM saved_counts
      CROSS JOIN updated_order;
    `, [orderNumber, JSON.stringify(physicalQuantities), assignedEmployee, JSON.stringify(controlQuantities), assignedController]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const orderWarehouse = requestingWarehouse || String(rows[0].warehouseName || '').trim();
    const detailRows = await query('SELECT details FROM logistics_order_details WHERE order_number = $1', [orderNumber]);
    const orderDetails = attachSavedOrderQuantities(
      detailRows[0]?.details || [],
      physicalQuantities,
      controlQuantities,
    );

    const activeDemandKeys = [];
    for (const detail of orderDetails) {
      const systemQuantity = Number(detail.Quantity);
      const physicalQuantity = Number(physicalQuantities[detail.detailKey]);
      const sourceWarehouse = String(demandTransferInput[detail.detailKey] || '').trim();
      if (
        !sourceWarehouse
        || !Number.isFinite(systemQuantity)
        || !Number.isFinite(physicalQuantity)
        || physicalQuantity >= systemQuantity
      ) {
        continue;
      }

      const differenceQuantity = systemQuantity - physicalQuantity;
      if (differenceQuantity <= 0) continue;
      if (!orderWarehouse) {
        return res.status(400).json({ error: 'A requesting warehouse is required to create demand transfers.' });
      }
      if (sourceWarehouse.toLowerCase() === orderWarehouse.toLowerCase()) {
        return res.status(400).json({ error: 'Demand transfer source warehouse must be different from the requesting warehouse.' });
      }

      activeDemandKeys.push(detail.detailKey);
      await query(`
        INSERT INTO demand_transfers (
          order_number, detail_key, product_label, system_quantity, physical_quantity,
          difference_quantity, requesting_warehouse, source_warehouse, status, requested_by, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NULLIF($9, ''), NOW())
        ON CONFLICT (order_number, detail_key) DO UPDATE
        SET product_label = EXCLUDED.product_label,
            system_quantity = EXCLUDED.system_quantity,
            physical_quantity = EXCLUDED.physical_quantity,
            difference_quantity = EXCLUDED.difference_quantity,
            requesting_warehouse = EXCLUDED.requesting_warehouse,
            source_warehouse = EXCLUDED.source_warehouse,
            status = CASE
              WHEN demand_transfers.status IN ('doesnt_have', 'transferred') THEN 'pending'
              ELSE demand_transfers.status
            END,
            requested_by = COALESCE(EXCLUDED.requested_by, demand_transfers.requested_by),
            updated_at = NOW()
      `, [
        orderNumber,
        detail.detailKey,
        String(detail.Label1 || '').trim() || 'Item',
        systemQuantity,
        physicalQuantity,
        differenceQuantity,
        orderWarehouse,
        sourceWarehouse,
        assignedEmployee,
      ]);
    }

    if (activeDemandKeys.length) {
      await query(`
        DELETE FROM demand_transfers
        WHERE order_number = $1
          AND status IN ('pending', 'accepted')
          AND NOT (detail_key = ANY($2::text[]))
      `, [orderNumber, activeDemandKeys]);
    } else {
      await query(`
        DELETE FROM demand_transfers
        WHERE order_number = $1
          AND status IN ('pending', 'accepted')
      `, [orderNumber]);
    }

    res.json({
      ok: true,
      updatedAt: rows[0].updatedAt,
      employeePrepared: rows[0].employeePrepared,
      controllerEmployeeId: rows[0].controllerEmployeeId,
      demandTransferCount: activeDemandKeys.length,
    });
  } catch (error) {
    console.error('Logistics order physical quantities save failed:', error);
    res.status(500).json({ error: 'Unable to save physical quantities', details: error.message });
  }
});

function mapDemandTransferRow(row, warehouse = '') {
  const selected = String(warehouse || '').trim().toLowerCase();
  const source = String(row.sourceWarehouse || '').trim().toLowerCase();
  const requesting = String(row.requestingWarehouse || '').trim().toLowerCase();
  let direction = 'incoming';
  if (selected && requesting === selected && source !== selected) {
    direction = 'outgoing';
  } else if (selected && source === selected) {
    direction = 'incoming';
  }

  return {
    ...row,
    direction,
  };
}

app.get('/api/demand-transfers', async (req, res) => {
  try {
    const warehouse = String(req.query.warehouse || '').trim();
    if (!warehouse) {
      return res.json({ demands: [], count: 0, warehouse: null });
    }

    const rows = await query(`
      SELECT
        id,
        order_number AS "orderNumber",
        detail_key AS "detailKey",
        product_label AS "productLabel",
        system_quantity AS "systemQuantity",
        physical_quantity AS "physicalQuantity",
        difference_quantity AS "differenceQuantity",
        requesting_warehouse AS "requestingWarehouse",
        source_warehouse AS "sourceWarehouse",
        status,
        requested_by AS "requestedBy",
        updated_by AS "updatedBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM demand_transfers
      WHERE status IN ('pending', 'accepted')
        AND (
          LOWER(TRIM(source_warehouse)) = LOWER(TRIM($1))
          OR LOWER(TRIM(requesting_warehouse)) = LOWER(TRIM($1))
        )
      ORDER BY created_at DESC, id DESC;
    `, [warehouse]);

    const demands = rows.map((row) => mapDemandTransferRow(row, warehouse));
    res.json({ demands, count: demands.length, warehouse });
  } catch (error) {
    console.error('Demand transfers fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch demand transfers', details: error.message });
  }
});

app.put('/api/demand-transfers/bulk-status', async (req, res) => {
  try {
    const warehouse = String(req.body?.warehouse || '').trim();
    const nextStatus = String(req.body?.status || '').trim().toLowerCase();
    const updatedBy = String(req.body?.updatedBy || '').trim();
    const allowedStatuses = ['accepted', 'transferred'];

    if (!warehouse) {
      return res.status(400).json({ error: 'A warehouse is required for bulk status updates.' });
    }
    if (!allowedStatuses.includes(nextStatus)) {
      return res.status(400).json({ error: 'Bulk status must be accepted or transferred.' });
    }

    const rows = await query(`
      UPDATE demand_transfers
      SET status = $2,
          updated_by = NULLIF($3, ''),
          updated_at = NOW()
      WHERE status IN ('pending', 'accepted')
        AND (
          LOWER(TRIM(source_warehouse)) = LOWER(TRIM($1))
          OR LOWER(TRIM(requesting_warehouse)) = LOWER(TRIM($1))
        )
      RETURNING id;
    `, [warehouse, nextStatus, updatedBy]);

    res.json({ ok: true, updatedCount: rows.length, status: nextStatus });
  } catch (error) {
    console.error('Demand transfer bulk status update failed:', error);
    res.status(500).json({ error: 'Unable to update demand transfers', details: error.message });
  }
});

app.put('/api/demand-transfers/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const updatedBy = String(req.body?.updatedBy || '').trim();
    const hasStatus = Object.prototype.hasOwnProperty.call(req.body || {}, 'status');
    const hasQuantity = Object.prototype.hasOwnProperty.call(req.body || {}, 'differenceQuantity');
    const nextStatus = hasStatus ? String(req.body?.status || '').trim().toLowerCase() : null;
    const allowedStatuses = ['pending', 'accepted', 'doesnt_have', 'transferred'];

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'A valid demand transfer id is required.' });
    }
    if (!hasStatus && !hasQuantity) {
      return res.status(400).json({ error: 'Provide a status and/or difference quantity to update.' });
    }
    if (hasStatus && !allowedStatuses.includes(nextStatus)) {
      return res.status(400).json({ error: 'Status must be pending, accepted, doesnt_have, or transferred.' });
    }

    let differenceQuantity = null;
    if (hasQuantity) {
      differenceQuantity = Number(req.body?.differenceQuantity);
      if (!Number.isFinite(differenceQuantity) || differenceQuantity <= 0) {
        return res.status(400).json({ error: 'Difference quantity must be a positive number.' });
      }
    }

    const rows = await query(`
      UPDATE demand_transfers
      SET status = CASE WHEN $2::boolean THEN $3 ELSE status END,
          difference_quantity = CASE WHEN $4::boolean THEN $5 ELSE difference_quantity END,
          updated_by = NULLIF($6, ''),
          updated_at = NOW()
      WHERE id = $1
        AND status IN ('pending', 'accepted')
      RETURNING
        id,
        order_number AS "orderNumber",
        detail_key AS "detailKey",
        product_label AS "productLabel",
        system_quantity AS "systemQuantity",
        physical_quantity AS "physicalQuantity",
        difference_quantity AS "differenceQuantity",
        requesting_warehouse AS "requestingWarehouse",
        source_warehouse AS "sourceWarehouse",
        status,
        requested_by AS "requestedBy",
        updated_by AS "updatedBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `, [id, hasStatus, nextStatus, hasQuantity, differenceQuantity, updatedBy]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Demand transfer not found or already closed.' });
    }

    res.json({ ok: true, demand: rows[0] });
  } catch (error) {
    console.error('Demand transfer update failed:', error);
    res.status(500).json({ error: 'Unable to update demand transfer', details: error.message });
  }
});

app.put('/api/demand-transfers/:id/status', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const nextStatus = String(req.body?.status || '').trim().toLowerCase();
    const updatedBy = String(req.body?.updatedBy || '').trim();
    const allowedStatuses = ['pending', 'accepted', 'doesnt_have', 'transferred'];

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'A valid demand transfer id is required.' });
    }
    if (!allowedStatuses.includes(nextStatus)) {
      return res.status(400).json({ error: 'Status must be pending, accepted, doesnt_have, or transferred.' });
    }

    const rows = await query(`
      UPDATE demand_transfers
      SET status = $2,
          updated_by = NULLIF($3, ''),
          updated_at = NOW()
      WHERE id = $1
        AND status IN ('pending', 'accepted')
      RETURNING
        id,
        order_number AS "orderNumber",
        detail_key AS "detailKey",
        product_label AS "productLabel",
        system_quantity AS "systemQuantity",
        physical_quantity AS "physicalQuantity",
        difference_quantity AS "differenceQuantity",
        requesting_warehouse AS "requestingWarehouse",
        source_warehouse AS "sourceWarehouse",
        status,
        requested_by AS "requestedBy",
        updated_by AS "updatedBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `, [id, nextStatus, updatedBy]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Demand transfer not found or already closed.' });
    }

    res.json({ ok: true, demand: rows[0] });
  } catch (error) {
    console.error('Demand transfer status update failed:', error);
    res.status(500).json({ error: 'Unable to update demand transfer status', details: error.message });
  }
});

app.put('/api/logistics/transfers/:reference/physical-counts', async (req, res) => {
  try {
    const reference = String(req.params.reference);
    const input = req.body?.physicalQuantities;
    const controlInput = req.body?.controlQuantities || {};
    const employeePrepared = String(req.body?.employeePrepared || '').trim();
    const controllerEmployeeId = String(req.body?.controllerEmployeeId || '').trim();

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return res.status(400).json({ error: 'Physical quantities must be provided as an object.' });
    }
    if (typeof controlInput !== 'object' || Array.isArray(controlInput)) {
      return res.status(400).json({ error: 'Control quantities must be provided as an object.' });
    }

    const physicalQuantities = {};
    const controlQuantities = {};
    for (const [quantities, target, label] of [
      [input, physicalQuantities, 'Physical'],
      [controlInput, controlQuantities, 'Control'],
    ]) {
      for (const [detailKey, rawQuantity] of Object.entries(quantities)) {
        if (rawQuantity === '' || rawQuantity === null || rawQuantity === undefined) continue;
        const quantity = Number(rawQuantity);
        if (!Number.isFinite(quantity) || quantity < 0) {
          return res.status(400).json({ error: `${label} quantities must be non-negative numbers.` });
        }
        target[detailKey] = String(rawQuantity);
      }
    }

    const hasPhysicalQuantity = Object.keys(physicalQuantities).length > 0;
    const hasControlQuantity = Object.keys(controlQuantities).length > 0;
    const employeeRows = hasPhysicalQuantity && employeePrepared
      ? await query('SELECT employee_id FROM employees WHERE employee_id = $1 LIMIT 1', [employeePrepared])
      : [];
    const controllerRows = hasControlQuantity && controllerEmployeeId
      ? await query('SELECT employee_id FROM employees WHERE employee_id = $1 LIMIT 1', [controllerEmployeeId])
      : [];

    const assignedEmployee = employeeRows.length ? employeePrepared : '';
    const assignedController = controllerRows.length ? controllerEmployeeId : '';
    const rows = await query(`
      INSERT INTO logistics_order_physical_counts (order_number, physical_quantities, control_quantities, employee_prepared_id, controller_employee_id, updated_at)
      VALUES ($1, $2::jsonb, $3::jsonb, NULLIF($4, ''), NULLIF($5, ''), NOW())
      ON CONFLICT (order_number) DO UPDATE
      SET physical_quantities = EXCLUDED.physical_quantities,
          control_quantities = EXCLUDED.control_quantities,
          employee_prepared_id = COALESCE(EXCLUDED.employee_prepared_id, logistics_order_physical_counts.employee_prepared_id),
          controller_employee_id = COALESCE(EXCLUDED.controller_employee_id, logistics_order_physical_counts.controller_employee_id),
          updated_at = NOW()
      RETURNING order_number, updated_at AS "updatedAt", employee_prepared_id AS "employeePrepared", controller_employee_id AS "controllerEmployeeId";
    `, [reference, JSON.stringify(physicalQuantities), JSON.stringify(controlQuantities), assignedEmployee, assignedController]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Transfer not found.' });
    }

    res.json({
      ok: true,
      orderNumber: reference,
      updatedAt: rows[0].updatedAt,
      employeePrepared: rows[0].employeePrepared,
      controllerEmployeeId: rows[0].controllerEmployeeId,
    });
  } catch (error) {
    console.error('Transfer physical quantities save failed:', error);
    res.status(500).json({ error: 'Unable to save transfer quantities', details: error.message });
  }
});

app.post('/api/logistics/orders', async (req, res) => {
  try {
    const { orderNumber, customerName, wilaya, status, employeePrepared, createdAt, driverId, warehouseName, warehouseId } = req.body || {};

    if (!orderNumber || !customerName || !wilaya || !employeePrepared) {
      return res.status(400).json({ error: 'Order number, customer, wilaya, and employee are required.' });
    }

    const created = createdAt || new Date().toISOString();
    const insertion = await query(`
      INSERT INTO logistics_orders (order_number, customer_name, wilaya, warehouse_name, warehouse_id, status, employee_prepared, driver_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING
        id,
        order_number AS "orderNumber",
        customer_name AS "customerName",
        wilaya,
        warehouse_name AS "warehouseName",
        warehouse_id AS "warehouseId",
        status,
        employee_prepared AS "employeePrepared",
        driver_id AS "driverId",
        created_at AS "createdAt";
    `, [String(orderNumber).trim(), String(customerName).trim(), String(wilaya).trim(), String(warehouseName || '').trim() || null, warehouseId !== undefined && warehouseId !== null && warehouseId !== '' ? Number(warehouseId) : null, String(status || 'Pending').trim(), String(employeePrepared).trim(), driverId ? Number(driverId) : null, created]);

    const order = insertion[0];
    if (order && order.driverId) {
      const driverRows = await query('SELECT name FROM drivers WHERE id = $1', [order.driverId]);
      if (driverRows.length) {
        order.driverName = driverRows[0].name;
      }
    }

    res.status(201).json({ order, message: 'Order created successfully.' });
  } catch (error) {
    console.error('Logistics order creation failed:', error);
    if (String(error.message).includes('duplicate key')) {
      return res.status(409).json({ error: 'An order with this number already exists.' });
    }
    res.status(500).json({ error: 'Unable to create logistics order', details: error.message });
  }
});

app.post('/api/logistics/orders/sync-odbc', async (req, res) => {
  try {
    const warehouse = String(req.body?.warehouse || req.query?.warehouse || '').trim();
    const rows = await getLogisticsOrdersFromOdbc(warehouse || null);
    const detailRows = await getLogisticsOrderDetailsForSyncFromOdbc(warehouse || null);
    const ordersByNumber = new Map();

    for (const row of rows || []) {
      const orderNumber = String(row.Reference || row.reference || row.Oid || row.oid || '').trim();
      const customerName = String(
        row['Label1'] || row.label1 || row['ThirdPartyLabel'] || row.thirdPartyLabel || row['Customer'] || row.customer || 'Unknown customer'
      ).trim();
      const wilaya = String(row['Wilaya'] || row.wilaya || 'Unknown').trim();
      const warehouseId = row.WarehouseSource ?? row['WarehouseSource'] ?? null;
      const warehouseNameFromRow = String(row['WarehouseName'] || row.warehouseName || row['Depot'] || row.depot || '').trim();
      const warehouseName = warehouseNameFromRow || (warehouse ? String(warehouse).trim() : '') || (warehouseId !== null && warehouseId !== undefined ? String(warehouseId) : '');

      if (!orderNumber || !customerName || !wilaya) continue;

      const createdValue = row.Date || row.date || row['Date'];
      const createdAt = createdValue ? new Date(createdValue).toISOString() : new Date().toISOString();
      const nextOrder = {
        order_number: orderNumber,
        customer_name: customerName,
        wilaya,
        warehouse_name: warehouseName,
        warehouse_id: warehouseId ? Number(warehouseId) : null,
        created_at: createdAt,
      };
      const existing = ordersByNumber.get(orderNumber);

      if (existing) {
        existing.customer_name = nextOrder.customer_name;
        existing.wilaya = nextOrder.wilaya;
        existing.warehouse_name = nextOrder.warehouse_name;
        existing.warehouse_id = nextOrder.warehouse_id;
        existing.created_at = nextOrder.created_at;
      } else {
        ordersByNumber.set(orderNumber, nextOrder);
      }
    }

    const ordersToSync = Array.from(ordersByNumber.values());
    let upsertedOrders = 0;

    const orderBatchSize = 500;
    const orderUpsertSql = `
      INSERT INTO logistics_orders (order_number, customer_name, wilaya, warehouse_name, warehouse_id, status, employee_prepared, driver_id, created_at)
      SELECT order_number, customer_name, wilaya, warehouse_name, warehouse_id, 'Pending', NULL, NULL, created_at
      FROM jsonb_to_recordset($1::jsonb) AS incoming(
        order_number TEXT,
        customer_name TEXT,
        wilaya TEXT,
        warehouse_name TEXT,
        warehouse_id INTEGER,
        created_at TIMESTAMPTZ
      )
      ON CONFLICT (order_number) DO UPDATE
      SET customer_name = EXCLUDED.customer_name,
          wilaya = EXCLUDED.wilaya,
          warehouse_name = EXCLUDED.warehouse_name,
          warehouse_id = EXCLUDED.warehouse_id,
          created_at = EXCLUDED.created_at
      WHERE logistics_orders.customer_name IS DISTINCT FROM EXCLUDED.customer_name
         OR logistics_orders.wilaya IS DISTINCT FROM EXCLUDED.wilaya
         OR logistics_orders.warehouse_name IS DISTINCT FROM EXCLUDED.warehouse_name
         OR logistics_orders.warehouse_id IS DISTINCT FROM EXCLUDED.warehouse_id
         OR logistics_orders.created_at IS DISTINCT FROM EXCLUDED.created_at
      RETURNING id;
    `;

    for (let offset = 0; offset < ordersToSync.length; offset += orderBatchSize) {
      const batch = ordersToSync.slice(offset, offset + orderBatchSize);
      const result = await query(orderUpsertSql, [JSON.stringify(batch)]);
      upsertedOrders += result.length;
    }

    const detailSnapshots = buildOrderDetailSnapshots(detailRows);
    let upsertedDetails = 0;
    if (detailSnapshots.length) {
      const detailBatchSize = 200;
      const serializedSnapshots = JSON.parse(serializeOrderDetailSnapshots(detailSnapshots));
      for (let offset = 0; offset < serializedSnapshots.length; offset += detailBatchSize) {
        const batch = serializedSnapshots.slice(offset, offset + detailBatchSize);
        const result = await query(`
          INSERT INTO logistics_order_details (order_number, details, synced_at)
          SELECT order_number, details, NOW()
          FROM jsonb_to_recordset($1::jsonb) AS snapshots(order_number TEXT, details JSONB)
          ON CONFLICT (order_number) DO UPDATE
          SET details = EXCLUDED.details,
              synced_at = NOW()
          RETURNING order_number;
        `, [JSON.stringify(batch)]);
        upsertedDetails += result.length;
      }
    }

    const allOrders = await query(`
      SELECT
        id,
        order_number AS "orderNumber",
        customer_name AS "customerName",
        wilaya,
        warehouse_name AS "warehouseName",
        warehouse_id AS "warehouseId",
        status,
        employee_prepared AS "employeePrepared",
        CASE
          WHEN ready_at IS NOT NULL THEN EXTRACT(EPOCH FROM (ready_at - created_at))
          ELSE NULL
        END AS "pendingToReadySeconds",
        CASE
          WHEN delivered_at IS NOT NULL THEN EXTRACT(EPOCH FROM (delivered_at - created_at))
          ELSE NULL
        END AS "pendingToDeliveredSeconds",
        created_at AS "createdAt"
      FROM logistics_orders
      ORDER BY created_at DESC;
    `);

    const count = Math.max(upsertedOrders, upsertedDetails, ordersToSync.length);
    res.json({
      ok: true,
      count,
      upsertedOrders,
      upsertedDetails,
      orders: allOrders,
      warehouse,
      message: warehouse
        ? `Synced ${ordersToSync.length} orders for ${warehouse} (${upsertedOrders} headers updated, ${upsertedDetails} detail sets updated).`
        : `Synced ${ordersToSync.length} logistics orders from ODBC (${upsertedOrders} headers updated, ${upsertedDetails} detail sets updated).`,
    });
  } catch (error) {
    console.error('ODBC logistics sync failed:', error);
    res.status(500).json({ error: 'Unable to sync logistics orders from ODBC', details: error.message });
  }
});

app.put('/api/logistics/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, employeePrepared, driverId } = req.body || {};

    const updates = [];
    const params = [];

    if (status) {
      const normalizedStatus = String(status).trim();
      updates.push('status = $' + (params.length + 1));
      params.push(normalizedStatus);
      if (normalizedStatus === 'Packing') {
        updates.push('packing_started_at = NOW()');
      }
      if (normalizedStatus === 'Pending') {
        updates.push('packing_started_at = NULL');
      }
      if (normalizedStatus === 'Ready') {
        updates.push('ready_at = COALESCE(ready_at, NOW())');
        updates.push('packing_started_at = COALESCE(packing_started_at, NOW())');
      }
      if (normalizedStatus === 'Delivered') {
        updates.push('delivered_at = COALESCE(delivered_at, NOW())');
      }
    }

    if (employeePrepared !== undefined) {
      updates.push('employee_prepared = $' + (params.length + 1));
      params.push(String(employeePrepared).trim());
    }

    if (driverId !== undefined) {
      updates.push('driver_id = $' + (params.length + 1));
      params.push(driverId === '' || driverId === null ? null : Number(driverId));
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'No order fields were provided for update.' });
    }

    const rows = await query(`
      UPDATE logistics_orders
      SET ${updates.join(', ')}
      WHERE id = $${params.length + 1}
      RETURNING
        id,
        order_number AS "orderNumber",
        customer_name AS "customerName",
        wilaya,
        status,
        employee_prepared AS "employeePrepared",
        driver_id AS "driverId",
        packing_started_at AS "packingStartedAt",
        CASE
          WHEN packing_started_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM packing_started_at)::bigint
          ELSE NULL
        END AS "packingStartedAtEpoch",
        CASE
          WHEN packing_started_at IS NOT NULL AND ready_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (ready_at - packing_started_at))
          ELSE NULL
        END AS "packingDurationSeconds",
        ready_at AS "readyAt",
        CASE
          WHEN ready_at IS NOT NULL THEN EXTRACT(EPOCH FROM (ready_at - created_at))
          ELSE NULL
        END AS "pendingToReadySeconds",
        CASE
          WHEN delivered_at IS NOT NULL THEN EXTRACT(EPOCH FROM (delivered_at - created_at))
          ELSE NULL
        END AS "pendingToDeliveredSeconds",
        created_at AS "createdAt";
    `, [...params, Number(id)]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = rows[0];
    if (order.driverId) {
      const driverRows = await query('SELECT name FROM drivers WHERE id = $1', [order.driverId]);
      if (driverRows.length) {
        order.driverName = driverRows[0].name;
      }
    }

    res.json({ order, message: 'Order updated successfully.' });
  } catch (error) {
    console.error('Logistics order update failed:', error);
    res.status(500).json({ error: 'Unable to update logistics order', details: error.message });
  }
});

app.delete('/api/logistics/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await query(`
      DELETE FROM logistics_orders
      WHERE id = $1
      RETURNING
        id,
        order_number AS "orderNumber",
        customer_name AS "customerName",
        wilaya,
        status,
        employee_prepared AS "employeePrepared",
        driver_id AS "driverId",
        created_at AS "createdAt";
    `, [Number(id)]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    res.json({ deleted: rows[0], message: 'Order deleted successfully.' });
  } catch (error) {
    console.error('Logistics order deletion failed:', error);
    res.status(500).json({ error: 'Unable to delete logistics order', details: error.message });
  }
});

app.post('/api/sync/odbc-to-supabase', async (req, res) => {
  try {
    const warehouse = req.body?.warehouse || req.query?.warehouse || null;
    const synced = await syncOdbcToSupabase(warehouse);
    res.json({ ok: true, synced, warehouse, message: warehouse ? `ODBC inventory rows for ${warehouse} synced to Supabase.` : 'ODBC inventory rows synced to Supabase.' });
  } catch (error) {
    console.error('ODBC-to-Supabase sync failed:', error);
    res.status(500).json({ error: 'Unable to sync ODBC stock to Supabase', details: error.message });
  }
});

app.post('/api/inventory/reconcile', async (req, res) => {
  try {
    const { item_id, physical_qty, employee_id, notes } = req.body || {};

    if (!item_id || typeof physical_qty === 'undefined') {
      return res.status(400).json({ error: 'item_id and physical_qty are required.' });
    }

    const physicalQuantity = Number(physical_qty);
    if (!Number.isInteger(physicalQuantity) || physicalQuantity < 0) {
      return res.status(400).json({ error: 'physical_qty must be a whole number greater than or equal to zero.' });
    }

    const system_qty = await getSystemQuantityForItem(item_id);
    const itemRows = await getItemById(item_id);
    if (!itemRows.length) {
      return res.status(404).json({ error: 'Item not found.' });
    }
    const warehouseName = String(itemRows[0].warehouse_name || '').trim();
    const result = computeReconciliation({
      item_id,
      physical_qty: physicalQuantity,
      system_qty,
      employee_id: employee_id || 'unknown',
      notes: notes || '',
    });

    const auditInsert = `
      INSERT INTO audit_history (item_id, employee_id, notes, expected_qty, counted_qty, delta_qty, status, warehouse_name, direction, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW());
    `;

    await query(auditInsert, [
      Number(item_id),
      result.employee_id,
      result.notes,
      result.expected,
      result.counted,
      result.delta,
      result.status,
      warehouseName,
      result.direction,
    ]);

    await query(
      `INSERT INTO physical_counts
        (item_id, employee_id, notes, physical_quantity, expected_quantity, difference_quantity, status, warehouse_name, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW());`,
      [
        Number(item_id),
        result.employee_id,
        result.notes,
        result.counted,
        result.expected,
        result.delta,
        result.status,
        warehouseName,
      ],
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Reconciliation error:', error);
    res.status(500).json({ error: 'Unable to reconcile inventory', details: error.message });
  }
});

app.get('/api/inventory/items/:itemId/audit-history', async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ error: 'Item id must be a positive integer.' });
    }

    const history = await query(`
      SELECT
        audit.id,
        audit.expected_qty AS "systemQuantity",
        audit.counted_qty AS "enteredQuantity",
        audit.delta_qty AS "differenceQuantity",
        audit.status,
        audit.employee_id AS "employeeId",
        COALESCE(NULLIF(BTRIM(employee.name), ''), audit.employee_id, '—') AS "employeeName",
        audit.created_at AS "createdAt"
      FROM audit_history AS audit
      LEFT JOIN employees AS employee ON employee.employee_id = audit.employee_id
      WHERE audit.item_id = $1
      ORDER BY audit.created_at DESC
      LIMIT 50;
    `, [itemId]);

    res.json({ history, count: history.length });
  } catch (error) {
    console.error('Inventory audit history fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch item audit history', details: error.message });
  }
});

async function bootstrap() {
  try {
    await initializeDatabase();
    app.listen(config.app.port, () => {
      console.log(`Inventory API running on http://localhost:${config.app.port}`);
    });
  } catch (error) {
    console.warn('Database boot warning:', error.message);
    app.listen(config.app.port, () => {
      console.log(`Inventory API running on http://localhost:${config.app.port} (degraded mode)`);
    });
  }
}

bootstrap();
