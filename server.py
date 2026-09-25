import base64
import datetime
import hashlib
import json
import mimetypes
import os
import re
import secrets
import smtplib
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
from decimal import Decimal
from email.mime.text import MIMEText
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import db

try:
    import pymysql
    DB_INTEGRITY_ERRORS = (sqlite3.IntegrityError, pymysql.err.IntegrityError)
except ImportError:
    DB_INTEGRITY_ERRORS = (sqlite3.IntegrityError,)

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


def get_admin_username():
    db.load_env()
    return os.environ.get("ADMIN_USERNAME", "admin")


def get_admin_password():
    db.load_env()
    return os.environ.get("ADMIN_PASSWORD", "sudha@123")


ADMIN_TOKENS = {}
ADMIN_TOKEN_TTL = 24 * 60 * 60


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
    migrate(conn)
    conn.close()


def row_to_dict(row):
    return dict(row)


def migrate(conn):
    """Add columns from newer schemas to existing databases (both drivers)."""
    cols = [("user_id", "INTEGER"), ("payment_method", "TEXT NOT NULL DEFAULT 'cod'"),
            ("payment_status", "TEXT NOT NULL DEFAULT 'pending'"),
            ("transaction_id", "TEXT NOT NULL DEFAULT ''"),
            ("order_status", "TEXT NOT NULL DEFAULT 'pending'")]
    existing = collect_columns(conn, "orders")
    for col, decl in cols:
        if col not in existing:
            conn.execute("ALTER TABLE orders ADD COLUMN %s %s" % (col, decl))
    conn.commit()


def collect_columns(conn, table):
    """Return the set of column names for a table, works on SQLite and MySQL."""
    if conn.driver == "mysql":
        rows = conn.fetchall("SHOW COLUMNS FROM %s" % table)
        return {r["Field"] for r in rows}
    rows = conn.fetchall("PRAGMA table_info(%s)" % table)
    return {r["name"] for r in rows}


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), 100000
    ).hex()
    return "%s$%s" % (salt, digest)


def verify_password(password, stored):
    try:
        salt, digest = stored.split("$")
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), 100000
    ).hex()
    return secrets.compare_digest(check, digest)


def get_auth_token(handler):
    header = handler.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


def user_from_token(conn, token):
    if not token:
        return None
    return conn.fetchone(
        "SELECT u.id, u.name, u.email, u.created_at "
        "FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
        (token,),
    )


ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"]
PAYMENT_METHODS = ["cod", "upi"]
PAYMENT_STATUSES = ["pending", "paid", "failed"]


def smtp_config():
    return {
        "host": os.environ.get("SMTP_HOST", "").strip(),
        "port": int(os.environ.get("SMTP_PORT", "587")),
        "user": os.environ.get("SMTP_USER", "").strip(),
        "password": os.environ.get("SMTP_PASSWORD", "").strip(),
        "from": os.environ.get("SMTP_FROM", "Sudha Wellness <noreply@sudhawellness.com>"),
        "tls": os.environ.get("SMTP_USE_TLS", "1") == "1",
        "log_dir": os.environ.get("SMTP_LOG_DIR", "").strip(),
    }


def phonepe_config():
    return {
        "merchant_id": os.environ.get("PHONEPE_MERCHANT_ID", "").strip(),
        "salt_key": os.environ.get("PHONEPE_SALT_KEY", "").strip(),
        "salt_index": os.environ.get("PHONEPE_SALT_INDEX", "1").strip(),
        "env": os.environ.get("PHONEPE_ENV", "TEST").strip().upper(),
        "redirect_uri": os.environ.get("PHONEPE_REDIRECT_URI", "").strip(),
    }


def load_config_into_env():
    db.load_env()


def get_phonepe_base_url(config):
    if config["env"] == "PROD":
        return "https://api.phonepe.com/apis/hermes/pg/v1"
    return "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1"


def verify_phonepe_signature(raw_base64, x_verify_header, salt_key, salt_index):
    """Verify a PhonePe callback/status response signature.
    X-VERIFY = base64(sha256(raw_base64 + saltKey)) + '###' + saltIndex"""
    if not raw_base64 or not x_verify_header or not salt_key:
        return False
    expected = x_verify_header.rsplit("###", 1)[0]
    digest = base64.b64encode(
        hashlib.sha256(
            (raw_base64 + salt_key).encode("utf-8")
        ).digest()
    ).decode("utf-8")
    return secrets.compare_digest(expected, digest)


