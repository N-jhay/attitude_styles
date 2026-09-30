// ---- Admin dashboard ----
// Catalog data and uploaded media are saved through authenticated same-origin Pages Functions.
"use strict";
(function () {
  const S = window.Store;
  const $ = id => document.getElementById(id);
  const esc = S.esc;
  const onAdminPage = document.body.hasAttribute("data-admin-page");
  const clone = o => JSON.parse(JSON.stringify(o));
  const PH = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#8884"/></svg>');

  let W = null, tab = "overview", dirty = false;
  const APP_CONFIG = window.APP_CONFIG || {};
  const supabaseConfigured = !!(APP_CONFIG.supabaseUrl && APP_CONFIG.supabaseAnonKey && window.supabase && window.supabase.createClient);
  const getSupabaseClient = () => supabaseConfigured ? window.supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey) : null;

  async function ensureSupabaseAdmin() {
    const client = getSupabaseClient();
    if (!client) return { ok: false, reason: "Supabase is not configured." };
    const { data: { session }, error } = await client.auth.getSession();
    if (error) return { ok: false, reason: error.message };
    const user = session && session.user ? session.user : null;
    if (!user) return { ok: false, reason: "Please sign in." };
    if (!user.email_confirmed_at) return { ok: false, reason: "Verify your email before opening the admin." };
    const allowed = (APP_CONFIG.adminAllowedEmails || []).map(email => String(email).trim().toLowerCase());
    if (allowed.length && !allowed.includes((user.email || "").toLowerCase())) return { ok: false, reason: "This account is not allowed to manage the store." };
    return { ok: true, user, client };
  }

  async function unlocked() {
    if (supabaseConfigured) {
      const result = await ensureSupabaseAdmin();
      return result.ok;
    }
    try {
      const response = await fetch(S.ROOT + "api/admin/session", { cache: "no-store", credentials: "same-origin" });
      return response.ok && (await response.json()).authenticated === true;
    } catch (e) { return false; }
  }

  /* ---------- media helpers ---------- */
  function processImage(file, maxW, keepAlpha) {
    return new Promise((resolve, reject) => {
      if (/svg/.test(file.type)) return resolve(file);
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width), w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const g = c.getContext("2d");
        if (!keepAlpha) { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); }
        g.drawImage(img, 0, 0, w, h);
        c.toBlob(b => { URL.revokeObjectURL(url); b ? resolve(b) : reject(new Error("encode failed")); }, keepAlpha ? "image/png" : "image/jpeg", 0.86);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not an image")); };
      img.src = url;
    });
  }
  async function storeMedia(blob) {
    return S.saveMedia(blob);
  }
  async function uploadImage(file, maxW, keepAlpha) {
    if (!/^image\//.test(file.type)) throw new Error("Please choose an image file.");
    if (file.type === "image/svg+xml") throw new Error("SVG uploads are not supported. Use PNG, JPEG, or WebP.");
    return storeMedia(await processImage(file, maxW, keepAlpha));
  }
  async function uploadVideo(file) {
    if (!/^video\//.test(file.type)) throw new Error("Please choose a video file.");
    return storeMedia(file);
  }
  const refValue = u => u || "";

  /* ---------- state ---------- */
  const touch = () => { dirty = true; const s = $("saveStatus"); if (s) s.textContent = "Unsaved changes"; const b = $("saveBtn"); if (b) b.classList.add("dirty"); };
  const stats = () => ({
    total: W.products.length,
    units: W.products.reduce((n, p) => n + Number(p.stock || 0), 0),
    low: W.products.filter(p => Number(p.stock) > 0 && Number(p.stock) <= 3).length,
    out: W.products.filter(p => Number(p.stock) <= 0).length,
  });
  const pill = p => { const s = Number(p.stock); return s <= 0 ? '<span class="pill out">Sold out</span>' : s <= 3 ? '<span class="pill low">Low</span>' : '<span class="pill in">In stock</span>'; };
  function colorsToStr(cs) { return (cs || []).map(c => c[0] + ":" + c[1]).join(", "); }
  function strToColors(s) {
    return s.split(",").map(x => x.trim()).filter(Boolean).map(x => {
      const i = x.lastIndexOf(":"), n = i > 0 ? x.slice(0, i).trim() : x, h = i > 0 ? x.slice(i + 1).trim() : "";
      return [n, /^#[0-9a-f]{3,8}$/i.test(h) ? h : "#888888"];
    });
  }
  async function guard(label, fn) {
    try { S.toast(label); await fn(); } catch (e) { S.toast(e && e.message ? e.message : "Something went wrong."); }
  }

  /* ---------- views ---------- */
  function statsHTML() {
    const s = stats();
    return `<section class="admin-stats">
      <div class="stat-card accent"><span>Total products</span><strong>${s.total}</strong></div>
      <div class="stat-card"><span>Units in stock</span><strong>${s.units}</strong></div>
      <div class="stat-card warning"><span>Low stock</span><strong>${s.low}</strong></div>
      <div class="stat-card danger"><span>Sold out</span><strong>${s.out}</strong></div></section>`;
  }
  function stockRowHTML(p, i) {
    return `<div class="srow" data-i="${i}">
      <img src="${esc(S.mediaURL(p.img) || PH)}" alt="" onerror="imgFallback(this)">
      <div class="sname"><b>${esc(p.name)}</b><small>${esc(p.cat)} \u00b7 ${S.fmt(p.price)}</small></div>
      ${pill(p)}
      <div class="qty"><button type="button" data-step="-1" aria-label="Decrease stock">\u2212</button><input type="number" min="0" value="${Number(p.stock) || 0}" aria-label="Stock for ${esc(p.name)}"><button type="button" data-step="1" aria-label="Increase stock">+</button></div></div>`;
  }
  function bindStockRows(container) {
    container.querySelectorAll(".srow").forEach(row => {
      const p = W.products[Number(row.dataset.i)], inp = row.querySelector("input");
      const set = v => { p.stock = Math.max(0, Math.floor(Number(v) || 0)); touch(); renderView(); };
      row.querySelectorAll("[data-step]").forEach(b => b.onclick = () => set((Number(p.stock) || 0) + Number(b.dataset.step)));
      inp.onchange = () => set(inp.value);
    });
  }

  function viewOverview(box) {
    const attn = W.products.map((p, i) => ({ p, i })).filter(x => Number(x.p.stock) <= 3);
    box.innerHTML = statsHTML() + `<div class="admin-panel"><div class="panel-header"><h3>Needs attention</h3><span class="status">${attn.length} item${attn.length === 1 ? "" : "s"}</span></div>
      <div id="attn">${attn.length ? attn.map(x => stockRowHTML(x.p, x.i)).join("") : '<p class="empty">Everything is comfortably stocked.</p>'}</div></div>
      <div class="admin-panel"><h3>Quick actions</h3><div class="admin-actions" style="margin-top:12px">
        <button class="btn ghost small" data-go="catalog" type="button">Edit catalog</button>
        <button class="btn ghost small" data-go="media" type="button">Change logo / reel</button>
        <button class="btn ghost small" data-go="settings" type="button">WhatsApp &amp; banner</button></div></div>`;
    bindStockRows($("attn"));
  }

  function viewInventory(box) {
    box.innerHTML = statsHTML() + `<div class="admin-panel"><div class="panel-header"><h3>Inventory</h3></div>
      <div id="inv">${W.products.length ? W.products.map(stockRowHTML).join("") : '<p class="empty">No products yet.</p>'}</div></div>`;
    bindStockRows($("inv"));
  }

  function viewCatalog(box) {
    box.innerHTML = `<div class="admin-panel"><div class="panel-header"><h3>Merch catalog</h3><button class="btn ghost small" id="addProductBtn" type="button">+ Add merch</button></div><div id="adminProducts"></div></div>`;
    $("addProductBtn").onclick = () => {
      W.products.unshift({ id: Date.now(), name: "New item", cat: "General", price: 0, stock: 0, colors: [], sizes: ["One size"], dims: {}, img: "" });
      touch(); renderView();
    };
    const wrap = $("adminProducts");
    if (!W.products.length) wrap.innerHTML = '<p class="empty">No products yet \u2014 add your first one.</p>';
    W.products.forEach((p, idx) => {
      const row = document.createElement("div"); row.className = "prow";
      row.innerHTML = `<div class="top">
        <div class="media-stack"><img data-role="thumb" src="${esc(S.mediaURL(p.img) || PH)}" alt="" onerror="imgFallback(this)">
          <label class="filebtn-label">Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" class="filebtn" data-role="img-file"></label></div>
        <div class="fields">
          <input data-f="name" placeholder="Name" value="${esc(p.name)}" aria-label="Name">
          <input data-f="cat" placeholder="Category" value="${esc(p.cat)}" aria-label="Category">
          <input data-f="price" placeholder="Price (\u20a6)" type="number" min="0" value="${Number(p.price) || 0}" aria-label="Price">
          <input data-f="stock" placeholder="Stock" type="number" min="0" value="${Number(p.stock) || 0}" aria-label="Stock">
          <input class="full2" data-f="colors" placeholder="Colors: Name:#hex, Name:#hex" value="${esc(colorsToStr(p.colors))}" aria-label="Colors">
          <input class="full2" data-f="sizes" placeholder="Sizes: S, M, L, XL" value="${esc((p.sizes || []).join(", "))}" aria-label="Sizes">
          <input class="full2" data-f="img" placeholder="Photo link (or upload a photo on the left)" value="${esc(refValue(p.img))}" aria-label="Photo link">
          <div class="full2 upload-row">
            <input data-f="video" placeholder="Video link (optional) or upload \u2192" value="${esc(refValue(p.videoUrl))}" aria-label="Video link">
            <label class="filebtn-label">Upload video<input type="file" accept="video/*" class="filebtn" data-role="video-file"></label>
          </div>
          <video class="mini-video" data-role="vprev" controls playsinline preload="metadata" ${p.videoUrl ? `src="${esc(S.mediaURL(p.videoUrl))}"` : 'style="display:none"'}></video>
        </div></div>
        <div class="rowbtns">${p.videoUrl ? '<button class="del" data-role="rmvideo" type="button">Remove video</button>' : ""}<button class="del" data-role="del" type="button">Remove product</button></div>`;
      const q = s => row.querySelector(s);
      q('[data-f=name]').oninput = e => { p.name = e.target.value; touch(); };
      q('[data-f=cat]').oninput = e => { p.cat = e.target.value; touch(); };
      q('[data-f=price]').oninput = e => { p.price = Math.max(0, Number(e.target.value) || 0); touch(); };
      q('[data-f=stock]').oninput = e => { p.stock = Math.max(0, Math.floor(Number(e.target.value) || 0)); touch(); };
      q('[data-f=colors]').oninput = e => { p.colors = strToColors(e.target.value); touch(); };
      q('[data-f=sizes]').oninput = e => { p.sizes = e.target.value.split(",").map(s => s.trim()).filter(Boolean); if (!p.sizes.length) p.sizes = ["One size"]; touch(); };
      q('[data-f=img]').oninput = e => { p.img = e.target.value.trim(); q('[data-role=thumb]').src = S.mediaURL(p.img) || PH; touch(); };
      q('[data-f=video]').oninput = e => {
        p.videoUrl = e.target.value.trim() || undefined;
        const v = q('[data-role=vprev]');
        if (p.videoUrl) { v.src = S.mediaURL(p.videoUrl); v.style.display = "block"; } else { v.removeAttribute("src"); v.style.display = "none"; }
        touch();
      };
      q('[data-role=img-file]').onchange = e => { const f = e.target.files[0]; if (!f) return; guard("Processing photo\u2026", async () => { p.img = await uploadImage(f, 1200, false); touch(); renderView(); }); };
      q('[data-role=video-file]').onchange = e => {
        const f = e.target.files[0]; if (!f) return;
        guard("Uploading video\u2026", async () => { p.videoUrl = await uploadVideo(f); touch(); renderView(); S.toast("Video added \u2014 remember to Save."); });
      };
      const rv = q('[data-role=rmvideo]'); if (rv) rv.onclick = () => { p.videoUrl = undefined; touch(); renderView(); };
      q('[data-role=del]').onclick = () => { if (confirm('Remove "' + (p.name || "this product") + '"?')) { W.products.splice(idx, 1); touch(); renderView(); } };
      wrap.appendChild(row);
    });
  }

  function viewMedia(box) {
    const logoURL = W.logo === S.DEFAULTS.logo ? "" : S.mediaURL(W.logo);
    box.innerHTML = `<div class="admin-grid"><div class="admin-panel"><h3>Logo</h3>
        <p class="sub">Shown in the header, hero, contact page and this dashboard. Use a transparent PNG for best results.</p>
        <div class="logo-row"><img id="logoPrev" data-logo alt="Current logo" style="width:96px;height:96px"><div>
          <label class="filebtn-label">Upload logo<input type="file" accept="image/jpeg,image/png,image/webp" id="logoFile" class="filebtn"></label>
          <div style="margin-top:8px"><button class="btn ghost small" id="logoReset" type="button">Use bundled logo</button></div></div></div>
        ${logoURL ? "" : '<p class="sub" style="margin-top:12px">Currently using the bundled Attitude Styles logo.</p>'}</div>
      <div class="admin-panel"><h3>Homepage reel</h3>
        <p class="sub">The "Watch the drop" video on the home page. Paste a link or upload a video from your device.</p>
        <div class="field"><input id="reelUrl" placeholder="Video link" value="${esc(refValue(W.reel))}" aria-label="Reel link"></div>
        <div class="admin-actions"><label class="filebtn-label">Upload video<input type="file" accept="video/*" id="reelFile" class="filebtn"></label>
          <button class="btn ghost small" id="reelClear" type="button">Remove reel</button></div>
        <video id="reelPrev" class="mini-video" controls playsinline preload="metadata" ${W.reel ? `src="${esc(S.mediaURL(W.reel))}"` : 'style="display:none"'}></video></div></div>`;
    // paint preview through the shared logo logic using working value
    const prev = $("logoPrev"), applyLogo = () => {
      prev.onerror = () => { prev.onerror = null; prev.src = S.ROOT + "assets/logo.png"; prev.setAttribute("data-invert", "1"); };
      if (W.logo === S.DEFAULTS.logo || !S.mediaURL(W.logo)) { prev.src = S.ROOT + "assets/logo.png"; prev.setAttribute("data-invert", "1"); }
      else { prev.removeAttribute("data-invert"); prev.src = S.mediaURL(W.logo); }
    };
    applyLogo();
    $("logoFile").onchange = e => { const f = e.target.files[0]; if (!f) return; guard("Processing logo\u2026", async () => { W.logo = await uploadImage(f, 800, true); touch(); renderView(); }); };
    $("logoReset").onclick = () => { W.logo = S.DEFAULTS.logo; touch(); renderView(); };
    $("reelUrl").oninput = e => {
      W.reel = e.target.value.trim(); const v = $("reelPrev");
      if (W.reel) { v.src = S.mediaURL(W.reel); v.style.display = "block"; } else { v.removeAttribute("src"); v.style.display = "none"; }
      touch();
    };
    $("reelFile").onchange = e => { const f = e.target.files[0]; if (!f) return; guard("Uploading video\u2026", async () => { W.reel = await uploadVideo(f); touch(); renderView(); S.toast("Reel added \u2014 remember to Save."); }); };
    $("reelClear").onclick = () => { W.reel = ""; touch(); renderView(); };
  }

  function viewSettings(box) {
    box.innerHTML = `<div class="admin-panel"><h3>Store settings</h3>
      <div class="field"><label for="fWhatsapp">WhatsApp number (digits only, with country code)</label><input id="fWhatsapp" inputmode="numeric" value="${esc(W.whatsapp)}"></div>
      <div class="field"><label for="fTagline">Hero tagline</label><input id="fTagline" value="${esc(W.tagline)}"></div>
      <div class="field"><label for="fAnnounce">Announcement banner (leave blank to hide)</label><input id="fAnnounce" placeholder="e.g. New drop this Saturday" value="${esc(W.announcement || "")}"></div>
      <p class="sub">Every WhatsApp button on the site (hero, contact page, footer, floating button, order buttons) uses this number.</p></div>
      <div class="admin-panel"><h3>Reset</h3><p class="sub">Replace the published catalog and settings with the bundled defaults.</p>
      <button class="btn ghost small" id="resetBtn" type="button">Restore bundled defaults</button></div>`;
    $("fWhatsapp").oninput = e => { W.whatsapp = e.target.value; touch(); };
    $("fTagline").oninput = e => { W.tagline = e.target.value; touch(); };
    $("fAnnounce").oninput = e => { W.announcement = e.target.value; touch(); };
    $("resetBtn").onclick = async () => {
      if (!confirm("Replace the live catalog with the bundled defaults?")) return;
      await guard("Restoring bundled defaults\u2026", async () => {
        await S.resetToDefaults(); W = clone(S.data); dirty = false; renderView(); setStatus("Restored defaults."); S.toast("Restored bundled defaults.");
      });
    };
  }

  const VIEWS = { overview: viewOverview, catalog: viewCatalog, inventory: viewInventory, media: viewMedia, settings: viewSettings };
  const TITLES = { overview: "Admin overview", catalog: "Catalog", inventory: "Inventory", media: "Logo & media", settings: "Settings" };
  function renderView() {
    const box = $("adminView"); if (!box) return;
    document.querySelectorAll(".nav-section").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    const h = $("adminTitle"); if (h) h.textContent = TITLES[tab];
    VIEWS[tab](box);
    box.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { tab = b.dataset.go; renderView(); });
  }
  function setStatus(t) { const s = $("saveStatus"); if (s) s.textContent = t; }

  /* ---------- save ---------- */
  async function save() {
    const digits = String(W.whatsapp || "").replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) { S.toast("Enter a valid WhatsApp number (digits with country code)."); tab = "settings"; renderView(); const f = $("fWhatsapp"); if (f) f.focus(); return; }
    W.whatsapp = digits;
    W.tagline = (W.tagline || "").trim() || S.DEFAULTS.tagline;
    W.announcement = (W.announcement || "").trim();
    W.products.forEach(p => {
      p.name = (p.name || "").trim() || "Untitled"; p.cat = (p.cat || "").trim() || "General";
      p.price = Math.max(0, Number(p.price) || 0); p.stock = Math.max(0, Math.floor(Number(p.stock) || 0));
      if (!p.sizes || !p.sizes.length) p.sizes = ["One size"];
    });
    if (supabaseConfigured) {
      const client = getSupabaseClient();
      const { error } = await client.from("store_state").upsert({ id: 1, data_json: W, updated_at: new Date().toISOString() }, { onConflict: "id" });
      if (error) throw new Error(error.message || "Could not save store data.");
    } else {
      await S.persist(W);
    }
    S.data = clone(W);
    S.renderAll();
    dirty = false; const b = $("saveBtn"); if (b) b.classList.remove("dirty");
    setStatus("Saved " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    S.toast("Saved \u2014 the store is updated.");
    renderView();
  }

  /* ---------- shell ---------- */
  function closeAdmin() {
    if (dirty && !confirm("You have unsaved changes. Leave anyway?")) return;
    dirty = false;
    if (onAdminPage) location.href = S.ROOT + "index.html"; else $("av").classList.remove("open");
  }
  window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  async function openAdmin() {
    await S.ready;
    W = clone(S.data); dirty = false;
    if (!$("asheet")) return;
    $("asheet").innerHTML = `<div class="admin-layout">
      <aside class="admin-sidebar">
        <div class="admin-brand-wrap"><img class="admin-logo" data-logo alt="Attitude Styles logo"><div><p class="eyebrow">Store manager</p><h2>Attitude Styles</h2></div></div>
        <nav class="admin-nav" aria-label="Admin sections">
          ${Object.keys(TITLES).map(k => `<button class="nav-section" type="button" data-tab="${k}">${k === "media" ? "Logo &amp; media" : TITLES[k].replace("Admin overview", "Overview")}</button>`).join("")}
        </nav>
        <div class="admin-note"><span>Signed in</span><button class="btn ghost small" id="lockBtn" type="button">Lock</button></div>
      </aside>
      <main class="admin-main">
        <header class="admin-topbar"><div><p class="eyebrow">Dashboard</p><h2 id="adminTitle"></h2></div>
          <div class="admin-actions">
            <button class="btn gold" id="saveBtn" type="button">Save changes</button>
            <button class="btn ghost" id="closeAdminBtn" type="button">${onAdminPage ? "View store" : "Close"}</button>
          </div></header>
        <div id="adminView" class="admin-view"></div>
        <div class="save-row"><span id="saveStatus" class="status"></span></div>
      </main></div>`;
    document.querySelectorAll(".nav-section").forEach(b => b.onclick = () => { tab = b.dataset.tab; renderView(); const m = document.querySelector(".admin-main"); if (m) m.scrollIntoView({ block: "start" }); });
    $("saveBtn").onclick = () => guard("Saving changes\u2026", save);
    $("closeAdminBtn").onclick = closeAdmin;
    $("lockBtn").onclick = async () => {
      if (dirty && !confirm("Discard unsaved changes and lock?")) return;
      dirty = false;
      await fetch(S.ROOT + "api/admin/logout", { method: "POST", credentials: "same-origin" });
      showLogin();
    };
    // paint the logo in the sidebar without touching the shop grid
    const lg = document.querySelector(".admin-logo");
    if (lg) { lg.onerror = () => { lg.onerror = null; lg.src = S.ROOT + "assets/logo.png"; lg.setAttribute("data-invert", "1"); };
      if (S.data.logo === S.DEFAULTS.logo || !S.mediaURL(S.data.logo)) { lg.src = S.ROOT + "assets/logo.png"; lg.setAttribute("data-invert", "1"); } else lg.src = S.mediaURL(S.data.logo); }
    tab = "overview"; renderView();
    $("av").classList.add("open");
  }

  function showLogin() {
    const shell = $("av"), sheet = $("asheet"); if (!shell || !sheet) return;
    const isSupabaseMode = supabaseConfigured;
    sheet.innerHTML = `<div class="panel login-panel">
      <h2>${isSupabaseMode ? "Admin sign in" : "Beta access"}</h2>
      <div class="sub">${isSupabaseMode ? "Sign in with your verified admin email and password." : "Enter the beta password to manage merch, inventory, logo and media."}</div>
      <div class="field"><label for="betaEmailInput">${isSupabaseMode ? "Email" : "Password"}</label><input id="betaEmailInput" type="${isSupabaseMode ? "email" : "password"}" placeholder="${isSupabaseMode ? "name@example.com" : "Enter password"}" autocomplete="${isSupabaseMode ? "email" : "off"}" /></div>
      ${isSupabaseMode ? `<div class="field"><label for="betaPasswordInput">Password</label><input id="betaPasswordInput" type="password" placeholder="Enter password" autocomplete="current-password" /></div>` : ""}
      <div class="actions admin-actions"><button class="btn gold" id="betaPasswordSubmit" type="button">${isSupabaseMode ? "Sign in" : "Unlock dashboard"}</button><button class="btn ghost" id="betaPasswordCancel" type="button">Cancel</button></div></div>`;
    const emailInput = $("betaEmailInput");
    const passwordInput = $("betaPasswordInput");
    const unlock = async () => {
      if (supabaseConfigured) {
        try {
          const client = getSupabaseClient();
          const email = (emailInput.value || "").trim();
          const password = (passwordInput ? passwordInput.value : "");
          if (!email || !password) throw new Error("Enter your email and password.");
          const { data, error } = await client.auth.signInWithPassword({ email, password });
          if (error) throw error;
          const result = await ensureSupabaseAdmin();
          if (!result.ok) {
            await client.auth.signOut();
            throw new Error(result.reason || "You are not allowed to access admin.");
          }
          await openAdmin();
        } catch (error) {
          S.toast(error.message || "Could not sign in."); if (emailInput) emailInput.focus();
        }
        return;
      }
      try {
        const response = await fetch(S.ROOT + "api/admin/login", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password: emailInput.value }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Could not sign in.");
        await openAdmin();
      } catch (error) {
        S.toast(error.message || "Could not sign in."); emailInput.focus(); emailInput.select();
      }
    };
    $("betaPasswordSubmit").onclick = unlock;
    $("betaPasswordCancel").onclick = () => { if (onAdminPage) location.href = S.ROOT + "index.html"; else shell.classList.remove("open"); };
    const primaryInput = supabaseConfigured ? emailInput : emailInput;
    primaryInput.onkeydown = e => { if (e.key === "Enter") unlock(); if (e.key === "Escape" && !onAdminPage) shell.classList.remove("open"); };
    if (passwordInput) passwordInput.onkeydown = e => { if (e.key === "Enter") unlock(); };
    shell.classList.add("open");
    setTimeout(() => primaryInput.focus(), 50);
  }

  async function requestAdminAccess() { if (await unlocked()) await openAdmin(); else showLogin(); }
  window.requestAdminAccess = requestAdminAccess;

  // Hidden entry point: click/tap the footer copyright line 3 times within 1.5s (present on every page).
  const secret = $("secretAdmin");
  if (secret) {
    let taps = [];
    secret.addEventListener("click", () => {
      const now = Date.now(); taps = taps.filter(t => now - t < 1500); taps.push(now);
      if (taps.length >= 3) { taps = []; requestAdminAccess(); }
    });
  }
  if (onAdminPage) S.ready.then(requestAdminAccess);
})();
