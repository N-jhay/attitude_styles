// ---- Storefront logic (shared by every page). Reads defaults from js/data.js (window.STORE_DATA).
// Published catalog changes are loaded and saved through the same-origin Pages API.
"use strict";

const ROOT = window.SITE_ROOT || "";                       // "" on the home page, "../" in sub-folders
const DEFAULTS = JSON.parse(JSON.stringify(window.STORE_DATA));
let DATA = window.STORE_DATA;
const isDarkTheme = () => {
  const theme = document.documentElement.getAttribute("data-theme");
  return theme ? theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};
const defaultLogoURL = (mark = false) => ROOT + "assets/" + (mark
  ? (isDarkTheme() ? "logo-mark.png" : "logo-mark-dark.png")
  : (isDarkTheme() ? "logo.png" : "logo-dark.png"));
const logoURLFor = (data, dark = isDarkTheme(), mark = false) => {
  const themedLogo = dark ? data.logoDark : data.logoLight;
  const legacyLogo = data.logo && data.logo !== DEFAULTS.logo ? data.logo : "";
  const bundledLogo = ROOT + "assets/" + (mark
    ? (dark ? "logo-mark.png" : "logo-mark-dark.png")
    : (dark ? "logo.png" : "logo-dark.png"));
  return mediaURL(themedLogo || legacyLogo) || bundledLogo;
};

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = n => "\u20a6" + Number(n || 0).toLocaleString("en-NG");
const isAbs = u => /^(https?:|data:|blob:|\/)/i.test(u);
const PH = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="#8884"/><text x="200" y="255" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#888">No image</text></svg>');
window.imgFallback = el => { el.onerror = null; el.src = PH; };

