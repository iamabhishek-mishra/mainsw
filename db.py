import os
import sqlite3


def load_env():
    """Minimal .env loader - reads .env into os.environ without overriding
    environment variables that are already set."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                os.environ.setdefault(key.strip(), value)


def mysql_available():
    try:
        import pymysql  # noqa: F401
        return True
    except ImportError:
        return False


class DB:
    """Small abstraction so the same SQL (with ? placeholders) runs on both
    SQLite and MySQL. MySQL SQL automatically gets ? translated to %s."""

    def __init__(self):
        load_env()
        self.driver = os.environ.get("DB_DRIVER", "sqlite").strip().lower()
        if self.driver == "mysql":
            self._init_mysql()
        else:
            self._init_sqlite()

    # ---------------- sqlite ----------------
    def _init_sqlite(self):
        self.driver = "sqlite"
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.db")
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")

    # ---------------- mysql ----------------
    def _init_mysql(self):
        if not mysql_available():
            raise RuntimeError(
                "DB_DRIVER=mysql is set but 'pymysql' is not installed. "
                "Run: python3 -m pip install pymysql"
            )
        import pymysql

        self._mysql = pymysql
        self.conn = pymysql.connect(
            host=os.environ.get("DB_HOST", "127.0.0.1"),
            port=int(os.environ.get("DB_PORT", "3306")),
            user=os.environ.get("DB_USER", "root"),
            password=os.environ.get("DB_PASSWORD", ""),
            database=os.environ.get("DB_NAME", "sudha_wellness"),
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
        )

    @property
    def placeholder(self):
        return "%s" if self.driver == "mysql" else "?"

    def _sql(self, sql):
        return sql.replace("?", "%s") if self.driver == "mysql" else sql

    # ---------------- helpers ----------------
    def cursor(self):
        return self.conn.cursor()

    def execute(self, sql, params=()):
        cur = self.conn.cursor()
        cur.execute(self._sql(sql), params)
        return cur

    def fetchone(self, sql, params=()):
        cur = self.execute(sql, params)
        row = cur.fetchone()
        cur.close()
        # sqlite3.Row -> dict for API consistency
        return dict(row) if row is not None else None

    def fetchall(self, sql, params=()):
        cur = self.execute(sql, params)
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    def executescript(self, statements):
        """Run multiple ';'-separated statements (both drivers)."""
        sql = self._sql(statements)
        cur = self.conn.cursor()
        for stmt in sql.split(";"):
            stmt = stmt.strip()
            if stmt:
                cur.execute(stmt)

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()