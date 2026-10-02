const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const fmt = n => "Rs. " + Number(n).toLocaleString("en-IN");
const inr = n => Math.round(Number(n || 0));

const AdminAuth = {
  key: "sudha_admin_token",
  token() { return localStorage.getItem(this.key) || ""; },
  set(t) { localStorage.setItem(this.key, t); },
  clear() { localStorage.removeItem(this.key); },
};

function showLogin() {
  AdminAuth.clear();
  $("#logout").classList.add("hidden");
  $("#app").classList.add("hidden");
  $("#loginScreen").classList.remove("hidden");
}
function hideLogin() {
  $("#loginScreen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#logout").classList.remove("hidden");
}

let categories = [];
let products = [];
let editingId = null;

async function request(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (AdminAuth.token()) headers["Authorization"] = "Bearer " + AdminAuth.token();
  const r = await fetch(url, { ...options, headers });
  if (r.status === 401) {
    showLogin();
    throw new Error("Session expired. Please login again.");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}

const api = {
  categories: () => request("/api/categories"),
  products: () => request("/api/products"),
  orders: () => request("/api/orders"),
  create: body => request("/api/products", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }),
  update: (id, body) => request(`/api/products/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }),
  remove: id => request(`/api/products/${id}`, { method: "DELETE" }),
};

/* ---------------- Views ---------------- */
function showView(name) {
  $$(".view").forEach(v => v.classList.add("hidden"));
  $("#view-" + name).classList.remove("hidden");
  $$(".side-menu a").forEach(a => a.classList.toggle("active", a.id === "m-" + name));
  location.hash = name;
  if (name === "products") renderProducts();
  if (name === "users") renderUsers();
  if (name === "orders") renderOrders();
  if (name === "dashboard") renderDashboard();
}

/* ---------------- Dashboard ---------------- */
async function renderDashboard() {
  const cats = categories;
  const prods = products;
  const active = prods.filter(p => p.status === 1);
  const ordersRaw = await api.orders().catch(() => []);
  const revenue = ordersRaw.reduce((s, o) => s + o.total, 0);
  $("#stats").innerHTML = `
    <div class="stat"><h4>Products</h4><div class="num">${prods.length}</div></div>
    <div class="stat"><h4>Categories</h4><div class="num">${cats.length}</div></div>
    <div class="stat"><h4>Orders</h4><div class="num">${ordersRaw.length}</div></div>
    <div class="stat"><h4>Revenue</h4><div class="num">${fmt(inr(revenue))}</div></div>`;
  const best = active.filter(p => p.bestseller);
  $("#bestBox").innerHTML = best.length
    ? best.map(p => adminCard(p)).join("")
    : `<p style="color:#6b7280">No bestsellers marked yet.</p>`;
}

function adminCard(p) {
  return `
    <div class="product-card">
      <div class="product-media">
        <img src="${p.image}" onerror="this.src='/img/placeholder.png'">
        <span class="badge best">Bestseller</span>
      </div>
      <div class="product-body">
        <h3>${p.name}</h3>
        <div class="price-row"><span class="price">${fmt(inr(p.price))}</span></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-block" onclick="openEdit(${p.id})">Edit</button>
          <button class="btn btn-danger btn-block" onclick="removeProduct(${p.id})">Delete</button>
        </div>
      </div>
    </div>`;
}

/* ---------------- Products table ---------------- */
async function renderProducts() {
  const term = $("#pSearch").value.toLowerCase();
  const cat = $("#catFilter").value;
  const rows = products.filter(p => {
    if (cat && p.category_id != cat) return false;
    if (term && !p.name.toLowerCase().includes(term)) return false;
    return true;
  });
  $("#productRows").innerHTML = rows.length
    ? rows.map(p => `
      <tr>
        <td><img class="tbl-img" src="${p.image}" onerror="this.src='/img/placeholder.png'"></td>
        <td><strong>${p.name}</strong></td>
        <td>${p.category_name || ""}</td>
        <td>${p.mrp ? fmt(inr(p.mrp)) : "-"}</td>
        <td><strong>${fmt(inr(p.price))}</strong></td>
        <td>${p.stock}</td>
        <td>${p.bestseller ? '<span class="badge-pill on">Best</span>' : '<span class="badge-pill off">-</span>'}</td>
        <td>${p.status ? '<span class="badge-pill on">Active</span>' : '<span class="badge-pill off">Hidden</span>'}</td>
        <td class="actions">
          <button class="edit" title="Edit" onclick="openEdit(${p.id})">&#9998;</button>
          <button class="del" title="Delete" onclick="removeProduct(${p.id})">&#128465;</button>
        </td>
      </tr>`).join("")
    : `<tr><td colspan="9" style="text-align:center;color:#6b7280;padding:30px">No products found.</td></tr>`;
}

/* ---------------- Product modal ---------------- */
function openModal() {
  const catSel = $("#productForm").elements["category_id"];
  catSel.innerHTML = categories.map(c =>
    `<option value="${c.id}">${c.name}</option>`).join("");
  $("#modalBg").classList.remove("hidden");
}

function closeModal() {
  $("#modalBg").classList.add("hidden");
  $("#productForm").reset();
  editingId = null;
}

function openAdd() {
  $("#modalTitle").textContent = "Add Product";
  $("#productForm").reset();
  $("#productForm").elements["category_id"].value = "";
  $("#productForm").elements["image"].value = "/img/products/";
  $("#imgPreview").src = "/img/placeholder.png";
  editingId = null;
  openModal();
}

function openEdit(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  $("#modalTitle").textContent = "Edit Product: " + p.name;
  const f = $("#productForm");
  f.elements["name"].value = p.name;
  f.elements["category_id"].value = p.category_id;
  f.elements["stock"].value = p.stock;
  f.elements["mrp"].value = p.mrp;
  f.elements["price"].value = p.price;
  f.elements["image"].value = p.image;
  f.elements["description"].value = p.description;
  f.elements["bestseller"].checked = !!p.bestseller;
  $("#imgPreview").src = p.image || "/img/placeholder.png";
  editingId = id;
  openModal();
}

async function removeProduct(id) {
  const p = products.find(x => x.id === id);
  if (!confirm(`Delete "${p ? p.name : "this product"}"? This cannot be undone.`)) return;
  try {
    await api.remove(id);
    products = await api.products();
    renderProducts();
    renderDashboard();
    alert("Product deleted.");
  } catch (e) {
    alert(e.message);
  }
}

/* ---------------- Users ---------------- */
async function renderUsers() {
  let users = [];
  try { users = await request("/api/users"); }
  catch (e) {
    $("#userRows").innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--red);padding:20px">${e.message}</td></tr>`;
    return;
  }
  $("#userRows").innerHTML = users.length
    ? users.map(u => `
      <tr>
        <td><strong>#${u.id}</strong></td>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td style="font-size:13px;color:#6b7280">${u.created_at}</td>
        <td><span class="badge-pill on">${u.order_count}</span></td>
        <td><strong>${fmt(inr(u.order_total))}</strong></td>
      </tr>`).join("")
    : `<tr><td colspan="6" style="text-align:center;color:#6b7280;padding:26px">No registered users yet.</td></tr>`;
}

