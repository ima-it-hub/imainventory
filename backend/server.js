const express = require('express');
const cors = require('cors');
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
  getLogisticsOrderDetailsFromOdbc,
} = require('./src/services/odbc');
const { computeReconciliation } = require('./src/lib/reconciliation');
const { initializeDatabase } = require('./src/services/init-db');
const { ADMIN_CREDENTIALS, sanitizeAllowedPages, VALID_PAGES } = require('./src/lib/access');
const config = require('./src/config');

const app = express();
app.use(cors({
  origin(origin, callback) {
    const isRenderFrontend = /^https:\/\/[a-z0-9-]+\.onrender\.com$/i.test(origin || '');
    callback(null, !origin || origin === config.app.corsOrigin || isRenderFrontend);
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

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
    const warehouses = (rows || []).map((row) => String(row.warehouse_name).trim()).filter(Boolean);
    res.json({ warehouses, count: warehouses.length });
  } catch (error) {
    console.error('Warehouses fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch warehouse list', details: error.message });
  }
});

app.get('/api/assets', async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        a.id,
        a.name,
        a.category_id AS "categoryId",
        c.name AS "categoryName",
        a.quantity,
        a.place_id AS "placeId",
        p.name AS "placeName",
        a.purchase_value AS "purchaseValue",
        a.current_value AS "currentValue",
        a.repair_status AS "repairStatus",
        a.created_at AS "createdAt",
        a.updated_at AS "updatedAt"
      FROM assets a
      JOIN asset_categories c ON c.id = a.category_id
      JOIN asset_places p ON p.id = a.place_id
      ORDER BY a.name ASC, a.id ASC;
    `);
    res.json({ assets: rows, count: rows.length });
  } catch (error) {
    console.error('Assets fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch assets', details: error.message });
  }
});

app.get('/api/asset-categories', async (_req, res) => {
  try {
    const categories = await query(`
      SELECT c.id, c.name, COUNT(a.id)::integer AS "assetCount"
      FROM asset_categories c
      LEFT JOIN assets a ON a.category_id = c.id
      GROUP BY c.id
      ORDER BY c.name ASC;
    `);
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
      || !['Réparable', 'Irréparable'].includes(normalizedRepairStatus)) {
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
      || !['Réparable', 'Irréparable'].includes(normalizedRepairStatus)) {
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
    if (!['Réparable', 'Irréparable'].includes(repairStatus)) {
      return res.status(400).json({ error: 'Choose Réparable or Irréparable.' });
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
      'SELECT id, username, password, full_name, role, allowed_pages FROM users WHERE username = $1 LIMIT 1;',
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
    };

    res.json({ user: safeUser, message: 'Login successful.' });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Unable to authenticate user', details: error.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const rows = await query('SELECT id, username, full_name, role, allowed_pages FROM users ORDER BY username ASC;');
    const users = rows.map((user) => ({
      id: user.id,
      username: user.username,
      fullName: user.full_name || user.username,
      role: user.role || 'user',
      allowedPages: Array.isArray(user.allowed_pages) ? sanitizeAllowedPages(user.allowed_pages) : [],
    }));

    res.json({ users, count: users.length });
  } catch (error) {
    console.error('Users fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch users', details: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, fullName, role, allowedPages } = req.body || {};
    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '').trim();

    if (!cleanUsername || !cleanPassword) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const safeAllowedPages = sanitizeAllowedPages(allowedPages || []);
    const row = await query(`
      INSERT INTO users (username, password, full_name, role, allowed_pages)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, full_name, role, allowed_pages;
    `, [cleanUsername, cleanPassword, String(fullName || '').trim() || cleanUsername, String(role || 'user').trim() || 'user', safeAllowedPages]);

    const user = row[0];
    res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name || user.username,
        role: user.role || 'user',
        allowedPages: Array.isArray(user.allowed_pages) ? sanitizeAllowedPages(user.allowed_pages) : [],
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
    const { username, fullName, role, allowedPages, password } = req.body || {};
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

    if (password && String(password).trim()) {
      updates.push('password = $' + (params.length + 1));
      params.push(String(password).trim());
    }

    const row = await query(`
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${params.length + 1}
      RETURNING id, username, full_name, role, allowed_pages;
    `, [...params, Number(id)]);

    const user = row[0];
    res.json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name || user.username,
        role: user.role || 'user',
        allowedPages: Array.isArray(user.allowed_pages) ? sanitizeAllowedPages(user.allowed_pages) : [],
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
    const rows = await query(`
      SELECT
        lo.id,
        lo.order_number AS "orderNumber",
        lo.customer_name AS "customerName",
        lo.wilaya,
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
        COALESCE(prepared_employee.name, lo.employee_prepared) AS "preparedBy",
        counts.controller_employee_id AS "controllerEmployeeId",
        COALESCE(controller_employee.name, counts.controller_employee_id) AS "controlledBy",
        lo.driver_id AS "driverId",
        d.name AS "driverName",
        lo.created_at AS "createdAt"
      FROM logistics_orders lo
      LEFT JOIN drivers d ON d.id = lo.driver_id
      LEFT JOIN employees prepared_employee ON prepared_employee.employee_id = lo.employee_prepared
      LEFT JOIN logistics_order_physical_counts counts ON counts.order_number = lo.order_number
      LEFT JOIN employees controller_employee ON controller_employee.employee_id = counts.controller_employee_id
      ORDER BY lo.created_at DESC;
    `);

    res.json({ orders: rows, count: rows.length });
  } catch (error) {
    console.error('Logistics orders fetch failed:', error);
    res.status(500).json({ error: 'Unable to fetch logistics orders', details: error.message });
  }
});

app.get('/api/logistics/orders/:orderNumber/details', async (req, res) => {
  try {
    const orderNumber = String(req.params.orderNumber);
    const [odbcDetails, savedRows] = await Promise.all([
      getLogisticsOrderDetailsFromOdbc(orderNumber),
      query('SELECT physical_quantities, control_quantities FROM logistics_order_physical_counts WHERE order_number = $1', [orderNumber]),
    ]);
    const savedQuantities = savedRows[0]?.physical_quantities || {};
    const savedControlQuantities = savedRows[0]?.control_quantities || {};
    const details = odbcDetails.map((detail) => {
      const detailKey = JSON.stringify([
        String(detail.Document ?? ''),
        String(detail.Batch ?? ''),
        String(detail.Label1 ?? ''),
        String(detail.Quantity ?? ''),
      ]);

      return {
        ...detail,
        detailKey,
        physicalQuantity: savedQuantities[detailKey] ?? '',
        controlQuantity: savedControlQuantities[detailKey] ?? '',
      };
    });
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

app.put('/api/logistics/orders/:orderNumber/physical-counts', async (req, res) => {
  try {
    const orderNumber = String(req.params.orderNumber);
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
      WITH updated_order AS (
        UPDATE logistics_orders
        SET employee_prepared = CASE
          WHEN $3 <> '' THEN $3
          ELSE employee_prepared
        END
        WHERE order_number = $1
        RETURNING employee_prepared AS "employeePrepared"
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
        updated_order."employeePrepared"
      FROM saved_counts
      CROSS JOIN updated_order;
    `, [orderNumber, JSON.stringify(physicalQuantities), assignedEmployee, JSON.stringify(controlQuantities), assignedController]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    res.json({
      ok: true,
      updatedAt: rows[0].updatedAt,
      employeePrepared: rows[0].employeePrepared,
      controllerEmployeeId: rows[0].controllerEmployeeId,
    });
  } catch (error) {
    console.error('Logistics order physical quantities save failed:', error);
    res.status(500).json({ error: 'Unable to save physical quantities', details: error.message });
  }
});

