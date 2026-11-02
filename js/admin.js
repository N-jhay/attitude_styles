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
  let expandedProducts = new Set();
  const APP_CONFIG = window.APP_CONFIG || {};
  const isDemoValue = value => typeof value === "string" && /example\.supabase\.co|demo-anon-key|admin@example\.com/i.test(value);
  const supabaseConfigured = !!(APP_CONFIG.supabaseUrl && APP_CONFIG.supabaseAnonKey && window.supabase && window.supabase.createClient && !isDemoValue(APP_CONFIG.supabaseUrl) && !isDemoValue(APP_CONFIG.supabaseAnonKey));
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
        const outputType = keepAlpha ? "image/png" : "image/webp";
        c.toBlob(blob => {
          URL.revokeObjectURL(url);
          if (blob && (keepAlpha || blob.type === "image/webp")) {
            resolve(blob);
          } else if (!keepAlpha) {
            c.toBlob(fallback => fallback ? resolve(fallback) : reject(new Error("Image encoding failed.")), "image/jpeg", 0.82);
          } else {
            reject(new Error("Image encoding failed."));
          }
        }, outputType, 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not an image")); };
      img.src = url;
    });
  }
  async function storeMedia(blob, onProgress) {
    return S.saveMedia(blob, onProgress);
  }
  async function uploadImage(file, maxW, keepAlpha, onProgress) {
    if (!/^image\//.test(file.type)) throw new Error("Please choose an image file.");
    if (file.type === "image/svg+xml") throw new Error("SVG uploads are not supported. Use PNG, JPEG, or WebP.");
    return storeMedia(await processImage(file, maxW, keepAlpha), onProgress);
  }
  async function uploadVideo(file, onProgress) {
    if (!/^video\//.test(file.type)) throw new Error("Please choose a video file.");
    return storeMedia(file, onProgress);
  }
  const refValue = u => u || "";

  /* ---------- state ---------- */
  const touch = () => { dirty = true; const s = $("saveStatus"); if (s) s.textContent = "Unsaved changes"; const b = $("saveBtn"); if (b) b.classList.add("dirty"); };
  let uploadProgressTimer;
  function showUploadProgress(label) {
    const box = $("uploadProgress"), text = $("uploadProgressText"), bar = $("uploadProgressBar");
    if (!box || !text || !bar) return;
    clearTimeout(uploadProgressTimer);
    box.hidden = false;
    box.setAttribute("aria-busy", "true");
    text.textContent = label;
    bar.removeAttribute("value");
  }
  function updateUploadProgress(percent) {
    const text = $("uploadProgressText"), bar = $("uploadProgressBar");
    if (!text || !bar) return;
    bar.value = percent;
    text.textContent = `Uploading media\u2026 ${percent}%`;
  }
  function finishUploadProgress(message, failed = false) {
    const box = $("uploadProgress"), text = $("uploadProgressText"), bar = $("uploadProgressBar");
    if (!box || !text || !bar) return;
    box.removeAttribute("aria-busy");
    text.textContent = message;
    if (!failed) bar.value = 100;
    uploadProgressTimer = setTimeout(() => { box.hidden = true; }, failed ? 4000 : 1200);
  }
  const stats = () => ({
    total: W.products.length,
    units: W.products.reduce((n, p) => n + Number(p.stock || 0), 0),
    low: W.products.filter(p => Number(p.stock) > 0 && Number(p.stock) <= 3).length,
    out: W.products.filter(p => Number(p.stock) <= 0).length,
  });
  const pill = p => { const s = Number(p.stock); return s <= 0 ? '<span class="pill out">Sold out</span>' : s <= 3 ? '<span class="pill low">Low</span>' : '<span class="pill in">In stock</span>'; };
  const normalizeColorHex = value => {
    const hex = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    if (/^#[0-9a-f]{3}$/i.test(hex)) return "#" + [...hex.slice(1)].map(char => char + char).join("");
    return "";
  };
  async function guard(label, fn, upload = false) {
    if (upload) showUploadProgress(label);
    try {
      S.toast(label);
      await fn(updateUploadProgress);
      if (upload) finishUploadProgress("Upload complete.");
    } catch (e) {
      const message = e && e.message ? e.message : "Something went wrong.";
      if (upload) finishUploadProgress(message, true);
      S.toast(message);
    }
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
      <div id="attn">${attn.length ? attn.map(x => stockRowHTML(x.p, x.i)).join("") : '<p class="empty">Everything is comfortably stocked.</p>'}</div></div>`;
    bindStockRows($("attn"));
  }

  function viewInventory(box) {
    box.innerHTML = statsHTML() + `<div class="admin-panel"><div class="panel-header"><h3>Inventory</h3></div>
      <div id="inv">${W.products.length ? W.products.map(stockRowHTML).join("") : '<p class="empty">No products yet.</p>'}</div></div>`;
    bindStockRows($("inv"));
  }

  function viewCatalog(box) {
    box.innerHTML = `<div class="admin-panel"><div class="panel-header"><div><h3>Merch catalog</h3><p class="sub">Edit product details and imagery. Changes go live when saved.</p></div><button class="btn ghost small" id="addProductBtn" type="button">Add product</button></div><div id="adminProducts"></div></div>`;
    $("addProductBtn").onclick = () => {
      const product = { id: Date.now(), name: "New item", cat: "General", price: 0, stock: 0, colors: [], sizes: ["One size"], dims: {}, img: "" };
      W.products.unshift(product);
      expandedProducts.add(String(product.id));
      touch(); renderView();
    };
    const wrap = $("adminProducts");
    if (!W.products.length) wrap.innerHTML = '<p class="empty">No products yet \u2014 add your first one.</p>';
    W.products.forEach((p, idx) => {
      const row = document.createElement("div"); row.className = "prow";
      row.innerHTML = `<details class="product-editor" data-product-id="${esc(String(p.id))}" ${expandedProducts.has(String(p.id)) ? "open" : ""}>
        <summary class="product-summary">
          <img src="${esc(S.mediaURL(p.img) || PH)}" alt="" onerror="imgFallback(this)">
          <span class="product-summary__info"><strong data-role="summary-name">${esc(p.name || "Untitled")}</strong><span data-role="summary-meta">${esc(p.cat)} \u00b7 ${S.fmt(p.price)}</span></span>
          <span data-role="summary-stock">${pill(p)}</span>
          <svg class="product-summary__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </summary>
        <div class="product-editor__body"><div class="top">
        <div class="media-stack"><img data-role="thumb" src="${esc(S.mediaURL(p.img) || PH)}" alt="" onerror="imgFallback(this)">
          <label class="filebtn-label">Upload listing image<input type="file" accept="image/jpeg,image/png,image/webp" class="filebtn" data-role="img-file"></label></div>
        <div class="fields">
          <label class="field"><span>Product name</span><input data-f="name" placeholder="e.g. Graphic cotton tee" value="${esc(p.name)}" aria-label="Name"></label>
          <label class="field"><span>Category</span><input data-f="cat" placeholder="e.g. Tees" value="${esc(p.cat)}" aria-label="Category"></label>
          <label class="field"><span>Price (\u20a6)</span><input data-f="price" placeholder="0" type="number" min="0" value="${Number(p.price) || 0}" aria-label="Price"></label>
          <label class="field"><span>Stock quantity</span><input data-f="stock" placeholder="0" type="number" min="0" value="${Number(p.stock) || 0}" aria-label="Stock"></label>
          <div class="field full2"><span>Available colours</span><div class="product-colors" data-role="colors"></div><button class="btn ghost small" data-role="add-color" type="button">+ Add colour</button></div>
          <label class="field full2"><span>Available sizes</span><input data-f="sizes" placeholder="S, M, L, XL" value="${esc((p.sizes || []).join(", "))}" aria-label="Sizes"></label>
          <label class="field full2"><span>Listing image URL</span><input data-f="img" placeholder="Paste an image URL or use Upload listing image" value="${esc(refValue(p.img))}" aria-label="Photo link"></label>
          <label class="field full2"><span>Product description</span><textarea data-f="description" rows="3" placeholder="Short product details" aria-label="Product description">${esc(refValue(p.description))}</textarea></label>
          <div class="full2 admin-media-field">
            <label class="field"><span>Front mockup URL</span><input data-f="frontImg" placeholder="Front image URL" value="${esc(refValue(p.frontImg || p.img))}" aria-label="Front mockup link"></label>
            <label class="filebtn-label">Front image<input type="file" accept="image/jpeg,image/png,image/webp" class="filebtn" data-role="front-file"></label>
          </div>
          <div class="full2 admin-media-field">
            <label class="field"><span>Back mockup URL</span><input data-f="backImg" placeholder="Back image URL" value="${esc(refValue(p.backImg || p.img))}" aria-label="Back mockup link"></label>
            <label class="filebtn-label">Back image<input type="file" accept="image/jpeg,image/png,image/webp" class="filebtn" data-role="back-file"></label>
          </div>
          <div class="field full2 model-shots-field"><span>Model shots</span>
            <input data-f="modelShots" placeholder="Paste image links, separated by commas" value="${esc(refValue((p.modelShots || []).join(", ")))}" aria-label="Model shot links">
            <label class="filebtn-label">Upload model shots<input type="file" accept="image/jpeg,image/png,image/webp" class="filebtn" data-role="model-shots-file" multiple></label>
            <div class="model-shot-previews" data-role="model-shot-previews"></div>
          </div>
          <div class="full2 admin-media-field">
            <label class="field"><span>Product video URL</span><input data-f="video" placeholder="Optional video link" value="${esc(refValue(p.videoUrl))}" aria-label="Video link"></label>
            <label class="filebtn-label">Upload video<input type="file" accept="video/*" class="filebtn" data-role="video-file"></label>
          </div>
          <video class="mini-video" data-role="vprev" controls playsinline preload="metadata" ${p.videoUrl ? `src="${esc(S.mediaURL(p.videoUrl))}"` : 'style="display:none"'}></video>
        </div></div>
        <div class="rowbtns">${p.videoUrl ? '<button class="del" data-role="rmvideo" type="button">Remove video</button>' : ""}<button class="del" data-role="del" type="button">Remove product</button></div></div></details>`;
      const q = s => row.querySelector(s);
      const editor = q(".product-editor");
      editor.addEventListener("toggle", () => {
        if (editor.open) expandedProducts.add(String(p.id));
        else expandedProducts.delete(String(p.id));
      });
      q('[data-f=name]').oninput = e => { p.name = e.target.value; q('[data-role=summary-name]').textContent = p.name || "Untitled"; touch(); };
      const updateSummaryMeta = () => { q('[data-role=summary-meta]').textContent = (p.cat || "General") + " \u00b7 " + S.fmt(p.price); };
      q('[data-f=cat]').oninput = e => { p.cat = e.target.value; updateSummaryMeta(); touch(); };
      q('[data-f=price]').oninput = e => { p.price = Math.max(0, Number(e.target.value) || 0); updateSummaryMeta(); touch(); };
      q('[data-f=stock]').oninput = e => { p.stock = Math.max(0, Math.floor(Number(e.target.value) || 0)); q('[data-role=summary-stock]').innerHTML = pill(p); touch(); };
      const renderColors = () => {
        const colors = q('[data-role=colors]');
        colors.innerHTML = (p.colors || []).map(([name, value], colorIndex) => {
          const validHex = normalizeColorHex(value);
          return `<div class="product-color-row" data-color-index="${colorIndex}">
            <label><span class="sr-only">Colour name</span><input data-color-name type="text" value="${esc(name)}" placeholder="Colour name" aria-label="Colour ${colorIndex + 1} name"></label>
            <label class="product-color-picker"><span class="sr-only">Choose colour</span><input data-color-picker type="color" value="${validHex || "#888888"}" aria-label="Choose colour ${colorIndex + 1}"></label>
            <label><span class="sr-only">Hex colour</span><input data-color-hex type="text" value="${esc(value)}" placeholder="#000000" aria-label="Hex colour ${colorIndex + 1}"></label>
            <button class="del" data-remove-color type="button" aria-label="Remove colour ${colorIndex + 1}">Remove</button>
          </div>`;
        }).join("") || '<p class="sub">No colours added yet.</p>';
        colors.querySelectorAll(".product-color-row").forEach(colorRow => {
          const index = Number(colorRow.dataset.colorIndex);
          const nameInput = colorRow.querySelector("[data-color-name]");
          const picker = colorRow.querySelector("[data-color-picker]");
          const hexInput = colorRow.querySelector("[data-color-hex]");
          nameInput.oninput = () => { p.colors[index][0] = nameInput.value.trim(); touch(); };
          picker.oninput = () => {
            p.colors[index][1] = picker.value;
            hexInput.value = picker.value;
            hexInput.setCustomValidity("");
            touch();
          };
          hexInput.oninput = () => {
            const normalized = normalizeColorHex(hexInput.value);
            hexInput.setCustomValidity(normalized ? "" : "Enter a valid 3- or 6-digit hex colour, such as #AABBCC.");
            if (!normalized) return;
            p.colors[index][1] = normalized;
            picker.value = normalized;
            touch();
          };
          colorRow.querySelector("[data-remove-color]").onclick = () => {
            p.colors.splice(index, 1);
            touch();
            renderColors();
          };
        });
      };
      q('[data-role=add-color]').onclick = () => {
        if (!p.colors) p.colors = [];
        p.colors.push(["New colour", "#888888"]);
        touch();
        renderColors();
        q('[data-role=colors] .product-color-row:last-child [data-color-name]')?.focus();
      };
      renderColors();
      q('[data-f=sizes]').oninput = e => { p.sizes = e.target.value.split(",").map(s => s.trim()).filter(Boolean); if (!p.sizes.length) p.sizes = ["One size"]; touch(); };
      q('[data-f=img]').oninput = e => { p.img = e.target.value.trim(); q('[data-role=thumb]').src = S.mediaURL(p.img) || PH; touch(); };
      q('[data-f=description]').oninput = e => { p.description = e.target.value.trim(); touch(); };
      q('[data-f=frontImg]').oninput = e => { p.frontImg = e.target.value.trim() || p.img; touch(); };
      q('[data-f=backImg]').oninput = e => { p.backImg = e.target.value.trim() || p.img; touch(); };
      const renderModelShotPreviews = () => {
        const previews = q('[data-role=model-shot-previews]');
        previews.innerHTML = (p.modelShots || []).map((src, shotIndex) => `<div class="model-shot-preview">
          <img src="${esc(S.mediaURL(src) || PH)}" alt="Model shot ${shotIndex + 1}" onerror="imgFallback(this)">
          <button class="del" type="button" data-role="remove-model-shot" data-shot-index="${shotIndex}" aria-label="Remove model shot ${shotIndex + 1}">Remove</button>
        </div>`).join("");
        previews.querySelectorAll('[data-role=remove-model-shot]').forEach(button => {
          button.onclick = () => {
            p.modelShots.splice(Number(button.dataset.shotIndex), 1);
            q('[data-f=modelShots]').value = p.modelShots.join(", ");
            touch();
            renderModelShotPreviews();
          };
        });
      };
      q('[data-f=modelShots]').oninput = e => {
        p.modelShots = e.target.value.split(",").map(v => v.trim()).filter(Boolean);
        touch();
        renderModelShotPreviews();
      };
      q('[data-role=model-shots-file]').onchange = e => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        guard("Processing model shots\u2026", async progress => {
          const uploaded = [];
          for (const [index, file] of files.entries()) {
            const result = await uploadImage(file, 1200, false, percent => progress(Math.round((index + percent / 100) / files.length * 100)));
            uploaded.push(result);
          }
          p.modelShots = [...(p.modelShots || []), ...uploaded];
          touch();
          renderView();
          S.toast(`${uploaded.length} model shot${uploaded.length === 1 ? "" : "s"} added \u2014 remember to Save.`);
        }, true);
      };
      renderModelShotPreviews();
      q('[data-f=video]').oninput = e => {
        p.videoUrl = e.target.value.trim() || undefined;
        const v = q('[data-role=vprev]');
        if (p.videoUrl) { v.src = S.mediaURL(p.videoUrl); v.style.display = "block"; } else { v.removeAttribute("src"); v.style.display = "none"; }
        touch();
      };
      q('[data-role=img-file]').onchange = e => { const f = e.target.files[0]; if (!f) return; guard("Processing photo\u2026", async progress => { p.img = await uploadImage(f, 1200, false, progress); touch(); renderView(); }, true); };
      q('[data-role=front-file]').onchange = e => { const f = e.target.files[0]; if (!f) return; guard("Processing front mock-up\u2026", async progress => { p.frontImg = await uploadImage(f, 1200, false, progress); p.img = p.img || p.frontImg; touch(); renderView(); }, true); };
      q('[data-role=back-file]').onchange = e => { const f = e.target.files[0]; if (!f) return; guard("Processing back mock-up\u2026", async progress => { p.backImg = await uploadImage(f, 1200, false, progress); touch(); renderView(); }, true); };
      q('[data-role=video-file]').onchange = e => {
        const f = e.target.files[0]; if (!f) return;
        guard("Uploading video\u2026", async progress => { p.videoUrl = await uploadVideo(f, progress); touch(); renderView(); S.toast("Video added \u2014 remember to Save."); }, true);
      };
      const rv = q('[data-role=rmvideo]'); if (rv) rv.onclick = () => { p.videoUrl = undefined; touch(); renderView(); };
      q('[data-role=del]').onclick = () => { if (confirm('Remove "' + (p.name || "this product") + '"?')) { expandedProducts.delete(String(p.id)); W.products.splice(idx, 1); touch(); renderView(); } };
      wrap.appendChild(row);
    });
  }

  function viewMedia(box) {
    const lightLogoURL = W.logoLight || (W.logo && W.logo !== S.DEFAULTS.logo ? W.logo : "");
    const darkLogoURL = W.logoDark || (W.logo && W.logo !== S.DEFAULTS.logo ? W.logo : "");
    box.innerHTML = `<div class="admin-grid"><div class="admin-panel"><h3>Logo</h3>
        <p class="sub">Choose a logo for each color mode. If one mode is unset, the existing logo is used as a fallback.</p>
        <div class="logo-row"><img id="logoLightPrev" alt="Light mode logo preview" style="width:96px;height:96px"><div>
          <strong>Light mode</strong>
          <label class="filebtn-label">Upload light mode logo<input type="file" accept="image/jpeg,image/png,image/webp" id="logoLightFile" class="filebtn"></label>
          <div style="margin-top:8px"><button class="btn ghost small" id="logoLightReset" type="button">Use fallback logo</button></div></div></div>
        <div class="logo-row" style="margin-top:16px"><img id="logoDarkPrev" alt="Dark mode logo preview" style="width:96px;height:96px"><div>
          <strong>Dark mode</strong>
          <label class="filebtn-label">Upload dark mode logo<input type="file" accept="image/jpeg,image/png,image/webp" id="logoDarkFile" class="filebtn"></label>
          <div style="margin-top:8px"><button class="btn ghost small" id="logoDarkReset" type="button">Use fallback logo</button></div></div></div>
        ${lightLogoURL || darkLogoURL ? "" : '<p class="sub" style="margin-top:12px">Currently using the bundled Attitude Styles logos.</p>'}</div>
      <div class="admin-panel"><h3>Homepage reel</h3>
        <p class="sub">The "Watch the drop" video on the home page. Paste a link or upload a video from your device.</p>
        <div class="field"><input id="reelUrl" placeholder="Video link" value="${esc(refValue(W.reel))}" aria-label="Reel link"></div>
        <div class="admin-actions"><label class="filebtn-label">Upload video<input type="file" accept="video/*" id="reelFile" class="filebtn"></label>
          <button class="btn ghost small" id="reelClear" type="button">Remove reel</button></div>
        <video id="reelPrev" class="mini-video" controls playsinline preload="metadata" ${W.reel ? `src="${esc(S.mediaURL(W.reel))}"` : 'style="display:none"'}></video></div></div>`;
    const applyLogoPreview = (mode, dark) => {
      const preview = $(`logo${mode}Prev`);
      preview.onerror = () => { preview.onerror = null; preview.src = S.defaultLogoURL(); };
      preview.src = S.logoURLFor(W, dark);
    };
    applyLogoPreview("Light", false);
    applyLogoPreview("Dark", true);
    $("logoLightFile").onchange = e => { const f = e.target.files[0]; if (!f) return; guard("Processing light mode logo\u2026", async progress => { W.logoLight = await uploadImage(f, 800, true, progress); touch(); renderView(); }, true); };
    $("logoDarkFile").onchange = e => { const f = e.target.files[0]; if (!f) return; guard("Processing dark mode logo\u2026", async progress => { W.logoDark = await uploadImage(f, 800, true, progress); touch(); renderView(); }, true); };
    $("logoLightReset").onclick = () => { W.logoLight = ""; touch(); renderView(); };
    $("logoDarkReset").onclick = () => { W.logoDark = ""; touch(); renderView(); };
    $("reelUrl").oninput = e => {
      W.reel = e.target.value.trim(); const v = $("reelPrev");
      S.setVideoSource(v, W.reel ? S.mediaURL(W.reel) : "");
      if (W.reel) v.style.display = "block"; else v.style.display = "none";
      touch();
    };
    $("reelFile").onchange = e => { const f = e.target.files[0]; if (!f) return; guard("Uploading video\u2026", async progress => { W.reel = await uploadVideo(f, progress); touch(); renderView(); S.toast("Reel added \u2014 remember to Save."); }, true); };
    $("reelClear").onclick = () => { W.reel = ""; touch(); renderView(); };
  }

  function viewSettings(box) {
    box.innerHTML = `<div class="admin-panel"><h3>Store settings</h3>
      <div class="field"><label for="fWhatsapp">WhatsApp number (digits only, with country code)</label><input id="fWhatsapp" inputmode="numeric" value="${esc(W.whatsapp)}"></div>
      <div class="field"><label for="fTagline">Hero tagline</label><input id="fTagline" value="${esc(W.tagline)}"></div>
      <div class="field"><label for="fAnnounce">Announcement banner (leave blank to hide)</label><input id="fAnnounce" placeholder="e.g. New drop this Saturday" value="${esc(W.announcement || "")}"></div>
      <p class="sub">Every WhatsApp button on the site (hero, contact page, footer, floating button, order buttons) uses this number.</p></div>
      <div class="settings-reset"><div><b>Restore defaults</b><p class="sub">Replace the live catalog and settings with the bundled defaults.</p></div>
      <button class="btn ghost small" id="resetBtn" type="button">Restore</button></div>`;
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

  function orderStatusLabel(status) {
    return ({ confirmed: "Confirmed", fulfilled: "Fulfilled", cancelled: "Cancelled" })[status] || status;
  }

  async function refreshOrders(box, notice = "") {
    const list = $("ordersList"), feedback = $("ordersFeedback");
    if (!list || !feedback) return;
    if (!supabaseConfigured) {
      list.innerHTML = '<p class="empty">The secure order log is unavailable until Supabase is configured.</p>';
      feedback.textContent = "Configure Supabase and apply the manual-orders migration to enable this feature.";
      return;
    }

    try {
      const { data, error } = await getSupabaseClient()
        .from("manual_orders")
        .select("id, customer_name, customer_phone, delivery_address, city_state, order_summary, total_amount, status, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      if (tab !== "orders" || !$("ordersList")) return;
      list.innerHTML = data.length ? data.map(order => `<article class="order-record">
        <div class="order-record__header"><div><b>${esc(order.customer_name)}</b><small>${esc(order.customer_phone)} \u00b7 ${new Date(order.created_at).toLocaleString()}</small></div>
          <strong>${S.fmt(order.total_amount)}</strong></div>
        <div class="order-record__meta">${[order.delivery_address, order.city_state].filter(Boolean).map(esc).join(" \u00b7 ") || "No delivery details recorded"}</div>
        <p class="order-record__summary">${esc(order.order_summary)}</p>
        <label class="order-record__status">Order status
          <select data-order-status="${esc(order.id)}" aria-label="Status for order ${esc(order.id)}">
            ${["confirmed", "fulfilled", "cancelled"].map(status => `<option value="${status}" ${status === order.status ? "selected" : ""}>${orderStatusLabel(status)}</option>`).join("")}
          </select>
        </label>
      </article>`).join("") : '<p class="empty">No confirmed orders logged yet.</p>';
      feedback.textContent = notice || `${data.length} recent order${data.length === 1 ? "" : "s"}.`;
    } catch (error) {
      list.innerHTML = '<p class="empty">Could not load the order log.</p>';
      feedback.textContent = error.message || "Could not load the order log.";
    }
  }

  function viewOrders(box) {
    box.innerHTML = `<div class="admin-panel"><div class="panel-header"><div><h3>Confirmed WhatsApp orders</h3>
      <p class="sub">Log an order after confirming it with the customer in WhatsApp. Customer details are stored in the admin-only Supabase order table.</p></div></div>
      <div class="order-policy"><b>Stock is not reserved by a WhatsApp message.</b> After confirming the order, adjust inventory separately in the Inventory section.</div>
      <form id="orderLogForm" class="order-log-form">
        <div class="admin-grid">
          <div class="field"><label for="orderCustomer">Customer name</label><input id="orderCustomer" maxlength="120" required></div>
          <div class="field"><label for="orderPhone">Phone number</label><input id="orderPhone" type="tel" maxlength="40" required></div>
          <div class="field"><label for="orderAddress">Delivery address</label><input id="orderAddress" maxlength="300"></div>
          <div class="field"><label for="orderCity">City / State</label><input id="orderCity" maxlength="120"></div>
          <div class="field"><label for="orderTotal">Confirmed order total (\u20a6)</label><input id="orderTotal" type="number" min="0" max="1000000000" step="0.01" required></div>
        </div>
        <div class="field"><label for="orderSummary">Items and variants (paste or summarize the confirmed WhatsApp order)</label><textarea id="orderSummary" rows="4" maxlength="5000" required></textarea></div>
        <div class="admin-actions"><button class="btn gold" type="submit">Log confirmed order</button><span id="ordersFeedback" class="status" role="status" aria-live="polite"></span></div>
      </form>
    </div>
    <div class="admin-panel"><div class="panel-header"><h3>Recent orders</h3><span class="status">Last 100</span></div><div id="ordersList"><p class="empty">Loading orders\u2026</p></div></div>`;

    const form = $("orderLogForm");
    form.onsubmit = async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const feedback = $("ordersFeedback");
      feedback.textContent = "Saving confirmed order\u2026";
      try {
        const client = getSupabaseClient();
        const { data: userData, error: userError } = await client.auth.getUser();
        if (userError) throw userError;
        const { error } = await client.from("manual_orders").insert({
          customer_name: $("orderCustomer").value.trim(),
          customer_phone: $("orderPhone").value.trim(),
          delivery_address: $("orderAddress").value.trim(),
          city_state: $("orderCity").value.trim(),
          order_summary: $("orderSummary").value.trim(),
          total_amount: Number($("orderTotal").value),
          status: "confirmed",
          created_by: userData.user ? userData.user.id : null,
        });
        if (error) throw error;
        form.reset();
        await refreshOrders(box, "Confirmed order logged.");
      } catch (error) {
        feedback.textContent = error.message || "Could not save the confirmed order.";
      }
    };

    $("ordersList").onchange = async event => {
      const select = event.target.closest("[data-order-status]");
      if (!select) return;
      select.disabled = true;
      const feedback = $("ordersFeedback");
      feedback.textContent = "Updating order status\u2026";
      try {
        const { error } = await getSupabaseClient().from("manual_orders")
          .update({ status: select.value, updated_at: new Date().toISOString() })
          .eq("id", select.dataset.orderStatus);
        if (error) throw error;
        await refreshOrders(box, "Order status updated.");
      } catch (error) {
        feedback.textContent = error.message || "Could not update order status.";
        select.disabled = false;
      }
    };

    refreshOrders(box);
  }

  function viewAbout(box) {
    const about = W.about || (W.about = clone(S.DEFAULTS.about));
    box.innerHTML = `<div class="admin-panel"><h3>About the brand</h3>
      <div class="field"><label for="aboutTitleInput">Section heading</label><input id="aboutTitleInput" maxlength="100" value="${esc(about.title)}"></div>
      <div class="field"><label for="aboutBodyInput">Brand story</label><textarea id="aboutBodyInput" rows="5" maxlength="2000">${esc(about.body)}</textarea></div>
      <div class="field"><label for="aboutBgUrl">Hero background image URL</label><input id="aboutBgUrl" value="${esc(refValue(about.backgroundImage))}" placeholder="Paste a direct image URL or upload below"></div>
      <div class="logo-row"><img id="aboutBgPreview" alt="About section preview" style="width:180px;height:120px;object-fit:cover;border-radius:12px;border:1px solid var(--line)"><div>
        <label class="filebtn-label">Upload hero image<input type="file" accept="image/jpeg,image/png,image/webp" id="aboutBgFile" class="filebtn"></label>
      </div></div>
      <h3>Highlights</h3>
      <div id="aboutHighlightFields"></div></div>`;
    const bgPreview = $("aboutBgPreview");
    const updateBgPreview = () => {
      const url = S.mediaURL(about.backgroundImage) || PH;
      bgPreview.onerror = () => { bgPreview.onerror = null; bgPreview.src = PH; };
      bgPreview.src = url;
    };
    $("aboutTitleInput").oninput = e => { about.title = e.target.value; touch(); };
    $("aboutBodyInput").oninput = e => { about.body = e.target.value; touch(); };
    $("aboutBgUrl").oninput = e => { about.backgroundImage = e.target.value.trim(); updateBgPreview(); touch(); };
    $("aboutBgFile").onchange = e => { const f = e.target.files[0]; if (!f) return; guard("Uploading hero photo\u2026", async progress => { about.backgroundImage = await uploadImage(f, 1600, false, progress); updateBgPreview(); touch(); renderView(); }, true); };
    $("aboutHighlightFields").innerHTML = about.highlights.map((item, index) => `<div class="admin-grid">
      <div class="field"><label for="aboutHighlightTitle${index}">Highlight ${index + 1} title</label><input id="aboutHighlightTitle${index}" maxlength="80" value="${esc(item.title)}"></div>
      <div class="field"><label for="aboutHighlightText${index}">Highlight ${index + 1} text</label><input id="aboutHighlightText${index}" maxlength="180" value="${esc(item.text)}"></div>
      </div>`).join("");
    about.highlights.forEach((item, index) => {
      $("aboutHighlightTitle" + index).oninput = e => { item.title = e.target.value; touch(); };
      $("aboutHighlightText" + index).oninput = e => { item.text = e.target.value; touch(); };
    });
    updateBgPreview();
  }

  function viewGallery(box) {
    const gallery = W.gallery || (W.gallery = clone(S.DEFAULTS.gallery));
    box.innerHTML = `<div class="admin-panel"><h3>Brand gallery</h3>
      <div class="field"><label for="galleryTitleInput">Gallery title</label><input id="galleryTitleInput" maxlength="120" value="${esc(gallery.title)}"></div>
      <div class="field"><label for="gallerySubtitleInput">Gallery subtitle</label><input id="gallerySubtitleInput" maxlength="220" value="${esc(gallery.subtitle)}"></div>
      <div class="admin-actions"><button class="btn ghost small" id="galleryAddShot" type="button">+ Add gallery shot</button></div>
      <div id="galleryImageList" class="gallery-admin-list"></div></div>`;
    $("galleryTitleInput").oninput = e => { gallery.title = e.target.value; touch(); };
    $("gallerySubtitleInput").oninput = e => { gallery.subtitle = e.target.value; touch(); };
    const list = $("galleryImageList");
    const renderImages = () => {
      list.innerHTML = (gallery.images || []).map((src, index) => `<div class="gallery-shot-item">
        <img src="${esc(S.mediaURL(src) || PH)}" alt="Gallery shot ${index + 1}" onerror="imgFallback(this)">
        <div class="field"><input value="${esc(refValue(src))}" data-gallery-url="${index}" aria-label="Gallery image ${index + 1}"></div>
        <div class="admin-actions"><label class="filebtn-label">Upload image<input type="file" accept="image/jpeg,image/png,image/webp" class="filebtn" data-gallery-file="${index}"></label><button class="del" data-gallery-remove="${index}" type="button">Remove</button></div>
      </div>`).join("") || '<p class="empty">No gallery shots yet.</p>';
      list.querySelectorAll("[data-gallery-url]").forEach(input => {
        input.oninput = e => {
          const idx = Number(input.dataset.galleryUrl);
          gallery.images[idx] = e.target.value.trim(); touch();
        };
      });
      list.querySelectorAll("[data-gallery-file]").forEach(input => {
        input.onchange = e => {
          const idx = Number(input.dataset.galleryFile); const f = e.target.files[0]; if (!f) return;
          guard("Uploading gallery shot\u2026", async progress => { gallery.images[idx] = await uploadImage(f, 1600, false, progress); touch(); renderView(); }, true);
        };
      });
      list.querySelectorAll("[data-gallery-remove]").forEach(btn => {
        btn.onclick = () => {
          const idx = Number(btn.dataset.galleryRemove);
          gallery.images.splice(idx, 1);
          touch(); renderView();
        };
      });
    };
    $("galleryAddShot").onclick = () => {
      if (!gallery.images) gallery.images = [];
      gallery.images.push("assets/gallery/photo_1_2026-10-31_00-46-32.jpg");
      touch(); renderView();
    };
    renderImages();
  }

  const VIEWS = { overview: viewOverview, catalog: viewCatalog, inventory: viewInventory, orders: viewOrders, media: viewMedia, about: viewAbout, gallery: viewGallery, settings: viewSettings };
  const TITLES = { overview: "Admin overview", catalog: "Catalog", inventory: "Inventory", orders: "Orders", media: "Logo & media", about: "About the brand", gallery: "Gallery", settings: "Settings" };
  function renderView() {
    const box = $("adminView"); if (!box) return;
    box.querySelectorAll(".product-editor").forEach(editor => {
      expandedProducts.delete(editor.dataset.productId);
      if (editor.open) expandedProducts.add(editor.dataset.productId);
    });
    const productIds = new Set(W.products.map(product => String(product.id)));
    expandedProducts.forEach(id => { if (!productIds.has(id)) expandedProducts.delete(id); });
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
        <div class="admin-brand-wrap"><img class="admin-logo" data-logo data-logo-mark alt="Attitude Styles logo"><div><p class="eyebrow">Store manager</p><h2>Attitude Styles</h2></div></div>
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
    document.querySelectorAll(".nav-section").forEach(b => b.onclick = () => {
      tab = b.dataset.tab; renderView();
      const m = document.querySelector(".admin-main");
      if (m && window.matchMedia("(min-width:981px)").matches) m.scrollIntoView({ block: "start" });
    });
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
    if (lg) { lg.onerror = () => { lg.onerror = null; lg.src = S.defaultLogoURL(true); };
      const theme = document.documentElement.getAttribute("data-theme");
      lg.src = S.logoURLFor(S.data, theme ? theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches, true); }
    tab = "overview"; expandedProducts = new Set(); renderView();
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
