const crypto = require('crypto');
const config = require('./config');

const ADMIN_TOKEN_TTL = 24 * 60 * 60 * 1000;
const ADMIN_TOKENS = new Map();

function getAuthToken(req) {
  const header = req.headers['authorization'];
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

async function userFromToken(db, token) {
  if (!token) return null;
  return db.get(
    'SELECT u.id, u.name, u.email, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?',
    [token]
  );
}

function registerSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.run('INSERT INTO sessions (token, user_id) VALUES (?, ?)', [token, userId]);
  return token;
}

function requireAdmin(req) {
  if (req.headers['x-admin'] === config.admin.key) return true;
  const token = getAuthToken(req);
  if (token && ADMIN_TOKENS.has(token)) {
    const createdAt = ADMIN_TOKENS.get(token);
    if (Date.now() - createdAt < ADMIN_TOKEN_TTL) return true;
    ADMIN_TOKENS.delete(token);
  }
  return false;
}

function issueAdminToken() {
  const token = crypto.randomBytes(32).toString('hex');
  ADMIN_TOKENS.set(token, Date.now());
  return token;
}

function revokeAdminToken(token) {
  if (token && ADMIN_TOKENS.has(token)) ADMIN_TOKENS.delete(token);
}

module.exports = {
  ADMIN_TOKENS,
  ADMIN_TOKEN_TTL,
  getAuthToken,
  userFromToken,
  registerSession,
  requireAdmin,
  issueAdminToken,
  revokeAdminToken,
};