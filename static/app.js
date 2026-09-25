const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const fmt = n => "Rs. " + Number(n).toLocaleString("en-IN");
const inr = n => Math.round(Number(n || 0));

let categories = [];

const api = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Request failed");
    return r.json();
  },
  categories: () => api.get("/api/categories"),
  products: (query = "") => api.get("/api/products" + query),
  product: id => api.get("/api/products/" + id),
  placeOrder: body =>
    fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json()),
};

/* ---------------- Cart (localStorage) ---------------- */
const Cart = {
  key: "sudha_cart",
  get() {
    try { return JSON.parse(localStorage.getItem(this.key)) || []; } catch { return []; }
  },
  save(items) { localStorage.setItem(this.key, JSON.stringify(items)); },
  add(id, qty = 1) {
    const items = this.get();
    const found = items.find(i => i.id === id);
    if (found) found.qty += qty;
    else items.push({ id, qty });
    this.save(items);
    this.refreshBadge();
    renderDrawer();
  },
  update(id, qty) {
    let items = this.get();
    if (qty <= 0) items = items.filter(i => i.id !== id);
    else { const f = items.find(i => i.id === id); if (f) f.qty = qty; }
    this.save(items);
    this.refreshBadge();
    renderDrawer();
  },
  remove(id) { this.update(id, 0); },
  count() { return this.get().reduce((n, i) => n + i.qty, 0); },
  items() {
    const cart = this.get();
    return Promise.all(
      cart.map(async i => {
        const p = await api.product(i.id);
        return { ...p, qty: i.qty };
      })
    );
  },
  refreshBadge() {
    const el = $("#cartCount");
    if (el) el.textContent = this.count();
  },
};

/* ---------------- Router ---------------- */
function parseHash() {
  const raw = (location.hash || "#/").slice(1) || "/";
  const [path, query] = raw.split("?");
  const params = new URLSearchParams(query || "");
  return { path, params };
}

function navigate() {
  const { path, params } = parseHash();
  const app = $("#app");

  if (path === "/" || path === "/home") {
    app.innerHTML = spinner();
    renderHome(app);
  } else if (path === "/products") {
    app.innerHTML = spinner();
    if (params.get("search")) renderSearch(app, params.get("search"));
    else renderProducts(app, params);
  } else if (path.startsWith("/product/")) {
    app.innerHTML = spinner();
    renderProduct(app, params, path.split("/")[2]);
  } else if (path === "/cart") {
    app.innerHTML = spinner();
    renderCart(app);
  } else {
    app.innerHTML = "<div class='empty'><div class='big'>404</div><p>Page not found.</p></div>";
  }
  window.scrollTo({ top: 0 });
}

/* ---------------- Shared renderers ---------------- */
function spinner() {
  return `<div class="empty" style="padding:90px"><div class="big">&#128117;</div><p>Loading...</p></div>`;
}

function productCard(p) {
  const save = p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const out = p.stock <= 0;
  return `
  <div class="product-card">
    <a href="#/product/${p.id}" class="product-media">
      <img src="${p.image}" alt="${p.name}" loading="lazy"
           onerror="this.src='/img/placeholder.png'">
      ${p.bestseller ? `<span class="badge best">Bestseller</span>` : ""}
      ${save > 0 ? `<span class="badge">${save}% OFF</span>` : ""}
    </a>
    <div class="product-body">
      <span class="cat-label">${p.category_name || ""}</span>
      <h3><a href="#/product/${p.id}">${p.name}</a></h3>
      <div class="price-row">
        <span class="price">${fmt(inr(p.price))}</span>
        ${p.mrp > p.price ? `<span class="mrp">${fmt(inr(p.mrp))}</span>` : ""}
      </div>
      <span class="stock-note ${out ? "out" : ""}">${out ? "Out of stock" : `${p.stock} in stock`}</span>
      <button class="btn btn-primary btn-block add-cart" data-id="${p.id}" ${out ? "disabled" : ""}>
        ${out ? "Sold out" : "Add to cart"}
      </button>
    </div>
  </div>`;
}

function categoryCard(c) {
  return `
  <a href="#/products?category=${c.slug}" class="cat-card">
    <img src="${c.image}" alt="${c.name}" loading="lazy" onerror="this.style.visibility='hidden'">
    <div class="cat-body">
      <h4>${c.name}</h4>
      <p>${c.product_count} products</p>
    </div>
  </a>`;
}