/* ---------- WhatsApp ---------- */
const waNumber = () => String(DATA.whatsapp || "").replace(/\D/g, "");
const wa = m => "https://wa.me/" + waNumber() + (m ? "?text=" + encodeURIComponent(m) : "");
function openWa(url) {                                     // for JS-triggered opens (popup-blocker safe)
  const w = window.open(url, "_blank");
  if (w) { try { w.opener = null; } catch (e) {} } else { location.href = url; }
}
function prettyNumber() {
  const n = waNumber();
  if (n.length === 13 && n.startsWith("234")) return "+234 " + n.slice(3, 6) + " " + n.slice(6, 9) + " " + n.slice(9);
  return n ? "+" + n : "";
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  let t = $("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
const SUPABASE_CONFIG = window.APP_CONFIG || {};
const isDemoValue = value => typeof value === "string" && /example\.supabase\.co|demo-anon-key|admin@example\.com/i.test(value);
const supabaseConfigured = !!(SUPABASE_CONFIG.supabaseUrl && SUPABASE_CONFIG.supabaseAnonKey && window.supabase && window.supabase.createClient && !isDemoValue(SUPABASE_CONFIG.supabaseUrl) && !isDemoValue(SUPABASE_CONFIG.supabaseAnonKey));
const getSupabaseClient = () => supabaseConfigured ? window.supabase.createClient(SUPABASE_CONFIG.supabaseUrl, SUPABASE_CONFIG.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;

async function fetchStoreFromSupabase() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.from("store_state").select("data_json").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data && data.data_json ? data.data_json : null;
}

const mediaURL = u => !u ? "" : (isAbs(u) ? u : ROOT + u);
function setVideoSource(video, url) {
  const nextURL = url ? new URL(url, document.baseURI).href : "";
  if (video.src === nextURL) return;
  video.pause();
  if (video._visibilityObserver) {
    video._visibilityObserver.disconnect();
    video._visibilityObserver = null;
  }
  video.removeAttribute("src");
  video.load();
  if (nextURL) {
    video.src = nextURL;
    video.load();
  }
}
function uploadRequest(url, body, headers, onProgress, withCredentials = false) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.withCredentials = withCredentials;
    Object.entries(headers).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.onprogress = event => {
      if (event.lengthComputable && onProgress) onProgress(Math.round(event.loaded / event.total * 100));
    };
    request.onerror = () => reject(new Error("Media upload network error."));
    request.onabort = () => reject(new Error("Media upload was cancelled."));
    request.onload = () => {
      let result = {};
      try { result = JSON.parse(request.responseText); } catch {}
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(result.error || result.message || "Media upload failed."));
      } else {
        resolve(result);
      }
    };
    request.send(body);
  });
}
async function saveMedia(file, onProgress) {
  const filename = `${Date.now()}-${(file.name || "upload").replace(/[^a-zA-Z0-9._-]/g, "-")}`;
  if (supabaseConfigured) {
    const client = getSupabaseClient();
    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw new Error(error.message || "Could not verify the admin session.");
    if (!session) throw new Error("Please sign in again before uploading media.");
    const url = `${SUPABASE_CONFIG.supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/media/${encodeURIComponent(filename)}`;
    await uploadRequest(url, file, {
      apikey: SUPABASE_CONFIG.supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
      "cache-control": "max-age=3600",
      "content-type": file.type || "application/octet-stream",
      "x-upsert": "false",
    }, onProgress);
    const { data: publicUrlData } = client.storage.from("media").getPublicUrl(filename);
    return publicUrlData.publicUrl;
  }
  const form = new FormData();
  form.append("file", file, "upload");
  const result = await uploadRequest(ROOT + "api/admin/media", form, {}, onProgress, true);
  if (typeof result.url !== "string" || !result.url) throw new Error("Media upload did not return a URL.");
  return result.url;
}
async function persist(d) {
  const client = getSupabaseClient();
  if (client) {
    const { error } = await client.from("store_state").upsert({ id: 1, data_json: d, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) throw new Error(error.message || "Could not save store data.");
    return;
  }
  const response = await fetch(ROOT + "api/admin/store", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(d),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Could not save store data.");
}
async function resetToDefaults() {
  await persist(DEFAULTS);
  DATA = JSON.parse(JSON.stringify(DEFAULTS)); window.STORE_DATA = DATA;
  cart = cart.filter(l => DATA.products.some(p => p.id === l.pid)); saveCart();
  renderAll();
}

/* ---------- Rendering ---------- */
const isDefaultLogo = () => !DATA.logo || DATA.logo === DEFAULTS.logo;
let activeCat = "All", query = "", cart = [], cur = null, sel = {};
let galleryLightboxImages = [], galleryLightboxIndex = 0;

function stockInfo(p) {
  if (Number(p.stock) <= 0) return { cls: "out", label: "Sold out", line: "Sold out \u2014 ask about restock" };
  if (p.stock <= 3) return { cls: "low", label: "Low stock", line: "Low stock: " + p.stock + " left" };
  return { cls: "in", label: "In stock", line: "In stock: " + p.stock + " available" };
}

function renderCommon() {
  // Logo everywhere (header, hero, admin, contact...). Falls back to the bundled logo if a custom one fails.
  document.querySelectorAll("img[data-logo]").forEach(img => {
    const setDefault = () => { img.onerror = null; img.src = defaultLogoURL(img.hasAttribute("data-logo-mark")); };
    img.onerror = setDefault;
    img.src = logoURLFor(DATA, isDarkTheme(), img.hasAttribute("data-logo-mark"));
  });
  // Every WhatsApp button/link on every page
  document.querySelectorAll("a[data-wa]").forEach(a => {
    a.href = wa(a.dataset.wa); a.target = "_blank"; a.rel = "noopener";
  });
  document.querySelectorAll("[data-wa-number]").forEach(e => { e.textContent = prettyNumber(); });
  document.querySelectorAll("a[data-tel]").forEach(a => { a.href = "tel:+" + waNumber(); });
  const bar = $("announceBar");
  if (bar) {
    if (DATA.announcement && DATA.announcement.trim()) { bar.textContent = DATA.announcement; bar.style.display = "block"; }
    else bar.style.display = "none";
  }
  const tag = $("heroTag"); if (tag) tag.textContent = DATA.tagline;
  const about = DATA.about || DEFAULTS.about;
  const aboutTitle = $("aboutTitle"), aboutBody = $("aboutBody"), aboutHighlights = $("aboutHighlights");
  if (aboutTitle) aboutTitle.textContent = about.title;
  if (aboutBody) aboutBody.textContent = about.body;
  if (aboutHighlights) aboutHighlights.innerHTML = about.highlights.map(item => `<div class="stat"><b>${esc(item.title)}</b><span>${esc(item.text)}</span></div>`).join("");
  const heroImage = $("aboutHeroImage");
  const heroBackdrop = $("aboutHeroBackdrop");
  const aboutBg = about.backgroundImage || (DEFAULTS.about && DEFAULTS.about.backgroundImage) || "";
  const bgUrl = aboutBg ? mediaURL(aboutBg) : "";
  if (heroImage) heroImage.style.backgroundImage = bgUrl ? `url("${bgUrl}")` : "none";
  if (heroBackdrop) heroBackdrop.style.backgroundImage = bgUrl ? `url("${bgUrl}")` : "none";
  updCount();
}

function renderGallery() {
  const gallery = $("galleryGrid"); if (!gallery) return;
  const source = DATA.gallery && Array.isArray(DATA.gallery.images) && DATA.gallery.images.length ? DATA.gallery.images : DEFAULTS.gallery.images;
  const galleryTitle = $("galleryTitle");
  const gallerySubtitle = $("gallerySubtitle");
  if (galleryTitle && DATA.gallery && DATA.gallery.title) galleryTitle.textContent = DATA.gallery.title;
  if (gallerySubtitle && DATA.gallery && DATA.gallery.subtitle) gallerySubtitle.textContent = DATA.gallery.subtitle;
  galleryLightboxImages = source.map(image => mediaURL(image) || PH);
  gallery.innerHTML = galleryLightboxImages.map((image, index) => `<figure class="gallery-card">
    <button class="gallery-card__view" type="button" data-gallery-view="${index}" aria-label="View gallery image ${index + 1}">
      <img src="${esc(image)}" alt="Attitude Styles gallery shot ${index + 1}" loading="lazy" decoding="async" onerror="imgFallback(this)">
      <span class="gallery-card__hint" aria-hidden="true">View image</span>
    </button>
  </figure>`).join("");
  if (!$("galleryLightbox")) {
    const dialog = document.createElement("dialog");
    dialog.id = "galleryLightbox";
    dialog.className = "gallery-lightbox";
    dialog.setAttribute("aria-label", "Gallery image viewer");
    dialog.innerHTML = `<button class="gallery-lightbox__close" type="button" data-gallery-close aria-label="Close image viewer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      <button class="gallery-lightbox__nav gallery-lightbox__prev" type="button" data-gallery-step="-1" aria-label="Previous image"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
      <img class="gallery-lightbox__image" alt="">
      <button class="gallery-lightbox__nav gallery-lightbox__next" type="button" data-gallery-step="1" aria-label="Next image"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>
      <span class="gallery-lightbox__count" aria-live="polite"></span>`;
    document.body.appendChild(dialog);
  }
}

function showGalleryLightbox(index) {
  const dialog = $("galleryLightbox");
  if (!dialog || !galleryLightboxImages.length) return;
  galleryLightboxIndex = (index + galleryLightboxImages.length) % galleryLightboxImages.length;
  const image = dialog.querySelector(".gallery-lightbox__image");
  image.src = galleryLightboxImages[galleryLightboxIndex];
  image.alt = `Attitude Styles gallery shot ${galleryLightboxIndex + 1}`;
  dialog.querySelector(".gallery-lightbox__count").textContent = `${galleryLightboxIndex + 1} / ${galleryLightboxImages.length}`;
  if (!dialog.open) dialog.showModal();
}

function renderProductPage() {
  const detail = $("productDetail"); if (!detail) return;
  const params = new URLSearchParams(location.search);
  const requestedId = Number(params.get("id"));
  const product = DATA.products.find(p => p.id === requestedId) || DATA.products[0];
  if (!product) {
    detail.innerHTML = '<div class="empty">This product is no longer available.</div>';
    return;
  }
  if (!cur || cur.id !== product.id || !sel.s) {
    cur = product;
    sel = { c: (product.colors && product.colors[0]) || ["Standard", ""], s: (product.sizes && product.sizes[0]) || "One size", q: 1, reel: false };
  } else cur = product;
  const front = product.frontImg || product.img;
  const back = product.backImg || product.img;
  const modelShots = Array.isArray(product.modelShots) && product.modelShots.length ? product.modelShots : [product.img];
  const details = (product.dims && Object.entries(product.dims).map(([size, value]) => `<li><span>${esc(size)}</span><strong>${esc(value)}</strong></li>`).join("")) || "";
  const out = Number(product.stock) <= 0, maxQ = Math.max(1, Number(product.stock) || 1);
  detail.innerHTML = `<section class="product-page-wrap">
    <div class="product-page-hero">
      <div class="product-page-media">
        <img src="${esc(mediaURL(front) || PH)}" alt="${esc(product.name)} front" fetchpriority="high" decoding="async" onerror="imgFallback(this)">
      </div>
      <div class="product-page-info">
        <span class="eyebrow">${esc(product.cat)}</span>
        <h1>${esc(product.name)}</h1>
        <div class="price large" id="productPagePrice">${fmt(product.price * sel.q)}</div>
        <p>${esc(product.description || "Built for confidence, movement, and everyday wear.")}</p>
        <div class="lab">Color: ${esc(sel.c[0])}</div>
        <div class="swrow">${(product.colors || []).map(c => `<button type="button" style="background:${esc(c[1])}" aria-label="${esc(c[0])}" aria-pressed="${c[0] === sel.c[0]}" data-col="${esc(c[0])}"></button>`).join("")}</div>
        <div class="lab">Size</div>
        <div class="szrow">${(product.sizes || ["One size"]).map(size => `<button type="button" aria-pressed="${size === sel.s}" data-sz="${esc(size)}">${esc(size)}</button>`).join("")}</div>
        <div class="dim">${esc(dims(product, sel.s))}</div>
        <div class="lab">Quantity</div>
        <div class="qty"><button type="button" data-q="-1" aria-label="Decrease quantity">\u2212</button><span>${sel.q}</span><button type="button" data-q="1" aria-label="Increase quantity" ${sel.q >= maxQ ? "disabled" : ""}>+</button></div>
        <div class="product-actions">
          ${out
    ? `<button class="btn gold" type="button" data-restock="${product.id}">Ask about restock</button>`
    : `<button class="btn gold" type="button" data-add="1">Add to bag</button>`}
          <a class="btn ghost" href="${ROOT}shop/index.html">Back to shop</a>
        </div>
        <ul class="product-specs">${details}</ul>
      </div>
    </div>
    <div class="product-gallery-grid">
      <div class="product-gallery-card">
        <span class="eyebrow">Front mockup</span>
        <img src="${esc(mediaURL(front) || PH)}" alt="${esc(product.name)} front mockup" loading="lazy" decoding="async" onerror="imgFallback(this)">
      </div>
      <div class="product-gallery-card">
        <span class="eyebrow">Back mockup</span>
        <img src="${esc(mediaURL(back) || PH)}" alt="${esc(product.name)} back mockup" loading="lazy" decoding="async" onerror="imgFallback(this)">
      </div>
      ${modelShots.map((shot, index) => `<div class="product-gallery-card model-shot-card"><img src="${esc(mediaURL(shot) || PH)}" alt="${esc(product.name)} model shot ${index + 1}" loading="lazy" decoding="async" onerror="imgFallback(this)"></div>`).join("")}
    </div>
  </section>`;
}

function renderAll() {
  renderCommon();
  const reelWrap = $("reelWrap"), rv = $("reelV");
  if (reelWrap && rv) {
    const u = mediaURL(DATA.reel);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rv.autoplay = false; rv.preload = "none"; rv.muted = true; rv.loop = true; rv.playsInline = true; rv.controls = reducedMotion;
    rv.setAttribute("playsinline", "true"); rv.setAttribute("muted", "true"); rv.setAttribute("loop", "true");
    setVideoSource(rv, u);
    if (u) reelWrap.style.display = "block"; else reelWrap.style.display = "none";
    if (u && !reducedMotion && "IntersectionObserver" in window) {
      if (rv._visibilityObserver) rv._visibilityObserver.disconnect();
      rv._visibilityObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) rv.play().catch(() => {});
          else rv.pause();
        });
      }, { rootMargin: "160px 0px" });
      rv._visibilityObserver.observe(rv);
    } else if (u && !reducedMotion) rv.play().catch(() => {});
  }
  if ($("grid")) { renderFilters(); renderGrid(); }
  if ($("galleryGrid")) renderGallery();
  if ($("productDetail")) renderProductPage();
  observeRevealMotion();
}