/* ---------------- Orders ---------------- */
async function renderOrders() {
  let orders = [];
  try { orders = await api.orders(); } catch (e) {
    $("#orderRows").innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--red);padding:20px">${e.message}</td></tr>`;
    return;
  }
  $("#orderRows").innerHTML = orders.length
    ? orders.map(o => {
      const items = JSON.parse(o.items || "[]").map(i => `${i.qty}x #${i.id}`).join(", ");
      const payClass = o.payment_status === "paid" || o.payment_status === "cod" ? "on" : "off";
      const statusOptions = ["pending", "confirmed", "shipped", "delivered", "cancelled"]
        .map(s => `<option value="${s}" ${o.order_status === s ? "selected" : ""}>${s}</option>`).join("");
      return `<tr>
        <td><strong>#${o.id}</strong></td>
        <td>${o.name}</td>
        <td>${o.email}<br><span style="font-size:12.5px;color:#6b7280">${o.phone || ""}</span></td>
        <td style="font-size:13px;color:#374151">${o.address || "-"}</td>
        <td style="font-size:13px;color:#374151">${items}</td>
        <td>
          <strong>${(o.payment_method || "cod").toUpperCase()}</strong><br>
          <span class="badge-pill ${payClass}">${o.payment_status}</span>
        </td>
        <td>
          <select class="status-sel" data-id="${o.id}" style="padding:6px 8px;border:2px solid #e5e7eb;border-radius:8px;font-size:13px">
            ${statusOptions}
          </select>
        </td>
        <td><strong>${fmt(inr(o.total))}</strong></td>
        <td style="font-size:13px;color:#6b7280">${o.created_at}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="9" style="text-align:center;color:#6b7280;padding:26px">No orders yet.</td></tr>`;

  $$(".status-sel").forEach(sel => sel.addEventListener("change", async () => {
    const id = sel.dataset.id;
    try {
      await request(`/api/orders/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: sel.value }),
      });
      alert(`Order #${id} status updated to "${sel.value}".`);
    } catch (e) {
      alert(e.message);
      renderOrders();
    }
  }));
}

/* ---------------- Init ---------------- */
async function start() {
  try {
    [categories, products] = await Promise.all([api.categories(), api.products()]);
  } catch (e) {
    alert("Could not load data: " + e.message);
    return;
  }
  $("#catFilter").innerHTML = `<option value="">All categories</option>` +
    categories.map(c => `<option value="${c.id}">${c.name}</option>`).join("");

  $("#addProductBtn").addEventListener("click", openAdd);
  $("#cancelModal").addEventListener("click", closeModal);
  $("#modalBg").addEventListener("click", e => { if (e.target === $("#modalBg")) closeModal(); });
  $("#pSearch").addEventListener("input", renderProducts);
  $("#catFilter").addEventListener("change", renderProducts);

  $("#productForm").addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target;
    const body = {
      name: f.elements["name"].value.trim(),
      category_id: +f.elements["category_id"].value,
      mrp: +f.elements["mrp"].value,
      price: +f.elements["price"].value,
      stock: +f.elements["stock"].value,
      image: f.elements["image"].value.trim(),
      description: f.elements["description"].value.trim(),
      bestseller: f.elements["bestseller"].checked,
    };
    try {
      if (editingId) await api.update(editingId, body);
      else await api.create(body);
      products = await api.products();
      closeModal();
      renderProducts();
      renderDashboard();
      alert(editingId ? "Product updated." : "Product added.");
    } catch (err) {
      alert(err.message);
    }
  });

  fImage();
  $$(".side-menu a").forEach(a => a.addEventListener("click", () => showView(a.id.replace("m-", ""))));
  const initial = (location.hash || "#dashboard").slice(1);
  showView(initial === "settings" ? "settings" : ["products", "orders", "users"].includes(initial) ? initial : "dashboard");
}

function fImage() {
  const img = $("#productForm").elements["image"];
  const prev = $("#imgPreview");
  img.addEventListener("input", () => { prev.src = img.value || "/img/placeholder.png"; });
}

document.addEventListener("DOMContentLoaded", () => {
  bindAdminLogin();
  $("#logout").addEventListener("click", async () => {
    if (AdminAuth.token()) {
      try {
        await fetch("/api/admin/logout", { method: "POST", headers: { Authorization: "Bearer " + AdminAuth.token() } });
      } catch (e) { /* ignore */ }
    }
    showLogin();
    location.hash = "";
  });
  if (AdminAuth.token()) {
    hideLogin();
    $("#logout").classList.remove("hidden");
    start();
  } else {
    showLogin();
  }
});

function bindAdminLogin() {
  const form = $("#adminLoginForm");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("#loginBtn");
    const msg = $("#loginMsg");
    msg.innerHTML = "";
    btn.disabled = true;
    btn.textContent = "Signing in...";
    try {
      const res = await request("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.elements["username"].value.trim(),
          password: form.elements["password"].value,
        }),
      });
      AdminAuth.set(res.token);
      form.reset();
      hideLogin();
      start();
    } catch (err) {
      msg.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Login";
    }
  });
}