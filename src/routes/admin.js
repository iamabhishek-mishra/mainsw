const express = require('express');
const { getDb } = require('../db');
const config = require('../config');
const {
  getAuthToken,
  requireAdmin,
  issueAdminToken,
  revokeAdminToken,
} = require('../auth');

const router = express.Router();
const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

function adminOnly(req, res, next) {
  if (requireAdmin(req)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function validateProduct(data) {
  const name = String(data.name || '').trim();
  if (!name) return [null, 'Product name is required'];
  const categoryId = parseInt(data.category_id, 10);
  if (!Number.isInteger(categoryId)) return [null, 'Category is required'];
  const mrp = Number.parseFloat(data.mrp === undefined ? 0 : data.mrp);
  const price = Number.parseFloat(data.price === undefined ? 0 : data.price);
  if (Number.isNaN(mrp) || Number.isNaN(price)) return [null, 'Prices must be numbers'];
  const description = String(data.description || '').trim();
  const image = String(data.image || '').trim() || '/img/placeholder.png';
  let stock = Number.parseInt(data.stock === undefined ? 100 : data.stock, 10);
  if (Number.isNaN(stock)) stock = 100;
  const bestseller = data.bestseller ? 1 : 0;
  return [
    { name, category_id: categoryId, mrp, price, description, image, stock, bestseller },
    null,
  ];
}

router.post('/admin/login', async (req, res) => {
  const data = req.body || {};
  const username = String(data.username || '').trim();
  const password = String(data.password || '');
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (username === config.admin.username && password === config.admin.password) {
    const token = issueAdminToken();
    return res.json({ token, username });
  }
  return res.status(401).json({ error: 'Invalid admin credentials' });
});

router.post('/admin/logout', async (req, res) => {
  revokeAdminToken(getAuthToken(req));
  res.json({ ok: true });
});

router.get('/users', adminOnly, async (req, res) => {
  const rows = await getDb().all(
    'SELECT u.id, u.name, u.email, u.created_at, ' +
    '(SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count, ' +
    '(SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.user_id = u.id) AS order_total ' +
    'FROM users u ORDER BY u.id DESC'
  );
  res.json(rows);
});

router.get('/orders', adminOnly, async (req, res) => {
  const rows = await getDb().all('SELECT * FROM orders ORDER BY id DESC');
  res.json(rows);
});

router.put('/orders/:id/status', adminOnly, async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const status = String((req.body || {}).status || '').trim().toLowerCase();
  if (!ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Choose: ${ORDER_STATUSES.join(', ')}` });
  }
  const existing = await db.get('SELECT * FROM orders WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Order not found' });
  await db.run('UPDATE orders SET order_status = ? WHERE id = ?', [status, id]);
  res.json({ ok: true, order_id: id, order_status: status });
});

router.post('/products', adminOnly, async (req, res) => {
  const db = getDb();
  const [product, err] = validateProduct(req.body || {});
  if (err) return res.status(400).json({ error: err });
  const info = await db.run(
    'INSERT INTO products (name, category_id, mrp, price, description, image, stock, bestseller, status) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
    [
      product.name,
      product.category_id,
      product.mrp,
      product.price,
      product.description,
      product.image,
      product.stock,
      product.bestseller,
    ]
  );
  const pid = Number(info.lastID);
  const row = await db.get(
    'SELECT p.*, c.name AS category_name FROM products p ' +
    'JOIN categories c ON c.id = p.category_id WHERE p.id = ?',
    [pid]
  );
  res.status(201).json(row);
});

router.put('/products/:id', adminOnly, async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const existing = await db.get('SELECT * FROM products WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const [product, err] = validateProduct(req.body || {});
  if (err) return res.status(400).json({ error: err });
  await db.run(
    'UPDATE products SET name = ?, category_id = ?, mrp = ?, price = ?, description = ?, ' +
    'image = ?, stock = ?, bestseller = ? WHERE id = ?',
    [
      product.name,
      product.category_id,
      product.mrp,
      product.price,
      product.description,
      product.image,
      product.stock,
      product.bestseller,
      id,
    ]
  );
  const row = await db.get(
    'SELECT p.*, c.name AS category_name FROM products p ' +
    'JOIN categories c ON c.id = p.category_id WHERE p.id = ?',
    [id]
  );
  res.json(row);
});

router.delete('/products/:id', adminOnly, async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const info = await db.run('DELETE FROM products WHERE id = ?', [id]);
  if (info.changes === 0) return res.status(404).json({ error: 'Product not found' });
  res.json({ ok: true, deleted: id });
});

module.exports = router;