app.post('/api/logistics/orders', async (req, res) => {
  try {
    const { orderNumber, customerName, wilaya, status, employeePrepared, createdAt, driverId } = req.body || {};

    if (!orderNumber || !customerName || !wilaya || !employeePrepared) {
      return res.status(400).json({ error: 'Order number, customer, wilaya, and employee are required.' });
    }

    const created = createdAt || new Date().toISOString();
    const insertion = await query(`
      INSERT INTO logistics_orders (order_number, customer_name, wilaya, status, employee_prepared, driver_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        order_number AS "orderNumber",
        customer_name AS "customerName",
        wilaya,
        status,
        employee_prepared AS "employeePrepared",
        driver_id AS "driverId",
        created_at AS "createdAt";
    `, [String(orderNumber).trim(), String(customerName).trim(), String(wilaya).trim(), String(status || 'Pending').trim(), String(employeePrepared).trim(), driverId ? Number(driverId) : null, created]);

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
    const rows = await getLogisticsOrdersFromOdbc();
    let inserted = 0;

    for (const row of rows || []) {
      const orderNumber = String(
        row.Reference ||
        row.reference ||
        row.Oid ||
        row.oid ||
        ''
      ).trim();

      const customerName = String(
        row['Label1'] ||
        row.label1 ||
        row['ThirdPartyLabel'] ||
        row.thirdPartyLabel ||
        row['Customer'] ||
        row.customer ||
        'Unknown customer'
      ).trim();

      const wilaya = String(
        row['Wilaya'] ||
        row.wilaya ||
        'Unknown'
      ).trim();

      const createdValue = row.Date || row.date || row['Date'];
      const createdAt = createdValue ? new Date(createdValue).toISOString() : new Date().toISOString();

      if (!orderNumber || !customerName || !wilaya) {
        continue;
      }

      const result = await query(`
        INSERT INTO logistics_orders (order_number, customer_name, wilaya, status, employee_prepared, driver_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (order_number) DO UPDATE
        SET wilaya = EXCLUDED.wilaya
        WHERE logistics_orders.wilaya IS DISTINCT FROM EXCLUDED.wilaya
        RETURNING id;
      `, [orderNumber, customerName, wilaya, 'Pending', null, null, createdAt]);

      if (result.length) {
        inserted += 1;
      }
    }

    const allOrders = await query(`
      SELECT
        id,
        order_number AS "orderNumber",
        customer_name AS "customerName",
        wilaya,
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

    res.json({ ok: true, count: inserted, orders: allOrders, message: `Synced ${inserted} logistics orders from ODBC.` });
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
      if (normalizedStatus === 'Ready') {
        updates.push('ready_at = COALESCE(ready_at, NOW())');
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