def send_order_confirmation_email(order, conn):
    """Send order confirmation to the customer. If SMTP isn't configured, write the
    email to logs/emails.log so the flow still works locally."""
    cfg = smtp_config()
    items = json.loads(order["items"])
    item_lines = "\n".join(
        "  - Product #%s  x%s" % (i.get("id"), i.get("qty", 1)) for i in items
    )
    body = (
        "Dear %s,\n\nThank you for your order with Sudha Wellness!\n\n"
        "Order ID    : #%s\n"
        "Total       : Rs. %s\n"
        "Payment     : %s (%s)\n"
        "Order status: %s\n\n"
        "Items:\n%s\n\n"
        "We will contact you on %s for delivery updates.\n\n"
        "Warm regards,\nSudha Wellness\nDhanbad, Jharkhand 828106\n"
    ) % (
        order["name"],
        order["id"],
        round(order["total"], 2),
        order["payment_method"].upper(),
        order["payment_status"],
        order["order_status"],
        item_lines or "  -",
        order["phone"] or order["email"],
    )
    subject = "Your Sudha Wellness order #%s is confirmed" % order["id"]

    if cfg["log_dir"]:
        os.makedirs(cfg["log_dir"], exist_ok=True)
        with open(os.path.join(cfg["log_dir"], "emails.log"), "a") as f:
            f.write("%s\nTO:%s\nSUBJECT:%s\n%s\n%s\n" % (
                datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                order["email"], subject, body, "-" * 40))

    if not cfg["host"]:
        return False, "SMTP not configured; confirmation recorded locally"

    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = cfg["from"]
        msg["To"] = order["email"]
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=15) as s:
            if cfg["tls"]:
                s.starttls()
            if cfg["user"]:
                s.login(cfg["user"], cfg["password"])
            s.send_message(msg)
        return True, "Email sent to %s" % order["email"]
    except Exception as e:
        return False, "Email failed: %s" % e