const revealMotionObserver = window.IntersectionObserver && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.dataset.reveal = "visible";
      revealMotionObserver.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -32px 0px" })
  : null;

function observeRevealMotion() {
  if (!revealMotionObserver) return;
  const targets = document.querySelectorAll(".hero,.reel,section,.card,#site-footer,.brand-hero,.gallery-header,.gallery-card,.product-page-hero,.product-gallery-card,.contact-card");
  targets.forEach((element, index) => {
    if (element.dataset.reveal) return;
    element.dataset.reveal = "pending";
    element.style.setProperty("--reveal-delay", `${Math.min(index % 6, 5) * 55}ms`);
    revealMotionObserver.observe(element);
  });
}

function renderFilters() {
  const row = $("filterRow"); if (!row) return;
  const cats = ["All", ...new Set(DATA.products.map(p => p.cat))];
  if (!cats.includes(activeCat)) activeCat = "All";
  const hadFocus = document.activeElement && document.activeElement.id === "storeSearchInput";
  row.innerHTML = "";
  cats.forEach(c => {
    const b = document.createElement("button"); b.className = "chip"; b.type = "button"; b.textContent = c;
    b.setAttribute("aria-pressed", c === activeCat ? "true" : "false");
    b.onclick = () => { activeCat = c; renderFilters(); renderGrid(); observeRevealMotion(); };
    row.appendChild(b);
  });
  const inp = document.createElement("input"); inp.id = "storeSearchInput"; inp.className = "search";
  inp.type = "search"; inp.placeholder = "Search merch\u2026"; inp.setAttribute("aria-label", "Search merch"); inp.value = query;
  inp.oninput = e => { query = e.target.value; renderGrid(); };
  row.appendChild(inp);
  if (hadFocus) inp.focus();
}