/* ---------------- Home ---------------- */
async function renderHome(app) {
  const [cats, best] = await Promise.all([
    api.categories(),
    api.products("?bestseller=1"),
  ]);
  const offers = (await api.products()).filter(p => p.mrp > p.price).slice(0, 4);

  app.innerHTML = `
    <section class="section">
      <div class="section-head">
        <h2>Weekly Bestseller</h2>
        <a href="#/products?bestseller=1" class="view-all">View all &rarr;</a>
      </div>
      <div class="product-grid">${best.map(productCard).join("")}</div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Top Categories</h2>
        <span class="view-all">Find out the product categorywise</span>
      </div>
      <div class="cat-grid">${cats.map(categoryCard).join("")}</div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Top Offers On</h2>
        <a href="#/products?type=offer" class="view-all">View all &rarr;</a>
      </div>
      <div class="product-grid">${offers.map(productCard).join("")}</div>
    </section>`;

  bindAddToCart();
}

/* ---------------- Products listing ---------------- */
async function renderProducts(app, params) {
  const category = params.get("category") || "";
  const bestseller = params.get("bestseller") || "";
  const offerOnly = params.get("type") === "offer";
  const sort = params.get("sort") || "new";

  const query = new URLSearchParams();
  if (category) query.set("category", category);
  if (bestseller) query.set("bestseller", bestseller);
  let products = await api.products(query.toString() ? "?" + query.toString() : "");
  if (offerOnly) products = products.filter(p => p.mrp > p.price);

  const cats = await api.categories();
  const chips = `<a href="#/products" class="chip ${!category && !bestseller && !offerOnly ? "active" : ""}">All</a>` +
    cats.map(c =>
      `<a href="#/products?category=${c.slug}" class="chip ${category === c.slug ? "active" : ""}">${c.name}</a>`
    ).join("") +
    `<a href="#/products?bestseller=1" class="chip ${bestseller ? "active" : ""}">Bestsellers</a>` +
    `<a href="#/products?type=offer" class="chip ${offerOnly ? "active" : ""}">Top Offers</a>`;

  const title = offerOnly ? "Top Offers On" : bestseller ? "Weekly Bestseller"
    : category ? (cats.find(c => c.slug === category) || {}).name : "All Products";

  app.innerHTML = `
    <div class="chips" style="margin-top:20px">${chips}</div>
    <div class="list-toolbar">
      <h2>${title}</h2>
      <select id="sortSelect">
        <option value="new" ${sort === "new" ? "selected" : ""}>Sort: Newest</option>
        <option value="az" ${sort === "az" ? "selected" : ""}>Name (A - Z)</option>
        <option value="price_asc" ${sort === "price_asc" ? "selected" : ""}>Price: Low to High</option>
        <option value="price_desc" ${sort === "price_desc" ? "selected" : ""}>Price: High to Low</option>
      </select>
    </div>
    <div id="plist"></div>`;

  const plist = $("#plist");
  const applySort = (sort, data) => {
    const arr = [...data];
    if (sort === "az") arr.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "price_asc") arr.sort((a, b) => a.price - b.price);
    if (sort === "price_desc") arr.sort((a, b) => b.price - a.price);
    return arr;
  };
  plist.innerHTML = products.length
    ? `<div class="product-grid">${applySort(sort, products).map(productCard).join("")}</div>`
    : `<div class="empty"><div class="big">&#128269;</div><p>No products found.</p></div>`;

  $("#sortSelect").addEventListener("change", e => {
    const p = parseHash();
    p.params.set("sort", e.target.value);
    location.hash = "#/products?" + p.params.toString();
  });
  bindAddToCart();
}

/* ---------------- Product detail ---------------- */
async function renderProduct(app, params, id) {
  try {
    const p = await api.product(id);
    const save = p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
    const out = p.stock <= 0;
    app.innerHTML = `
      <div class="breadcrumb"><a href="#/">Home</a> / <a href="#/products">Products</a> / <a href="#/products?category=${p.category_slug}">${p.category_name}</a> / ${p.name}</div>
      <div class="detail">
        <div class="detail-media">
          <img src="${p.image}" alt="${p.name}" onerror="this.src='/img/placeholder.png'">
        </div>
        <div class="detail-info">
          <span class="cat-label">${p.category_name || "Health Product"}</span>
          <h1>${p.name}</h1>
          <div class="detail-price">
            <span class="price">${fmt(inr(p.price))}</span>
            ${p.mrp > p.price ? `<span class="mrp">${fmt(inr(p.mrp))}</span>` : ""}
            ${save > 0 ? `<span class="save">You save ${save}%</span>` : ""}
          </div>
          <span class="stock-note ${out ? "out" : ""}">${out ? `Out of stock` : `${p.stock} in stock`}</span>
          <p class="detail-desc">${p.description || "No description yet."}</p>
          <div class="qty-row">
            <label>Quantity</label>
            <div class="qty">
              <button id="qMinus">&minus;</button>
              <input id="qtyInput" type="number" value="1" min="1" max="${p.stock}">
              <button id="qPlus">+</button>
            </div>
          </div>
          <div class="detail-actions">
            <button class="btn btn-primary btn-lg" id="addBtn" ${out ? "disabled" : ""}>${out ? "Out of stock" : "Add to cart"}</button>
            <a href="#/cart" class="btn btn-outline btn-lg">Buy now</a>
          </div>
          <span id="addedMsg" class="added-msg"></span>
        </div>
      </div>`;

    const input = $("#qtyInput");
    $("#qMinus").onclick = () => input.value = Math.max(1, +input.value - 1);
    $("#qPlus").onclick = () => input.value = Math.min(p.stock, +input.value + 1);
    $("#addBtn").onclick = () => {
      Cart.add(p.id, +input.value);
      openDrawer();
      $("#addedMsg").textContent = "Added to cart!";
    };
  } catch (e) {
    app.innerHTML = `<div class="empty"><div class="big">&#128544;</div><p>${e.message}</p></div>`;
  }
}

