# mainsw

Sudha Wellness - e-commerce store for homeopathic care and wellness products.

## Features

- Storefront: homepage with weekly bestsellers, top categories and top offers
- Product listing by category, product detail, cart and checkout
- Admin panel to add, edit and delete products and view orders
- Works with SQLite (default) or MySQL via a `.env` config

## Tech

Python 3 standard library HTTP server + SQLite/MySQL, vanilla HTML/CSS/JS. No build step.

## Run

```bash
python3 server.py
```

- Storefront: http://127.0.0.1:8000/
- Admin panel: http://127.0.0.1:8000/admin.html

## Configuration

Copy `.env` and set values as needed:

- `DB_DRIVER=sqlite` (default) or `mysql`
- MySQL connection details (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`)
- Optional `ADMIN_KEY` used by the admin API

For MySQL, create the database first:

```bash
mysql -u root -p < schema.sql
```

## Project structure

```
schema.sql   MySQL schema
db.py        SQLite + MySQL adapter, loads .env
server.py    HTTP server and JSON API
static/      storefront (index.html, admin.html, app.js, admin.js, css, images)
```

## API

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET    | /api/categories | List categories |
| GET    | /api/products   | List products (?category, ?search, ?bestseller=1) |
| GET    | /api/products/:id | Product detail |
| POST   | /api/products   | Create product (header `X-Admin: <ADMIN_KEY>`) |
| PUT    | /api/products/:id | Update product |
| DELETE | /api/products/:id | Delete product |
| POST   | /api/orders     | Place an order |
| GET    | /api/orders     | List orders (header `X-Admin: <ADMIN_KEY>`) |