function renderGrid() {
  const grid = $("grid"); if (!grid) return;
  const q = query.trim().toLowerCase();
  const items = DATA.products.filter(p => (activeCat === "All" || p.cat === activeCat) && (p.name + " " + p.cat).toLowerCase().includes(q));
  grid.innerHTML = items.length ? "" : '<p class="empty">Nothing matches that search yet.</p>';
  items.forEach(p => {
    const s = stockInfo(p), out = Number(p.stock) <= 0;
    const card = document.createElement("article"); card.className = "card";
    card.innerHTML = `<a class="card-link" href="${ROOT}shop/product.html?id=${encodeURIComponent(p.id)}"><div class="sw"><span class="tag ${s.cls}">${s.label}</span><img src="${esc(mediaURL(p.img) || PH)}" alt="${esc(p.name)}" loading="lazy" decoding="async" onerror="imgFallback(this)">
      <div class="glaze"><span>${out ? "View restock options" : "View product &amp; mockups"}</span></div></div>
      <div class="cb"><span class="cat">${esc(p.cat)}</span><h3>${esc(p.name)}</h3><span class="price">${fmt(p.price)}</span>
      <div class="dots">${(p.colors || []).map(c => `<span class="dot" style="background:${esc(c[1])}" title="${esc(c[0])}"></span>`).join("")}</div>
      <span class="stockline">${s.line}</span><span class="viewbtn">View product &amp; mockups \u2192</span></div></a>`;
    grid.appendChild(card);
  });
  const ss = $("stockSummary");
  if (ss) ss.textContent = DATA.products.reduce((n, p) => n + Number(p.stock || 0), 0) + " units in stock across " + DATA.products.length + " pieces";
}

