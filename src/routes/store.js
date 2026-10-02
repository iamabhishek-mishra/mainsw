const express = require('express');
const { getDb } = require('../db');
const { getAuthToken, userFromToken } = require('../auth');
const { sendOrderConfirmationEmail } = require('../mailer');

const router = express.Router();
const PAYMENT_METHODS = ['cod', 'upi'];

router.get('/health', async (req, res) => {
  res.json({ ok: true });
});

router.get('/categories', async (req, res) => {
  const rows = await getDb().all(
    'SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 1) AS product_count ' +
    'FROM categories c ORDER BY c.id'
  );
  res.json(rows);
});

router.get('/products', async (req, res) => {
  const category = String(req.query.category || '');
  const search = String(req.query.search || '').toLowerCase();
  const bestseller = String(req.query.bestseller || '0');
  let sql =
    'SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p ' +
    'JOIN categories c ON c.id = p.category_id WHERE p.status = 1';
  const params = [];
  if (category) {
    sql += ' AND c.slug = ?';
    params.push(category);
  }
  if (search) {
    sql += ' AND (lower(p.name) LIKE ? OR lower(p.description) LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (bestseller === '1') sql += ' AND p.bestseller = 1';
  sql += ' ORDER BY p.bestseller DESC, p.id DESC';
  const rows = await getDb().all(sql, params);
  res.json(rows);
});

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const rows = await getDb().all(
    'SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p ' +
    'JOIN categories c ON c.id = p.category_id WHERE p.status = 1 AND ' +
    '(lower(p.name) LIKE ? OR lower(p.description) LIKE ?) ' +
    'ORDER BY p.bestseller DESC, p.id DESC LIMIT 20',
    [`%${q}%`, `%${q}%`]
  );
  res.json(rows);
});

router.get('/products/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await getDb().get(
    'SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p ' +
    'JOIN categories c ON c.id = p.category_id WHERE p.id = ? AND p.status = 1',
    [id]
  );
  if (!row) return res.status(404).json({ error: 'Product not found' });
  res.json(row);
});

router.get('/myorders', async (req, res) => {
  const db = getDb();
  const user = await userFromToken(db, getAuthToken(req));
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  const rows = await db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC', [user.id]);
  res.json(rows);
});

router.get('/orders/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await getDb().get('SELECT * FROM orders WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ error: 'Order not found' });
  res.json(row);
});

router.post('/orders', async (req, res) => {
  const db = getDb();
  const data = req.body || {};
  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim();
  const phone = String(data.phone || '').trim();
  const address = String(data.address || '').trim();
  const items = Array.isArray(data.items) ? data.items : [];
  let paymentMethod = String(data.payment_method || 'cod').trim().toLowerCase();
  if (!PAYMENT_METHODS.includes(paymentMethod)) paymentMethod = 'cod';

  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  if (items.length === 0) return res.status(400).json({ error: 'Cart is empty' });

  const user = await userFromToken(db, getAuthToken(req));
  let total = 0;
  for (const it of items) {
    const row = await db.get('SELECT * FROM products WHERE id = ? AND status = 1', [it.id]);
    if (!row) return res.status(400).json({ error: `Product ${it.id} not found` });
    const qty = Math.max(1, parseInt(it.qty, 10) || 1);
    total += row.price * qty;
  }
  const totalRounded = Math.round(total * 100) / 100;
  const paymentStatus = paymentMethod === 'cod' ? 'cod' : 'pending';

  let sql;
  let params;
  if (user) {
    sql = 'INSERT INTO orders (name, email, phone, address, items, total, user_id, payment_method, payment_status) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    params = [name, email, phone, address, JSON.stringify(items), totalRounded, user.id, paymentMethod, paymentStatus];
  } else {
    sql = 'INSERT INTO orders (name, email, phone, address, items, total, payment_method, payment_status) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    params = [name, email, phone, address, JSON.stringify(items), totalRounded, paymentMethod, paymentStatus];
  }
  const info = await db.run(sql, params);
  const orderId = Number(info.lastID);
  const order = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);

  let emailStatus = null;
  if (paymentMethod === 'cod') {
    emailStatus = await sendOrderConfirmationEmail(order);
  }
  return res.status(201).json({
    ok: true,
    order_id: orderId,
    total: totalRounded,
    payment_method: paymentMethod,
    email: emailStatus,
  });
});

module.exports = router;