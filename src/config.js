const path = require('path');
require('dotenv').config();

const BASE_DIR = path.join(__dirname, '..');

function env(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === null ? fallback : String(v).trim();
}

module.exports = {
  BASE_DIR,
  PUBLIC_DIR: path.join(BASE_DIR, 'public'),
  DB_FILE: env('DB_FILE', path.join(BASE_DIR, 'data.db')),
  port: Number(env('PORT', '3000')),
  host: env('HOST', '0.0.0.0'),
  admin: {
    username: env('ADMIN_USERNAME', 'admin'),
    password: env('ADMIN_PASSWORD', 'sudha@123'),
    key: env('ADMIN_KEY', 'sudha'),
  },
  smtp() {
    const port = Number(env('SMTP_PORT', '587'));
    const secure = env('SMTP_SECURE', '').toLowerCase();
    let resolved;
    if (secure === 'true') resolved = true;
    else if (secure === 'false') resolved = false;
    else resolved = port === 465;
    return {
      host: env('SMTP_HOST'),
      port,
      user: env('SMTP_USER'),
      password: env('SMTP_PASSWORD', env('SMTP_PASS')),
      from: env('SMTP_FROM', env('EMAIL_FROM', 'Sudha Wellness <noreply@sudhawellness.com>')),
      secure: resolved,
      logDir: env('SMTP_LOG_DIR'),
    };
  },
  phonepe() {
    return {
      merchantId: env('PHONEPE_MERCHANT_ID'),
      saltKey: env('PHONEPE_SALT_KEY'),
      saltIndex: env('PHONEPE_SALT_INDEX', '1'),
      env: env('PHONEPE_ENV', 'TEST').toUpperCase(),
      redirectUri: env('PHONEPE_REDIRECT_URI'),
    };
  },
  db: {
    driver: env('DB_DRIVER', 'sqlite').toLowerCase(),
    host: env('DB_HOST', '127.0.0.1'),
    port: Number(env('DB_PORT', '3306')),
    user: env('DB_USER', 'root'),
    password: env('DB_PASSWORD'),
    name: env('DB_NAME', 'sudha_wellness'),
  },
};