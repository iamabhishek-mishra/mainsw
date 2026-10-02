const fs = require('fs');
const path = require('path');
const config = require('./config');

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT NOT NULL,
    slug    TEXT NOT NULL UNIQUE,
    image   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    mrp         REAL NOT NULL DEFAULT 0,
    price       REAL NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    image       TEXT NOT NULL DEFAULT '',
    stock       INTEGER NOT NULL DEFAULT 100,
    bestseller  INTEGER NOT NULL DEFAULT 0,
    status      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    phone           TEXT NOT NULL DEFAULT '',
    address         TEXT NOT NULL DEFAULT '',
    items           TEXT NOT NULL,
    total           REAL NOT NULL DEFAULT 0,
    user_id         INTEGER REFERENCES users(id),
    payment_method  TEXT NOT NULL DEFAULT 'cod',
    payment_status  TEXT NOT NULL DEFAULT 'pending',
    transaction_id  TEXT NOT NULL DEFAULT '',
    order_status    TEXT NOT NULL DEFAULT 'pending',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const MYSQL_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    image VARCHAR(500) NOT NULL DEFAULT ''
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category_id INT NOT NULL,
    mrp DOUBLE NOT NULL DEFAULT 0,
    price DOUBLE NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    image VARCHAR(500) NOT NULL DEFAULT '',
    stock INT NOT NULL DEFAULT 100,
    bestseller TINYINT(1) NOT NULL DEFAULT 0,
    status TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL DEFAULT '',
    address TEXT NOT NULL,
    items JSON NOT NULL,
    total DOUBLE NOT NULL DEFAULT 0,
    user_id INT NULL,
    payment_method VARCHAR(20) NOT NULL DEFAULT 'cod',
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    transaction_id VARCHAR(100) NOT NULL DEFAULT '',
    order_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token VARCHAR(64) PRIMARY KEY,
    user_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB`,
];

const SEED_CATEGORIES = [
  ['Health Care Product', 'health-care-product', '/img/categories/health-care-product.png'],
  ['Personal Care', 'personal-care', '/img/categories/personal-care.png'],
  ['Beauty Products', 'beauty-products', '/img/categories/beauty-products.jpg'],
  ['Mother and Baby Product', 'mother-and-baby', '/img/categories/mother-baby.jpg'],
  ['Medical Books', 'medical-books', '/img/categories/medical-books.png'],
  ['Health Care Devices', 'health-care-devices', '/img/categories/health-care-devices.png'],
  ['Hair Care', 'hair-care', '/img/categories/hair-care.jpeg'],
];

const SEED_PRODUCTS = [
  ['BJain Omeo Calendula Body Lotion', 'health-care-product', 190, 185,
    'Calendula body lotion by Omeo (BJain), a gentle homoeopathic skincare lotion that soothes and moisturises dry, irritated skin. Dermatologically safe for everyday use.',
    '/img/products/calendula-body-lotion.jpg', 100, 1],
  ['Omeo Silk and Shine Conditioner', 'hair-care', 105, 103,
    'Silk and shine conditioner from the Omeo range that detangles, nourishes and leaves hair soft, smooth and shiny without weighing it down.',
    '/img/products/silk-shine-conditioner.jpg', 100, 1],
  ['Omeo Berry Blossom Body Wash', 'beauty-products', 275, 269,
    'A refreshing berry blossom body wash that gently cleanses the skin with a delicate floral fragrance while keeping skin soft and hydrated.',
    '/img/products/berry-blossom-body-wash.jpg', 100, 1],
  ['BJain Omeo Calendula Foaming Face Wash', 'health-care-product', 265, 259,
    'Foaming face wash enriched with Calendula to gently cleanse, soothe and refresh sensitive skin. Suitable for all skin types.',
    '/img/products/calendula-face-wash.jpg', 100, 1],
  ['BJain Omeo Calendula Hand Wash', 'health-care-product', 99, 95,
    'A mild calendula hand wash that cleanses hands thoroughly while protecting natural skin moisture. Ideal for frequent hand washing.',
    '/img/products/calendula-hand-wash.jpg', 100, 0],
  ['BJain Omeo Aloe Vera Hand Sanitizer with Dispenser', 'personal-care', 270, 265,
    'Aloe vera based hand sanitizer with a convenient dispenser. Kills germs while the aloe vera soothes and moisturises the skin.',
    '/img/products/aloe-vera-sanitizer.jpg', 100, 0],
  ['Joy Skin Care', 'beauty-products', 190, 150,
    'Joy skin care range for all-round daily skin nourishment. Gentle on the skin and suitable for the whole family.',
    '/img/products/joy-skin-care.jpg', 100, 0],
  ['Evidence Based Research of Homoeopathy in Dermatology', 'medical-books', 1200, 1140,
    'A comprehensive reference book presenting evidence-based research of homoeopathy in dermatology. A valuable resource for practitioners and students.',
    '/img/products/homeo-dermatology.jpg', 50, 0],
  ['Evidence Based Research of Homoeopathy in Gynaecology', 'medical-books', 800, 760,
    'Detailed evidence-based research of homoeopathy in gynaecology, covering clinical studies and case compilations for modern homoeopathic practice.',
    '/img/products/homeo-gynaecology.jpg', 50, 0],
  ['Experimental Homoeopathy', 'medical-books', 1000, 950,
    'Experimental Homoeopathy - a classic guide detailing provings and experimental approaches in homoeopathy. An essential addition to any library.',
    '/img/products/experimental-homeopathy.jpg', 50, 0],
];

const ORDER_MIGRATE_COLUMNS = [
  ['user_id', 'INTEGER', 'INT NULL'],
  ['payment_method', "TEXT NOT NULL DEFAULT 'cod'", "VARCHAR(20) NOT NULL DEFAULT 'cod'"],
  ['payment_status', "TEXT NOT NULL DEFAULT 'pending'", "VARCHAR(20) NOT NULL DEFAULT 'pending'"],
  ['transaction_id', "TEXT NOT NULL DEFAULT ''", "VARCHAR(100) NOT NULL DEFAULT ''"],
  ['order_status', "TEXT NOT NULL DEFAULT 'pending'", "VARCHAR(20) NOT NULL DEFAULT 'pending'"],
];

let _db = null;

class DB {
  constructor() {
    this.driver = config.db.driver === 'mysql' ? 'mysql' : 'sqlite';
  }

  async init() {
    if (this.driver === 'mysql') {
      const mysql = require('mysql2/promise');
      this.pool = mysql.createPool({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: config.db.name,
        charset: 'utf8mb4',
        connectionLimit: 10,
        waitForConnections: true,
      });
      for (const stmt of MYSQL_SCHEMA) {
        await this.pool.execute(stmt);
      }
    } else {
      const Database = require('better-sqlite3');
      fs.mkdirSync(path.dirname(config.DB_FILE), { recursive: true });
      this.sqlite = new Database(config.DB_FILE);
      this.sqlite.pragma('foreign_keys = ON');
      this.sqlite.exec(SQLITE_SCHEMA);
    }

    const count = await this.get('SELECT COUNT(*) AS n FROM categories');
    if (Number(count.n) === 0) await this.seed();
    await this.migrateOrders();
  }

  async seed() {
    for (const [name, slug, image] of SEED_CATEGORIES) {
      await this.run('INSERT INTO categories (name, slug, image) VALUES (?, ?, ?)', [name, slug, image]);
    }
    for (const [name, catSlug, mrp, price, desc, image, stock, best] of SEED_PRODUCTS) {
      const c = await this.get('SELECT id FROM categories WHERE slug = ?', [catSlug]);
      if (c) {
        await this.run(
          'INSERT INTO products (name, category_id, mrp, price, description, image, stock, bestseller) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [name, c.id, mrp, price, desc, image, stock, best]
        );
      }
    }
  }

  async migrateOrders() {
    const existing = await this.columns('orders');
    for (const [col, sqliteDecl, mysqlDecl] of ORDER_MIGRATE_COLUMNS) {
      if (!existing.has(col)) {
        const decl = this.driver === 'mysql' ? mysqlDecl : sqliteDecl;
        await this.run(`ALTER TABLE orders ADD COLUMN ${col} ${decl}`);
      }
    }
  }

  async columns(table) {
    if (this.driver === 'mysql') {
      const [rows] = await this.pool.execute(`SHOW COLUMNS FROM ${table}`);
      return new Set(rows.map((r) => r.Field));
    }
    const rows = this.sqlite.prepare(`PRAGMA table_info(${table})`).all();
    return new Set(rows.map((r) => r.name));
  }

  normalize(value) {
    if (Array.isArray(value)) return value.map((v) => this.normalize(v));
    if (value instanceof Date) return formatDate(value);
    if (typeof value === 'bigint') return Number(value);
    if (Buffer.isBuffer(value)) return value.toString('base64');
    if (value && typeof value === 'object') {
      const out = {};
      for (const k of Object.keys(value)) out[k] = this.normalize(value[k]);
      return out;
    }
    return value;
  }

  async all(sql, params = []) {
    if (this.driver === 'mysql') {
      const [rows] = await this.pool.execute(sql, params);
      return this.normalize(rows);
    }
    return this.normalize(this.sqlite.prepare(sql).all(...params));
  }

  async get(sql, params = []) {
    if (this.driver === 'mysql') {
      const [rows] = await this.pool.execute(sql, params);
      return rows.length ? this.normalize(rows[0]) : null;
    }
    const row = this.sqlite.prepare(sql).get(...params);
    return row === undefined ? null : this.normalize(row);
  }

  async run(sql, params = []) {
    if (this.driver === 'mysql') {
      const [res] = await this.pool.execute(sql, params);
      return { lastID: res.insertId, changes: res.affectedRows };
    }
    const info = this.sqlite.prepare(sql).run(...params);
    return { lastID: Number(info.lastInsertRowid), changes: info.changes };
  }

  async close() {
    if (this.driver === 'mysql') await this.pool.end();
    else this.sqlite.close();
  }
}

function formatDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function getDb() {
  return _db;
}

function setDb(db) {
  _db = db;
}

module.exports = { DB, getDb, setDb };