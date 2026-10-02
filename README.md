# mainsw

Sudha Wellness - e-commerce store for homeopathic care and wellness products.

## Features

- Storefront: homepage with weekly bestsellers, top categories and top offers
- Product listing by category, product detail, cart and checkout
- Customer accounts (register/login) and "my orders"
- UPI payments via PhonePe (TEST sandbox or PROD) with a local simulate mode
- Order confirmation emails over SMTP (SSL/STARTTLS supported)
- Admin panel with login: products CRUD, customers and orders (status updates)
- Responsive design; works with SQLite (default) or MySQL via `.env`

## Tech

Node.js + Express, SQLite (`better-sqlite3`) or MySQL (`mysql2`), vanilla HTML/CSS/JS.
No build step - the browser loads the static files from `public/` directly.

## Run locally

Requires Node.js 18+.

```bash
npm install
cp .env.example .env   # then fill in real values
npm start              # = node server.js [PORT]
```

- Storefront: http://127.0.0.1:3000/
- Admin panel: http://127.0.0.1:3000/admin.html

Default admin login (change in `.env`): `admin` / the `ADMIN_PASSWORD` value.

## Deploy on Hostinger (Node.js web app)

> Important: use the **Node.js web app** builder, NOT the generic "Git" deploy.
> The generic Git deploy only copies files into a folder and never starts the
> Node process - that is what shows the **403 Forbidden** page.

1. In hPanel go to **Websites → Add Website → Node.js web app → Import Git repository**.
2. Connect GitHub, grant the Hostinger GitHub App access, pick the `mainsw` repo.
3. Review the auto-detected settings and set:
   - Framework preset: **Express**
   - Node.js version: **22** (18 or 20 also work)
   - Root directory: `/`
   - Build command: (leave empty - there is no build step)
   - Output directory: (leave empty - this is a server app)
   - **Entry file: `server.js`**
   - Branch: `main`
4. Add the environment variables from your local `.env` (never commit the real one).
5. Click **Deploy**. Hostinger runs `npm install`, starts `node server.js`, and
   keeps the process running on every push.

Using MySQL instead of SQLite: create the database in hPanel, then set
`DB_DRIVER=mysql` plus the `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` values.
Tables are created automatically on first start.

## Configuration

- `DB_DRIVER=sqlite` (default) or `mysql`
- MySQL connection details (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`)
- SMTP settings for order emails (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`)
- PhonePe settings (`PHONEPE_MERCHANT_ID`, `PHONEPE_SALT_KEY`, `PHONEPE_SALT_INDEX`, `PHONEPE_ENV`, `PHONEPE_REDIRECT_URI`)
- Admin login (`ADMIN_USERNAME`, `ADMIN_PASSWORD`) and legacy header key (`ADMIN_KEY`)

## Project structure

```
server.js      Express app entry point
src/config.js  Loads .env, resolves settings
src/db.js      SQLite + MySQL adapter, schema init + seeds
src/hash.js    Password hashing (PBKDF2-SHA256, same format as the Python version)
src/auth.js    Session tokens + admin tokens
src/mailer.js  SMTP order confirmation (nodemailer)
src/phonepe.js PhonePe payment integration (checksum, PROD/TEST)
src/routes/    Express routers: store, auth, admin, payments
public/        Storefront (index.html, admin.html, app.js, admin.js, css, images)
legacy-python/ The previous Python version (kept for reference)
```

## API

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET    | /api/health | Health check |
| GET    | /api/categories | List categories |
| GET    | /api/products   | List products (?category, ?search, ?bestseller=1) |
| GET    | /api/products/:id | Product detail |
| GET    | /api/search?q= | Search products |
| POST   | /api/products   | Create product (admin login token) |
| PUT    | /api/products/:id | Update product |
| DELETE | /api/products/:id | Delete product |
| POST   | /api/auth/register | Create account |
| POST   | /api/auth/login   | Login -> session token |
| GET    | /api/auth/me      | Current user |
| POST   | /api/auth/logout  | Logout |
| POST   | /api/orders     | Place an order |
| GET    | /api/orders/:id | Order detail |
| GET    | /api/myorders   | My orders (logged in) |
| GET    | /api/orders (admin) | List all orders |
| PUT    | /api/orders/:id/status (admin) | Update order status |
| POST   | /api/admin/login | Admin login -> token |
| POST   | /api/payments/init | Start PhonePe payment |
| GET    | /api/payments/callback | PhonePe redirect callback |
| GET    | /api/payments/simulate | Local test payment mode |

Admin endpoints accept `Authorization: Bearer <token>` (from `/api/admin/login`)
or the legacy `X-Admin: <ADMIN_KEY>` header.