/* ---------------- Cart page ---------------- */
async function renderCart(app) {
  let items = [];
  try { items = await Cart.items(); } catch (e) { /* some product missing */ }
  const subTotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const savings = items.reduce((s, i) => s + (i.mrp - i.price) * i.qty, 0);

  if (!items.length) {
    app.innerHTML = `
      <div class="empty" style="padding:80px 0">
        <div class="big">&#128717;</div>
        <h3 style="margin-bottom:16px">Your cart is empty</h3>
        <a href="#/products" class="btn btn-primary">Start shopping</a>
      </div>`;
    return;
  }

  app.innerHTML = `
    <div class="breadcrumb"><a href="#/">Home</a> / Cart</div>
    <div class="cart-layout">
      <div>
        <div class="section-head"><h2>Shopping Cart (${items.length} item${items.length > 1 ? "s" : ""})</h2></div>
        <div id="cartList">
          ${items.map(i => `
            <div class="cart-row" data-id="${i.id}">
              <img src="${i.image}" onerror="this.src='/img/placeholder.png'">
              <div class="info">
                <h4>${i.name}</h4>
                <div class="p">${fmt(inr(i.price))} <span class="mrp">${i.mrp > i.price ? fmt(inr(i.mrp)) : ""}</span></div>
                <div class="controls">
                  <div class="qty">
                    <button class="q-minus" data-id="${i.id}">&minus;</button>
                    <input type="number" value="${i.qty}" min="1" class="q-num" data-id="${i.id}">
                    <button class="q-plus" data-id="${i.id}">+</button>
                  </div>
                  <button class="remove" data-id="${i.id}">Remove</button>
                </div>
              </div>
              <strong class="dprice">${fmt(inr(i.price * i.qty))}</strong>
            </div>`).join("")}
        </div>
      </div>
      <div class="summary">
        <h3>Order Summary</h3>
        <div class="line"><span>Subtotal</span><span>${fmt(inr(subTotal))}</span></div>
        <div class="line"><span>You save</span><span style="color:var(--green);font-weight:700">${fmt(inr(savings))}</span></div>
        <div class="line"><span>Shipping</span><span style="color:var(--green)">FREE</span></div>
        <div class="total"><span>Total</span><span>${fmt(inr(subTotal))}</span></div>
        <form id="checkoutForm" style="margin-top:18px">
          <div class="field"><label>Full name *</label><input name="name" required placeholder="Your name"></div>
          <div class="field"><label>Email *</label><input name="email" type="email" required placeholder="you@email.com"></div>
          <div class="field"><label>Phone</label><input name="phone" placeholder="+91 ..."></div>
          <div class="field"><label>Delivery address</label><textarea name="address" rows="3" placeholder="House, street, city, PIN"></textarea></div>
          <button type="submit" class="btn btn-primary btn-block btn-lg">Place Order</button>
        </form>
        <div id="orderMsg"></div>
      </div>
    </div>`;

  const refresh = async () => {
    items = await Cart.items();
    renderCart(app);
  };

  $$("#cartList .q-minus").forEach(b => b.onclick = () => {
    const it = items.find(i => i.id == b.dataset.id);
    Cart.update(it.id, it.qty - 1);
    refresh();
  });
  $$("#cartList .q-plus").forEach(b => b.onclick = () => {
    const it = items.find(i => i.id == b.dataset.id);
    Cart.update(it.id, it.qty + 1);
    refresh();
  });
  $$("#cartList .q-num").forEach(i => i.onchange = () => {
    Cart.update(+i.dataset.id, Math.max(1, +i.value));
    refresh();
  });
  $$("#cartList .remove").forEach(b => b.onclick = () => {
    Cart.remove(+b.dataset.id);
    refresh();
  });

  $("#checkoutForm").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = $("#orderMsg");
    const res = await api.placeOrder({
      name: fd.get("name"),
      email: fd.get("email"),
      phone: fd.get("phone"),
      address: fd.get("address"),
      items: Cart.get(),
    });
    if (res.ok) {
      Cart.save([]);
      Cart.refreshBadge();
      msg.innerHTML = `<div class="alert alert-success">Order placed successfully! Order ID: ${res.order_id}. Total: ${fmt(inr(res.total))}. We will contact you shortly.</div>`;
      e.target.reset();
    } else {
      msg.innerHTML = `<div class="alert alert-error">${res.error || "Something went wrong."}</div>`;
    }
  });
}