/* ---------- Product sheet ---------- */
function openProduct(id) {
  cur = DATA.products.find(p => p.id === id); if (!cur) return;
  sel = { c: (cur.colors && cur.colors[0]) || ["Standard", ""], s: (cur.sizes && cur.sizes[0]) || "One size", q: 1, reel: false };
  drawProduct(); $("pv").classList.add("open");
}
const dims = (p, s) => (p.dims && p.dims[s]) || "";
const oneLine = () => ({ pid: cur.id, c: sel.c[0], s: sel.s, q: sel.q });
function drawProduct() {
  const p = cur, hasColors = (p.colors || []).length > 1, vid = mediaURL(p.videoUrl), maxQ = Math.max(1, Number(p.stock) || 1);
  const media = sel.reel && vid
    ? `<video class="pv" src="${esc(vid)}" controls autoplay loop playsinline muted></video><button class="reelbtn" data-reel="1" type="button">Show product</button>`
    : `<img class="pv" src="${esc(mediaURL(p.img) || PH)}" alt="${esc(p.name)}" onerror="imgFallback(this)">${vid ? `<button class="reelbtn" data-reel="1" type="button">\u25b6 Watch reel</button>` : ""}`;
  $("ps").innerHTML = `<button class="x" data-close="pv" aria-label="Close" type="button">\u2715</button><div class="pm">
   <div class="sw" id="pmMedia">${media}</div>
   <div class="pb"><span class="pcat">${esc(p.cat)}</span><h2>${esc(p.name)}</h2>
   <div class="price" style="font-size:19px;margin-top:5px">${fmt(p.price * sel.q)}</div>
   ${hasColors ? `<div class="lab">Color: ${esc(sel.c[0])}</div><div class="swrow">${p.colors.map(c => `<button type="button" style="background:${esc(c[1])}" aria-label="${esc(c[0])}" aria-pressed="${c[0] === sel.c[0]}" data-col="${esc(c[0])}"></button>`).join("")}</div>` : ""}
   <div class="lab">Size</div><div class="szrow">${(p.sizes || ["One size"]).map(s => `<button type="button" aria-pressed="${s === sel.s}" data-sz="${esc(s)}">${esc(s)}</button>`).join("")}</div>
   <div class="dim">${esc(dims(p, sel.s))}</div>
   <div class="lab">Quantity</div>
   <div class="qty"><button type="button" data-q="-1" aria-label="Less">\u2212</button><span>${sel.q}</span><button type="button" data-q="1" aria-label="More" ${sel.q >= maxQ ? "disabled" : ""}>+</button></div>
   <button class="btn gold full" data-add="1" type="button">Add to bag</button>
   </div></div>`;
}

