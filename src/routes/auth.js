const express = require('express');
const { getDb } = require('../db');
const { getAuthToken, userFromToken, registerSession } = require('../auth');
const { hashPassword, verifyPassword } = require('../hash');

const router = express.Router();

function isIntegrityError(e) {
  const info = [e && e.code, e && e.errno, e && e.message].filter(Boolean).join(' ');
  return /UNIQUE|DUPLICATE|ER_DUP_ENTRY|SQLITE_CONSTRAINT/i.test(info);
}

router.post('/auth/register', async (req, res) => {
  const db = getDb();
  const data = req.body || {};
  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  const password = String(data.password || '');

  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists. Please login instead.' });
  }

  let uid;
  try {
    const info = await db.run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [
      name,
      email,
      hashPassword(password),
    ]);
    uid = Number(info.lastID);
  } catch (e) {
    if (isIntegrityError(e)) {
      return res.status(409).json({ error: 'An account with this email already exists. Please login instead.' });
    }
    throw e;
  }

  const token = registerSession(db, uid);
  const user = await db.get('SELECT id, name, email, created_at FROM users WHERE id = ?', [uid]);
  return res.status(201).json({ user, token });
});

router.post('/auth/login', async (req, res) => {
  const db = getDb();
  const data = req.body || {};
  const email = String(data.email || '').trim().toLowerCase();
  const password = String(data.password || '');

  const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = registerSession(db, user.id);
  return res.json({
    user: { id: user.id, name: user.name, email: user.email, created_at: user.created_at },
    token,
  });
});

router.post('/auth/logout', async (req, res) => {
  const db = getDb();
  const token = getAuthToken(req);
  if (token) await db.run('DELETE FROM sessions WHERE token = ?', [token]);
  res.json({ ok: true });
});

router.get('/auth/me', async (req, res) => {
  const db = getDb();
  const user = await userFromToken(db, getAuthToken(req));
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  res.json(user);
});

module.exports = router;