def phonepe_create_payment(order, conn):
    """Create a PhonePe transaction for an order.
    Returns (ok, redirect_url, error). If merchant credentials are missing it
    returns a local simulate URL so the flow can be tested end-to-end."""
    cfg = phonepe_config()
    txn_id = "SW%s%s" % (time.strftime("%Y%m%d%H%M%S"), order["id"])
    conn.execute(
        "UPDATE orders SET transaction_id = ?, payment_status = 'pending' WHERE id = ?",
        (txn_id, order["id"]),
    )
    conn.commit()

    if not cfg["merchant_id"] or not cfg["salt_key"]:
        return True, "/api/payments/simulate?order_id=%s" % order["id"], None

    amount_paisa = int(round(order["total"] * 100))
    redirect_uri = cfg["redirect_uri"] or (
        "http://127.0.0.1:%s/api/payments/callback"
        % os.environ.get("PORT", "8000")
    )
    payload = {
        "merchantId": cfg["merchant_id"],
        "merchantTransactionId": txn_id,
        "merchantUserId": "MUID%s" % (order.get("user_id") or "GUEST"),
        "amount": amount_paisa,
        "redirectUrl": redirect_uri,
        "redirectMode": "REDIRECT",
        "callbackUrl": redirect_uri,
        "mobileNumber": order["phone"] or "9999999999",
        "paymentInstrument": {"type": "PAY_PAGE"},
    }
    payload_b64 = base64.b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("utf-8")
    string_to_hash = payload_b64 + cfg["salt_key"]
    checksum = base64.b64encode(
        hashlib.sha256(string_to_hash.encode("utf-8")).digest()
    ).decode("utf-8")
    x_verify = "%s###%s" % (checksum, cfg["salt_index"])

    body = json.dumps({"request": payload_b64}).encode("utf-8")
    req = urllib.request.Request(
        get_phonepe_base_url(cfg) + "/pay",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-VERIFY": x_verify,
            "X-MERCHANT-ID": cfg["merchant_id"],
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            res = json.loads(resp.read().decode("utf-8"))
        if res.get("success"):
            return True, res["data"]["redirectUrl"], None
        return False, None, res.get("message", "PhonePe payment failed")
    except Exception as e:
        return False, None, str(e)


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

        if path == "/api/auth/me":
            return self._auth_me(parsed)

        if path == "/api/myorders":
            return self._my_orders()

        if path == "/api/users":
            if not self._require_admin():
                return
            return self._users()

        if path.startswith("/api/orders/"):
            return self._order_detail(path)

        if path == "/api/payments/callback":
            return self._payment_callback(parsed)

        if path == "/api/payments/simulate":
            return self._payment_simulate(parsed)

        if path == "/api/categories":
            return self._categories()

        if path == "/api/products":
            return self._products()

        if path.startswith("/api/products/"):
            return self._product_detail(path)

        if path == "/api/orders":
            if not self._require_admin():
                return
            return self._orders()

        if path.startswith("/api/search"):
            return self._search()

        return self._static(path)

    def do_POST(self):
        if self.path == "/api/auth/register":
            return self._register()
        if self.path == "/api/auth/login":
            return self._login()
        if self.path == "/api/auth/logout":
            return self._logout()
        if self.path == "/api/admin/login":
            return self._admin_login()
        if self.path == "/api/admin/logout":
            return self._admin_logout()
        if self.path == "/api/payments/init":
            return self._payment_init()
        if self.path == "/api/products":
            return self._create_product()
        if self.path == "/api/orders":
            return self._create_order()
        self._send_error_json("Not found", 404)

    def do_PUT(self):
        m = re.match(r"^/api/products/(\d+)$", self.path)
        if m:
            return self._update_product(int(m.group(1)))
        s = re.match(r"^/api/orders/(\d+)/status$", self.path)
        if s:
            return self._update_order_status(int(s.group(1)))
        self._send_error_json("Not found", 404)

    def do_DELETE(self):
        m = re.match(r"^/api/products/(\d+)$", self.path)
        if m:
            return self._delete_product(int(m.group(1)))
        self._send_error_json("Not found", 404)

    # ---------- API handlers ----------
    def _auth_me(self, parsed=None):
        conn = get_db()
        user = user_from_token(conn, get_auth_token(self))
        conn.close()
        if not user:
            return self._send_error_json("Not logged in", 401)
        self._send_json(user)

    def _register(self):
        data = self._read_body()
        name = str(data.get("name", "")).strip()
        email = str(data.get("email", "")).strip().lower()
        password = str(data.get("password", ""))
        if not name or not email:
            return self._send_error_json("Name and email are required")
        if len(password) < 6:
            return self._send_error_json("Password must be at least 6 characters")
        conn = get_db()
        existing = conn.fetchone("SELECT id FROM users WHERE email = ?", (email,))
        if existing:
            conn.close()
            return self._send_error_json("An account with this email already exists. Please login instead.", 409)
        token = secrets.token_hex(32)
        try:
            cur = conn.execute(
                "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
                (name, email, hash_password(password)),
            )
            uid = cur.lastrowid
        except DB_INTEGRITY_ERRORS:
            conn.close()
            return self._send_error_json("An account with this email already exists. Please login instead.", 409)
        conn.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, uid))
        conn.commit()
        user = conn.fetchone("SELECT id, name, email, created_at FROM users WHERE id = ?", (uid,))
        conn.close()
        self._send_json({"user": user, "token": token}, 201)

    def _login(self):
        data = self._read_body()
        email = str(data.get("email", "")).strip().lower()
        password = str(data.get("password", ""))
        conn = get_db()
        user = conn.fetchone("SELECT * FROM users WHERE email = ?", (email,))
        if not user or not verify_password(password, user["password_hash"]):
            conn.close()
            return self._send_error_json("Invalid email or password", 401)
        token = secrets.token_hex(32)
        conn.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user["id"]))
        conn.commit()
        safe = {"id": user["id"], "name": user["name"], "email": user["email"], "created_at": user["created_at"]}
        conn.close()
        self._send_json({"user": safe, "token": token})

    def _logout(self):
        token = get_auth_token(self)
        conn = get_db()
        if token:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
        conn.close()
        self._send_json({"ok": True})

    def _my_orders(self):
        conn = get_db()
        user = user_from_token(conn, get_auth_token(self))
        if not user:
            conn.close()
            return self._send_error_json("Not logged in", 401)
        rows = conn.fetchall(
            "SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC", (user["id"],)
        )
        conn.close()
        self._send_json([row_to_dict(r) for r in rows])

    def _users(self):
        if not self._require_admin():
            return
        conn = get_db()
        rows = conn.fetchall(
            "SELECT u.id, u.name, u.email, u.created_at, "
            "(SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count, "
            "(SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.user_id = u.id) AS order_total "
            "FROM users u ORDER BY u.id DESC"
        )
        conn.close()
        self._send_json([row_to_dict(r) for r in rows])

    def _order_detail(self, path):
        m = re.match(r"^/api/orders/(\d+)$", path)
        if not m:
            return self._send_error_json("Not found", 404)
        conn = get_db()
        row = conn.fetchone(
            "SELECT * FROM orders WHERE id = ?", (int(m.group(1)),)
        )
        conn.close()
        if not row:
            return self._send_error_json("Order not found", 404)
        self._send_json(row_to_dict(row))

    def _update_order_status(self, oid):
        if not self._require_admin():
            return
        data = self._read_body()
        status = str(data.get("status", "")).strip().lower()
        if status not in ORDER_STATUSES:
            return self._send_error_json("Invalid status. Choose: %s" % ", ".join(ORDER_STATUSES))
        conn = get_db()
        existing = conn.fetchone("SELECT * FROM orders WHERE id = ?", (oid,))
        if not existing:
            conn.close()
            return self._send_error_json("Order not found", 404)
        conn.execute(
            "UPDATE orders SET order_status = ? WHERE id = ?", (status, oid)
        )
        conn.commit()
        conn.close()
        self._send_json({"ok": True, "order_id": oid, "order_status": status})

    def _payment_init(self):
        data = self._read_body()
        try:
            oid = int(data.get("order_id"))
        except (TypeError, ValueError):
            return self._send_error_json("order_id is required")
        conn = get_db()
        order = conn.fetchone("SELECT * FROM orders WHERE id = ?", (oid,))
        if not order:
            conn.close()
            return self._send_error_json("Order not found", 404)
        ok, redirect_url, err = phonepe_create_payment(order, conn)
        conn.close()
        if not ok:
            return self._send_error_json(err or "Payment could not be started")
        self._send_json({"ok": True, "order_id": oid, "redirect_url": redirect_url})

    def _payment_callback(self, parsed):
        """PhonePe redirect callback after the user pays."""
        qs = urllib.parse.parse_qs(parsed.query)
        txn_id = (qs.get("txnId") or qs.get("merchantTransactionId") or [""])[0]
        status = (qs.get("status") or [""])[0]
        signed_payload = (qs.get("signedPayload") or [""])[0]
        conn = get_db()
        order = conn.fetchone(
            "SELECT * FROM orders WHERE transaction_id = ? OR id = ?", (txn_id, txn_id)
        )
        if not order:
            conn.close()
            return self._redirect("/#/orders")
        cfg = phonepe_config()
        paid = status.lower() in ("success", "paid")
        if (cfg["merchant_id"] and cfg["salt_key"]):
            # In production verify the signature before trusting the response
            valid = verify_phonepe_signature(
                signed_payload,
                self.headers.get("X-VERIFY", ""),
                cfg["salt_key"],
                cfg["salt_index"],
            )
            if not (valid and paid):
                conn.execute(
                    "UPDATE orders SET payment_status = 'failed' WHERE id = ?",
                    (order["id"],),
                )
                conn.commit()
                conn.close()
                return self._redirect("/#/order?id=%s&status=failed" % order["id"])
        if paid:
            self._mark_order_paid(conn, order, txn_id or order["transaction_id"])
            conn.close()
            return self._redirect("/#/order?id=%s&status=paid" % order["id"])
        conn.execute(
            "UPDATE orders SET payment_status = 'failed' WHERE id = ?", (order["id"],)
        )
        conn.commit()
        conn.close()
        return self._redirect("/#/order?id=%s&status=failed" % order["id"])

    def _payment_simulate(self, parsed):
        """Local test mode for PhonePe without real merchant credentials."""
        qs = urllib.parse.parse_qs(parsed.query)
        oid = (qs.get("order_id") or [""])[0]
        conn = get_db()
        order = conn.fetchone(
            "SELECT * FROM orders WHERE id = ? AND payment_status = 'pending'", (oid,)
        )
        if not order:
            conn.close()
            return self._redirect("/#/orders")
        status = (qs.get("status") or ["success"])[0]
        if status == "success":
            self._mark_order_paid(conn, order, order["transaction_id"] or ("SIM%s" % order["id"]))
        else:
            conn.execute(
                "UPDATE orders SET payment_status = 'failed' WHERE id = ?", (order["id"],)
            )
        conn.commit()
        conn.close()
        return self._redirect("/#/order?id=%s&status=%s" % (oid, status))

    def _mark_order_paid(self, conn, order, txn_id):
        new_status = order["order_status"] if order["order_status"] != "pending" else "confirmed"
        conn.execute(
            "UPDATE orders SET payment_status = 'paid', transaction_id = ?, order_status = ? "
            "WHERE id = ?",
            (txn_id, new_status, order["id"]),
        )
        conn.commit()
        fresh = conn.fetchone("SELECT * FROM orders WHERE id = ?", (order["id"],))
        if fresh:
            send_order_confirmation_email(fresh, conn)

    def _redirect(self, url):
        body = ("<meta http-equiv='refresh' content='0; url=%s'>Redirecting..." % url).encode("utf-8")
        self.send_response(303)
        self.send_header("Location", url)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass

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
        if self.headers.get("X-Admin") == get_admin_key():
            return True
        token = get_auth_token(self)
        if token and token in ADMIN_TOKENS and time.time() - ADMIN_TOKENS[token] < ADMIN_TOKEN_TTL:
            return True
        self._send_error_json("Unauthorized", 401)
        return False

    def _admin_login(self):
        data = self._read_body()
        username = str(data.get("username", "")).strip()
        password = str(data.get("password", ""))
        if not username or not password:
            return self._send_error_json("Username and password are required", 400)
        if username == get_admin_username() and password == get_admin_password():
            token = secrets.token_hex(32)
            ADMIN_TOKENS[token] = time.time()
            return self._send_json({"token": token, "username": username})
        return self._send_error_json("Invalid admin credentials", 401)

    def _admin_logout(self):
        token = get_auth_token(self)
        if token and token in ADMIN_TOKENS:
            del ADMIN_TOKENS[token]
        self._send_json({"ok": True})

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
        payment_method = str(data.get("payment_method", "cod")).strip().lower()
        if payment_method not in PAYMENT_METHODS:
            payment_method = "cod"
        if not name or not email:
            return self._send_error_json("Name and email are required")
        if not isinstance(items, list) or len(items) == 0:
            return self._send_error_json("Cart is empty")
        conn = get_db()
        user = user_from_token(conn, get_auth_token(self))
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
        payment_status = "cod" if payment_method == "cod" else "pending"
        if user:
            cur = conn.execute(
                "INSERT INTO orders (name, email, phone, address, items, total, user_id, payment_method, payment_status) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (name, email, phone, address, json.dumps(items), round(total, 2),
                 user["id"], payment_method, payment_status),
            )
        else:
            cur = conn.execute(
                "INSERT INTO orders (name, email, phone, address, items, total, payment_method, payment_status) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (name, email, phone, address, json.dumps(items), round(total, 2),
                 payment_method, payment_status),
            )
        conn.commit()
        order_id = cur.lastrowid
        order = conn.fetchone("SELECT * FROM orders WHERE id = ?", (order_id,))
        email_sent = None
        if payment_method == "cod":
            ok, email_sent = send_order_confirmation_email(order, conn)
        conn.close()
        self._send_json(
            {
                "ok": True,
                "order_id": order_id,
                "total": round(total, 2),
                "payment_method": payment_method,
                "email": email_sent,
            },
            201,
        )

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