document.addEventListener("click", e => {
  const el = e.target;
  const restock = el.closest && el.closest("[data-restock]");
  if (restock) {
    const product = DATA.products.find(p => p.id === Number(restock.dataset.restock));
    if (product) openWa(wa(`Hi Attitude Styles! The ${product.name} is sold out — please notify me when it's back.`));
    return;
  }
  const galleryView = el.closest && el.closest("[data-gallery-view]");
  if (galleryView) { showGalleryLightbox(Number(galleryView.dataset.galleryView)); return; }
  const galleryClose = el.closest && el.closest("[data-gallery-close]");
  if (galleryClose) { $("galleryLightbox").close(); return; }
  const galleryStep = el.closest && el.closest("[data-gallery-step]");
  if (galleryStep) { showGalleryLightbox(galleryLightboxIndex + Number(galleryStep.dataset.galleryStep)); return; }
  if (el.classList && el.classList.contains("veil")) { if (!el.hasAttribute("data-static")) el.classList.remove("open"); return; }
  const t = el.closest && el.closest("[data-col],[data-sz],[data-q],[data-add],[data-close],[data-rm],[data-reel]");
  if (!t) return;
  const d = t.dataset;
  const productPageControl = t.closest("#productDetail");
  if (d.col !== undefined && cur) {
    sel.c = cur.colors.find(c => c[0] === d.col) || sel.c;
    if (productPageControl) renderProductPage(); else drawProduct();
  }
  else if (d.sz !== undefined && cur) {
    sel.s = d.sz;
    if (productPageControl) renderProductPage(); else drawProduct();
  }
  else if (d.q !== undefined && cur) {
    sel.q = Math.min(Math.max(1, Number(cur.stock) || 1), Math.max(1, sel.q + Number(d.q)));
    if (productPageControl) renderProductPage(); else drawProduct();
  }
  else if (d.reel !== undefined && cur) { sel.reel = !sel.reel; drawProduct(); }
  else if (d.add !== undefined && cur) addCurrentToBag();
  else if (d.close !== undefined) { const v = $(d.close); if (v) v.classList.remove("open"); }
  else if (d.rm !== undefined) { e.preventDefault(); cart.splice(Number(d.rm), 1); saveCart(); updCount(); drawBag(); }
});
document.addEventListener("keydown", e => {
  if ($("galleryLightbox")?.open) {
    if (e.key === "ArrowRight") { e.preventDefault(); showGalleryLightbox(galleryLightboxIndex + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); showGalleryLightbox(galleryLightboxIndex - 1); }
  }
  if (e.key === "Escape") document.querySelectorAll(".veil:not([data-static])").forEach(v => v.classList.remove("open"));
});