/* ---------------- Events & UI ---------------- */
function bindAddToCart() {
  $$(".add-cart").forEach(b => b.addEventListener("click", async () => {
    const id = +b.dataset.id;
    Cart.add(id); // drawer shows it
    openDrawer();
  }));
}

function openDrawer() {
  renderDrawer();
  $("#cartOverlay").classList.remove("hidden");
  $("#cartDrawer").classList.add("open");
}

async function renderDrawer() {
  const box = $("#drawerItems");
  const totalEl = $("#drawerTotal");
  if (!box || !totalEl) return;
  let items = [];
  try { items = await Cart.items(); } catch { items = []; }
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  box.innerHTML = items.length
    ? items.map(i => `
        <div class="ditem">
          <img src="${i.image}" onerror="this.src='/img/placeholder.png'">
          <div class="dinfo">
            <strong>${i.name}</strong>
            <div class="qty-note">Qty: ${i.qty} &times; ${fmt(inr(i.price))}</div>
            <div class="dprice">${fmt(inr(i.price * i.qty))}</div>
          </div>
          <button class="remove" data-id="${i.id}">Remove</button>
        </div>`).join("")
    : `<div class="empty" style="padding:40px 0"><p style="font-size:13px">Your cart is empty.</p></div>`;
  totalEl.textContent = fmt(inr(total));
  $$("#drawerItems .remove").forEach(r => r.onclick = () => {
    Cart.remove(+r.dataset.id);
  });
}

function initMenu() {
  const menu = $("#categoryMenu");
  menu.innerHTML = categories.map(c =>
    `<a href="#/products?category=${c.slug}">${c.name}</a>`).join("");
  const foot = $("#footerCategories");
  if (foot) foot.innerHTML = categories.map(c =>
    `<li><a href="#/products?category=${c.slug}">${c.name}</a></li>`).join("");
}

function initHero() {
  const slides = $$(".hero-slide");
  if (slides.length < 2) return;
  let idx = 0;
  const go = n => {
    slides[idx].classList.remove("active");
    idx = (n + slides.length) % slides.length;
    slides[idx].classList.add("active");
  };
  $("#heroPrev").addEventListener("click", () => go(idx - 1));
  $("#heroNext").addEventListener("click", () => go(idx + 1));
  setInterval(() => go(idx + 1), 5000);
}

function initSearch() {
  const doSearch = () => {
    const q = $("#searchInput").value.trim();
    if (!q) return;
    location.hash = "#/products?search=" + encodeURIComponent(q);
  };
  $("#searchBtn").addEventListener("click", doSearch);
  $("#searchInput").addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });
}

async function renderSearch(app, term) {
  $("#searchInput").value = term;
  const products = await api.products("?search=" + encodeURIComponent(term));
  app.innerHTML = `
    <div class="list-toolbar"><h2>Search results for &ldquo;${escapeHtml(term)}&rdquo; (${products.length})</h2></div>
    ${products.length
      ? `<div class="product-grid">${products.map(productCard).join("")}</div>`
      : `<div class="empty"><div class="big">&#128269;</div><p>No products match your search.</p><p style="margin-top:14px"><a href="#/products" class="btn btn-outline">Browse all products</a></p></div>`}`;
  bindAddToCart();
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function closeDrawer() {
  $("#cartOverlay").classList.add("hidden");
  $("#cartDrawer").classList.remove("open");
}

async function start() {
  categories = await api.categories();
  initMenu();
  initHero();
  initSearch();
  Cart.refreshBadge();

  window.addEventListener("hashchange", () => {
    navigate();
  });
  navigate();

  $("#closeCart").addEventListener("click", closeDrawer);
  $("#cartOverlay").addEventListener("click", closeDrawer);

  $("#newsletterForm").addEventListener("submit", e => {
    e.preventDefault();
    e.target.reset();
    alert("Thanks for subscribing!");
  });
}

document.addEventListener("DOMContentLoaded", start);