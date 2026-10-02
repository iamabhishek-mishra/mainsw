const crypto = require('crypto');

const ITERATIONS = 100000;
const KEYLEN = 32;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto
    .pbkdf2Sync(String(password), Buffer.from(salt, 'hex'), ITERATIONS, KEYLEN, 'sha256')
    .toString('hex');
  return `${salt}$${digest}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 2) return false;
  const [salt, digest] = parts;
  try {
    const check = crypto
      .pbkdf2Sync(String(password), Buffer.from(salt, 'hex'), ITERATIONS, KEYLEN, 'sha256')
      .toString('hex');
    const a = Buffer.from(check, 'hex');
    const b = Buffer.from(digest, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };