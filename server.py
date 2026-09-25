import datetime
import json
import mimetypes
import os
import re
import sys
import urllib.parse
from decimal import Decimal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
SCHEMA_SQL_MYSQL = os.path.join(BASE_DIR, "schema.sql")

SCHEMA = """
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
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    phone      TEXT NOT NULL DEFAULT '',
    address    TEXT NOT NULL DEFAULT '',
    items      TEXT NOT NULL,
    total      REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

SEED_CATEGORIES = [
    ("Health Care Product", "health-care-product", "/img/categories/health-care-product.png"),
    ("Personal Care", "personal-care", "/img/categories/personal-care.png"),
    ("Beauty Products", "beauty-products", "/img/categories/beauty-products.jpg"),
    ("Mother and Baby Product", "mother-and-baby", "/img/categories/mother-baby.jpg"),
    ("Medical Books", "medical-books", "/img/categories/medical-books.png"),
    ("Health Care Devices", "health-care-devices", "/img/categories/health-care-devices.png"),
    ("Hair Care", "hair-care", "/img/categories/hair-care.jpeg"),
]

SEED_PRODUCTS = [
    ("BJain Omeo Calendula Body Lotion", "health-care-product", 190, 185,
     "Calendula body lotion by Omeo (BJain), a gentle homoeopathic skincare lotion that soothes and moisturises dry, irritated skin. Dermatologically safe for everyday use.",
     "/img/products/calendula-body-lotion.jpg", 100, 1),
    ("Omeo Silk and Shine Conditioner", "hair-care", 105, 103,
     "Silk and shine conditioner from the Omeo range that detangles, nourishes and leaves hair soft, smooth and shiny without weighing it down.",
     "/img/products/silk-shine-conditioner.jpg", 100, 1),
    ("Omeo Berry Blossom Body Wash", "beauty-products", 275, 269,
     "A refreshing berry blossom body wash that gently cleanses the skin with a delicate floral fragrance while keeping skin soft and hydrated.",
     "/img/products/berry-blossom-body-wash.jpg", 100, 1),
    ("BJain Omeo Calendula Foaming Face Wash", "health-care-product", 265, 259,
     "Foaming face wash enriched with Calendula to gently cleanse, soothe and refresh sensitive skin. Suitable for all skin types.",
     "/img/products/calendula-face-wash.jpg", 100, 1),
    ("BJain Omeo Calendula Hand Wash", "health-care-product", 99, 95,
     "A mild calendula hand wash that cleanses hands thoroughly while protecting natural skin moisture. Ideal for frequent hand washing.",
     "/img/products/calendula-hand-wash.jpg", 100, 0),
    ("BJain Omeo Aloe Vera Hand Sanitizer with Dispenser", "personal-care", 270, 265,
     "Aloe vera based hand sanitizer with a convenient dispenser. Kills germs while the aloe vera soothes and moisturises the skin.",
     "/img/products/aloe-vera-sanitizer.jpg", 100, 0),
    ("Joy Skin Care", "beauty-products", 190, 150,
     "Joy skin care range for all-round daily skin nourishment. Gentle on the skin and suitable for the whole family.",
     "/img/products/joy-skin-care.jpg", 100, 0),
    ("Evidence Based Research of Homoeopathy in Dermatology", "medical-books", 1200, 1140,
     "A comprehensive reference book presenting evidence-based research of homoeopathy in dermatology. A valuable resource for practitioners and students.",
     "/img/products/homeo-dermatology.jpg", 50, 0),
    ("Evidence Based Research of Homoeopathy in Gynaecology", "medical-books", 800, 760,
     "Detailed evidence-based research of homoeopathy in gynaecology, covering clinical studies and case compilations for modern homoeopathic practice.",
     "/img/products/homeo-gynaecology.jpg", 50, 0),
    ("Experimental Homoeopathy", "medical-books", 1000, 950,
     "Experimental Homoeopathy - a classic guide detailing provings and experimental approaches in homoeopathy. An essential addition to any library.",
     "/img/products/experimental-homeopathy.jpg", 50, 0),
]


def get_admin_key():
    db.load_env()
    return os.environ.get("ADMIN_KEY", "sudha")


def get_db():
    return db.DB()


def init_db():
    conn = get_db()
    if conn.driver == "mysql":
        with open(SCHEMA_SQL_MYSQL) as f:
            conn.executescript(f.read())
    else:
        conn.executescript(SCHEMA)
    count = conn.fetchone("SELECT COUNT(*) AS n FROM categories")["n"]
    if count == 0:
        for name, slug, image in SEED_CATEGORIES:
            conn.execute(
                "INSERT INTO categories (name, slug, image) VALUES (?, ?, ?)",
                (name, slug, image),
            )
        for name, cat_slug, mrp, price, desc, image, stock, best in SEED_PRODUCTS:
            cid = conn.fetchone("SELECT id FROM categories WHERE slug = ?", (cat_slug,))
            conn.execute(
                "INSERT INTO products (name, category_id, mrp, price, description, image, stock, bestseller) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (name, cid["id"], mrp, price, desc, image, stock, best),
            )
        conn.commit()
    conn.close()


def row_to_dict(row):
    return dict(row)


def normalize(obj):
    """Make values JSON-serializable on both SQLite and MySQL (Decimal, datetime)."""
    if isinstance(obj, dict):
        return {k: normalize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [normalize(v) for v in obj]
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.strftime("%Y-%m-%d %H:%M:%S")
    return obj


class Handler(BaseHTTPRequestHandler):
    server_version = "SudhaWellness/2.0"

    # ---------- helpers ----------
    def _send_json(self, obj, status=200):
        body = json.dumps(normalize(obj)).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, msg, status=400):
        self._send_json({"error": msg}, status)

    def _send_file(self, path):
        if not os.path.isfile(path):
            self._send_error_json("File not found", 404)
            return
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        with open(path, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=3600")
        self.end_headers()
        self.wfile.write(data)

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def _query(self, name, default=""):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        vals = qs.get(name, [])
        return vals[0] if vals else default

    # ---------- routing ----------
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            return self._send_json({"ok": True})

        if path == "/api/categories":
            return self._categories()

        if path == "/api/products":
            return self._products()

        if path.startswith("/api/products/"):
            return self._product_detail(path)

        if path == "/api/orders" and self.headers.get("X-Admin") == get_admin_key():
            return self._orders()

        if path.startswith("/api/search"):
            return self._search()

        return self._static(path)

    def do_POST(self):
        if self.path == "/api/products":
            return self._create_product()
        if self.path == "/api/orders":
            return self._create_order()
        self._send_error_json("Not found", 404)

    def do_PUT(self):
        m = re.match(r"^/api/products/(\d+)$", self.path)
        if m:
            return self._update_product(int(m.group(1)))
        self._send_error_json("Not found", 404)

    def do_DELETE(self):
        m = re.match(r"^/api/products/(\d+)$", self.path)
        if m:
            return self._delete_product(int(m.group(1)))
        self._send_error_json("Not found", 404)

    # ---------- API handlers ----------
    def _categories(self):
        conn = get_db()
        rows = conn.fetchall(
            "SELECT c.*, "
            "(SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 1) AS product_count "
            "FROM categories c ORDER BY c.id"
        )
        conn.close()
        self._send_json([row_to_dict(r) for r in rows])

    def _products(self):
        conn = get_db()
        category = self._query("category")
        search = self._query("search").lower()
        bestseller = self._query("bestseller", "0")
        sql = (
            "SELECT p.*, c.name AS category_name, c.slug AS category_slug "
            "FROM products p JOIN categories c ON c.id = p.category_id "
            "WHERE p.status = 1"
        )
        params = []
        if category:
            sql += " AND c.slug = ?"
            params.append(category)
        if search:
            sql += " AND (lower(p.name) LIKE ? OR lower(p.description) LIKE ?)"
            params.append(f"%{search}%")
            params.append(f"%{search}%")
        if bestseller == "1":
            sql += " AND p.bestseller = 1"
        sql += " ORDER BY p.bestseller DESC, p.id DESC"
        rows = conn.fetchall(sql, params)
        conn.close()
        self._send_json([row_to_dict(r) for r in rows])

    def _product_detail(self, path):
        m = re.match(r"^/api/products/(\d+)$", path)
        conn = get_db()
        row = conn.fetchone(
            "SELECT p.*, c.name AS category_name, c.slug AS category_slug "
            "FROM products p JOIN categories c ON c.id = p.category_id "
            "WHERE p.id = ? AND p.status = 1",
            (int(m.group(1)),),
        )
        conn.close()
        if not row:
            return self._send_error_json("Product not found", 404)
        self._send_json(row_to_dict(row))

    def _search(self):
        q = self._query("q").lower()
        conn = get_db()
        rows = conn.fetchall(
            "SELECT p.*, c.name AS category_name, c.slug AS category_slug "
            "FROM products p JOIN categories c ON c.id = p.category_id "
            "WHERE p.status = 1 AND (lower(p.name) LIKE ? OR lower(p.description) LIKE ?) "
            "ORDER BY p.bestseller DESC, p.id DESC LIMIT 20",
            (f"%{q}%", f"%{q}%"),
        )
        conn.close()
        self._send_json([row_to_dict(r) for r in rows])

    def _orders(self):
        conn = get_db()
        rows = conn.fetchall("SELECT * FROM orders ORDER BY id DESC")
        conn.close()
        self._send_json([row_to_dict(r) for r in rows])

    def _require_admin(self):
        if self.headers.get("X-Admin") != get_admin_key():
            self._send_error_json("Unauthorized", 401)
            return False
        return True

    def _validate_product(self, data):
        name = str(data.get("name", "")).strip()
        if not name:
            return None, "Product name is required"
        try:
            category_id = int(data.get("category_id"))
        except (TypeError, ValueError):
            return None, "Category is required"
        try:
            mrp = float(data.get("mrp", 0))
            price = float(data.get("price", 0))
        except (TypeError, ValueError):
            return None, "Prices must be numbers"
        desc = str(data.get("description", "")).strip()
        image = str(data.get("image", "")).strip() or "/img/placeholder.png"
        try:
            stock = int(data.get("stock", 100))
        except (TypeError, ValueError):
            stock = 100
        bestseller = 1 if data.get("bestseller") else 0
        return {
            "name": name,
            "category_id": category_id,
            "mrp": mrp,
            "price": price,
            "description": desc,
            "image": image,
            "stock": stock,
            "bestseller": bestseller,
        }, None

    def _create_product(self):
        if not self._require_admin():
            return
        data = self._read_body()
        product, err = self._validate_product(data)
        if err:
            return self._send_error_json(err)
        conn = get_db()
        cur = conn.execute(
            "INSERT INTO products (name, category_id, mrp, price, description, image, stock, bestseller, status) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
            (product["name"], product["category_id"], product["mrp"], product["price"],
             product["description"], product["image"], product["stock"], product["bestseller"]),
        )
        conn.commit()
        pid = cur.lastrowid
        row = conn.fetchone(
            "SELECT p.*, c.name AS category_name FROM products p "
            "JOIN categories c ON c.id = p.category_id WHERE p.id = ?",
            (pid,),
        )
        conn.close()
        self._send_json(row_to_dict(row), 201)

    def _update_product(self, pid):
        if not self._require_admin():
            return
        data = self._read_body()
        conn = get_db()
        existing = conn.fetchone("SELECT * FROM products WHERE id = ?", (pid,))
        if not existing:
            conn.close()
            return self._send_error_json("Product not found", 404)
        product, err = self._validate_product(data)
        if err:
            conn.close()
            return self._send_error_json(err)
        conn.execute(
            "UPDATE products SET name = ?, category_id = ?, mrp = ?, price = ?, description = ?, "
            "image = ?, stock = ?, bestseller = ? WHERE id = ?",
            (product["name"], product["category_id"], product["mrp"], product["price"],
             product["description"], product["image"], product["stock"],
             product["bestseller"], pid),
        )
        conn.commit()
        row = conn.fetchone(
            "SELECT p.*, c.name AS category_name FROM products p "
            "JOIN categories c ON c.id = p.category_id WHERE p.id = ?",
            (pid,),
        )
        conn.close()
        self._send_json(row_to_dict(row))

    def _delete_product(self, pid):
        if not self._require_admin():
            return
        conn = get_db()
        cur = conn.execute("DELETE FROM products WHERE id = ?", (pid,))
        conn.commit()
        conn.close()
        if cur.rowcount == 0:
            return self._send_error_json("Product not found", 404)
        self._send_json({"ok": True, "deleted": pid})

    def _create_order(self):
        data = self._read_body()
        name = str(data.get("name", "")).strip()
        email = str(data.get("email", "")).strip()
        phone = str(data.get("phone", "")).strip()
        address = str(data.get("address", "")).strip()
        items = data.get("items", [])
        if not name or not email:
            return self._send_error_json("Name and email are required")
        if not isinstance(items, list) or len(items) == 0:
            return self._send_error_json("Cart is empty")
        conn = get_db()
        total = 0
        for it in items:
            row = conn.fetchone(
                "SELECT * FROM products WHERE id = ? AND status = 1", (it.get("id"),)
            )
            if not row:
                conn.close()
                return self._send_error_json(f"Product {it.get('id')} not found")
            qty = max(1, int(it.get("qty", 1)))
            total += row["price"] * qty
        cur = conn.execute(
            "INSERT INTO orders (name, email, phone, address, items, total) VALUES (?, ?, ?, ?, ?, ?)",
            (name, email, phone, address, json.dumps(items), round(total, 2)),
        )
        conn.commit()
        order_id = cur.lastrowid
        conn.close()
        self._send_json({"ok": True, "order_id": order_id, "total": round(total, 2)}, 201)

    # ---------- static ----------
    def _static(self, path):
        if path == "/":
            path = "/index.html"
        clean = path.lstrip("/")
        if ".." in clean:
            return self._send_error_json("Forbidden", 403)
        file_path = os.path.join(STATIC_DIR, clean)
        if os.path.isdir(file_path):
            file_path = os.path.join(file_path, "index.html")
        self._send_file(file_path)

    def log_message(self, fmt, *args):
        sys.stdout.write("[%s] %s\n" % (self.address_string(), fmt % args))


def main():
    try:
        init_db()
    except Exception as e:
        print("=" * 52)
        print("ERROR starting the database:")
        print(" ", e)
        print("  - Using SQLite? Remove DB_DRIVER=mysql from .env or")
        print("    make sure your MySQL server is running.")
        print("=" * 52)
        sys.exit(1)
    db.load_env()
    port = int(os.environ.get("PORT", "8000"))
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("=" * 52)
    print("  Sudha Wellness - E-Commerce Store")
    print("  Database  : %s" % ("MySQL" if db.DB().driver == "mysql" else "SQLite"))
    print("  Storefront : http://127.0.0.1:%d/" % port)
    print("  Admin panel: http://127.0.0.1:%d/admin.html" % port)
    print("  Press Ctrl+C to stop")
    print("=" * 52)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        server.shutdown()


if __name__ == "__main__":
    main()