/* ---------- Bag (persists across pages) ---------- */
function loadCart() {
  try { cart = JSON.parse(localStorage.getItem("attitude-cart") || "[]"); } catch (e) { cart = []; }
  cart = (Array.isArray(cart) ? cart : []).filter(l => DATA.products.some(p => p.id === l.pid));
}
function saveCart() { try { localStorage.setItem("attitude-cart", JSON.stringify(cart)); } catch (e) {} }
function addToCart() {
  const l = oneLine(), f = cart.find(x => x.pid === l.pid && x.s === l.s && x.c === l.c);
  if (f) f.q = Math.min(Math.max(1, Number(cur.stock) || 1), f.q + l.q); else cart.push(l);
  saveCart(); updCount();
}
function addCurrentToBag() {
  addToCart();
  $("pv").classList.remove("open");
  toast(`${sel.q} ${sel.q === 1 ? "item" : "items"} added to your bag.`);
}
function updCount() { const c = $("cnt"); if (c) c.textContent = cart.reduce((a, l) => a + l.q, 0); }
const findP = l => DATA.products.find(x => x.id === l.pid);
const lineTotal = l => (findP(l) ? findP(l).price : 0) * l.q;
const bagTotal = () => cart.reduce((a, l) => a + lineTotal(l), 0);
function msgBag() {
  return window.buildCheckoutMessage({
    lines: cart.map(line => {
      const product = findP(line);
      return {
        product: { name: product.name, category: product.cat, price: fmt(product.price) },
        color: line.c,
        size: line.s,
        dimension: dims(product, line.s),
        quantity: line.q,
        total: fmt(lineTotal(line)),
      };
    }),
    total: fmt(bagTotal()),
    name: $("nm") ? $("nm").value.trim() : "",
    phone: $("phone") ? $("phone").value.trim() : "",
    address: $("address") ? $("address").value.trim() : "",
    city: $("ct") ? $("ct").value.trim() : "",
  });
}
function drawBag() {
  const shell = $("bs"); if (!shell) return;
  cart = cart.filter(l => findP(l));
  const keep = {
    name: $("nm") ? $("nm").value : "",
    phone: $("phone") ? $("phone").value : "",
    address: $("address") ? $("address").value : "",
    city: $("ct") ? $("ct").value : "",
  };
  shell.innerHTML = `<button class="x" data-close="bv" aria-label="Close" type="button">\u2715</button><div class="pb"><h2>Your bag</h2>` +
    (cart.length ? cart.map((l, i) => { const p = findP(l); return `<div class="line"><div><b>${esc(p.name)}</b><small>${esc(l.c)} \u00b7 ${esc(l.s)} \u00b7 Qty ${l.q}</small><a href="#" data-rm="${i}">Remove</a></div><b>${fmt(lineTotal(l))}</b></div>`; }).join("") +
      `<div class="tot"><span>Total</span><span>${fmt(bagTotal())}</span></div>
   <div class="checkout-note">Availability, delivery fee, and payment are confirmed with you on WhatsApp. Items are not reserved until confirmed.</div>
   <div class="f"><input id="nm" autocomplete="name" placeholder="Your name (optional)" value="${esc(keep.name)}"><input id="phone" type="tel" autocomplete="tel" placeholder="Phone number (optional)" value="${esc(keep.phone)}"><input id="address" autocomplete="street-address" placeholder="Delivery address (optional)" value="${esc(keep.address)}"><input id="ct" autocomplete="address-level2" placeholder="City / State (optional)" value="${esc(keep.city)}"></div>
   <a class="btn gold full" id="wb" target="_blank" rel="noopener" href="${wa(msgBag())}">Order on WhatsApp</a>`
      : `<div class="empty">Your bag is empty.</div>`) + `</div>`;
  const wb = $("wb");
  if (wb) ["nm", "phone", "address", "ct"].forEach(i => { $(i).oninput = () => { wb.href = wa(msgBag()); }; });
}
const bagBtn = $("bagBtn");
if (bagBtn) bagBtn.onclick = () => { drawBag(); $("bv").classList.add("open"); };

