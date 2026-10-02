/* Shared auth helper used by login.html and the storefront (index.html). */
const Auth = {
  key: "sudha_auth",

  get() {
    try { return JSON.parse(localStorage.getItem(this.key)); } catch { return null; }
  },
  set(user, token) { localStorage.setItem(this.key, JSON.stringify({ user, token })); },
  clear() { localStorage.removeItem(this.key); },
  user() { const a = this.get(); return a && a.user ? a.user : null; },
  token() { const a = this.get(); return a && a.token ? a.token : null; },
  headers() {
    const t = this.token();
    return t ? { Authorization: "Bearer " + t } : {};
  },

  async request(path, body) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.headers() },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Request failed");
    return data;
  },

  async login(email, password) {
    const res = await this.request("/api/auth/login", { email, password });
    this.set(res.user, res.token);
    return res.user;
  },

  async register(name, email, password) {
    const res = await this.request("/api/auth/register", { name, email, password });
    this.set(res.user, res.token);
    return res.user;
  },

  async logout() {
    const t = this.token();
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: this.headers() });
    } catch (e) { /* ignore network errors */ }
    this.clear();
  },

  async me() {
    const t = this.token();
    if (!t) return null;
    try {
      const r = await fetch("/api/auth/me", { headers: this.headers() });
      if (!r.ok) { this.clear(); return null; }
      const user = await r.json();
      this.set(user, t);
      return user;
    } catch (e) { return null; }
  },
};

/* ---------------- Login / Signup page logic ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("authForm");
  if (!form) return; // not on the login page

  const tabLogin = document.getElementById("tabLogin");
  const tabSignup = document.getElementById("tabSignup");
  const title = document.getElementById("authTitle");
  const sub = document.getElementById("authSub");
  const submitBtn = document.getElementById("submitBtn");
  const nameField = document.getElementById("signupNameField");
  const msgBox = document.getElementById("authMsg");
  let mode = "login";

  const showMsg = (text, ok) => {
    msgBox.innerHTML = text
      ? `<div class="alert ${ok ? "alert-success" : "alert-error"}">${text}</div>`
      : "";
  };

  const setMode = m => {
    mode = m;
    nameField.style.display = m === "signup" ? "block" : "none";
    nameField.querySelector("input").required = m === "signup";
    form.elements["password"].minLength = 6;
    tabLogin.classList.toggle("active", m === "login");
    tabSignup.classList.toggle("active", m === "signup");
    title.textContent = m === "login" ? "Welcome back" : "Create an account";
    sub.textContent = m === "login"
      ? "Login to your Sudha Wellness account"
      : "Sign up to track orders and checkout faster";
    submitBtn.textContent = m === "login" ? "Login" : "Create Account";
    showMsg("", false);
  };

  tabLogin.addEventListener("click", () => setMode("login"));
  tabSignup.addEventListener("click", () => setMode("signup"));

  form.addEventListener("submit", async e => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = "Please wait...";
    showMsg("", false);
    const email = form.elements["email"].value.trim();
    const password = form.elements["password"].value;
    try {
      if (mode === "signup") {
        const name = form.elements["name"].value.trim();
        if (!name) throw new Error("Please enter your full name");
        try {
          await Auth.register(name, email, password);
        } catch (err) {
          if (/already exists/i.test(err.message)) {
            setMode("login");
            form.elements["email"].value = email;
            form.elements["password"].value = "";
            showMsg("That email is already registered. Please login instead.", false);
            return;
          }
          throw err;
        }
      } else {
        await Auth.login(email, password);
      }
      form.reset();
      msgBox.innerHTML = '<div class="alert alert-success">Logged in! Redirecting to the store...</div>';
      setTimeout(() => (location.href = "/"), 700);
    } catch (err) {
      showMsg(err.message, false);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = mode === "login" ? "Login" : "Create Account";
    }
  });
});