/* ---------- Search icon (works on every page) ---------- */
const searchBtn = $("searchToggle");
if (searchBtn) searchBtn.addEventListener("click", () => {
  if ($("grid")) {
    const s = $("shop"); if (s) s.scrollIntoView({ behavior: "smooth", block: "start" });
    const i = $("storeSearchInput"); if (i) { i.focus(); i.select(); }
  } else location.href = ROOT + "shop/index.html?search=1";
});

/* ---------- Theme ---------- */
const root = document.documentElement, themeToggle = $("themeToggle");
const SUN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 15.5A8 8 0 0 1 8.5 3.6a8 8 0 1 0 11.9 11.9Z"/></svg>';
function applyIcon() {
  if (!themeToggle) return;
  const dark = root.getAttribute("data-theme") === "dark" || (!root.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme:dark)").matches);
  themeToggle.innerHTML = dark ? SUN_ICON : MOON_ICON;
}
try { const sv = localStorage.getItem("attitude-theme"); if (sv) root.setAttribute("data-theme", sv); } catch (e) {}
if (themeToggle) {
  applyIcon();
  themeToggle.onclick = () => {
    const c = root.getAttribute("data-theme") || (window.matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light");
    const n = c === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", n);
    try { localStorage.setItem("attitude-theme", n); } catch (e) {}
    applyIcon();
    renderCommon();
  };
}

/* ---------- Contact form -> WhatsApp ---------- */
(function () {
  const send = $("cfSend"); if (!send) return;
  const build = () => {
    const n = $("cfName").value.trim(), t = $("cfTopic").value, m = $("cfMsg").value.trim();
    return `Hello Attitude Styles!${n ? " I'm " + n + "." : ""}\n\nTopic: ${t}\n${m}`;
  };
  const upd = () => { send.href = wa(build()); };
  ["cfName", "cfTopic", "cfMsg"].forEach(id => { $(id).addEventListener("input", upd); $(id).addEventListener("change", upd); });
  send.addEventListener("click", e => {
    if (!$("cfMsg").value.trim()) { e.preventDefault(); toast("Type a short message first."); $("cfMsg").focus(); return; }
    upd();
  });
  upd();
})();

/* ---------- Boot ---------- */
async function init() {
  loadCart();
  renderAll();
  let updated = false;
  if (supabaseConfigured) {
    try {
      const remote = await fetchStoreFromSupabase();
      if (remote && Array.isArray(remote.products)) {
        DATA = Object.assign({}, JSON.parse(JSON.stringify(DEFAULTS)), remote);
        window.STORE_DATA = DATA;
        updated = true;
      }
    } catch (e) { /* fall back to data.js */ }
  } else {
    try {
      const response = await withTimeout(fetch(ROOT + "api/store", { cache: "no-store" }), 5000);
      if (response.ok) {
        const result = await response.json();
        if (result.data && Array.isArray(result.data.products)) {
          DATA = Object.assign({}, JSON.parse(JSON.stringify(DEFAULTS)), result.data);
          window.STORE_DATA = DATA;
          updated = true;
        }
      }
    } catch (e) { /* fall back to data.js */ }
  }
  if (updated) renderAll();
  if ($("storeSearchInput") && /[?&]search=1/.test(location.search)) $("storeSearchInput").focus();
}

window.Store = {
  ROOT, DEFAULTS, esc, fmt, toast, mediaURL, defaultLogoURL, logoURLFor, setVideoSource, saveMedia, persist, resetToDefaults, renderAll, waNumber,
  get data() { return DATA; },
  set data(d) { DATA = d; window.STORE_DATA = d; },
};
window.Store.ready = init();
