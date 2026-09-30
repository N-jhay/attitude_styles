// ---- Storefront logic (shared by every page). Reads defaults from js/data.js (window.STORE_DATA).
// Published catalog changes are loaded and saved through the same-origin Pages API.
"use strict";

const ROOT = window.SITE_ROOT || "";                       // "" on the home page, "../" in sub-folders
const DEFAULTS = JSON.parse(JSON.stringify(window.STORE_DATA));
let DATA = window.STORE_DATA;

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
async function saveMedia(file) {
  if (supabaseConfigured) {
    const client = getSupabaseClient();
    const filename = `${Date.now()}-${(file.name || "upload").replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const { data, error } = await client.storage.from("media").upload(filename, file, { cacheControl: "3600", upsert: false });
    if (error) throw new Error(error.message || "Media upload failed.");
    const { data: publicUrlData } = client.storage.from("media").getPublicUrl(data.path);
    return publicUrlData.publicUrl;
  }
  const form = new FormData();
  form.append("file", file, "upload");
  const response = await fetch(ROOT + "api/admin/media", { method: "POST", body: form, credentials: "same-origin" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Media upload failed.");
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

function stockInfo(p) {
  if (Number(p.stock) <= 0) return { cls: "out", label: "Sold out", line: "Sold out \u2014 ask about restock" };
  if (p.stock <= 3) return { cls: "low", label: "Low stock", line: "Low stock: " + p.stock + " left" };
  return { cls: "in", label: "In stock", line: "In stock: " + p.stock + " available" };
}

function renderCommon() {
  // Logo everywhere (header, hero, admin, contact...). Falls back to the bundled logo if a custom one fails.
  document.querySelectorAll("img[data-logo]").forEach(img => {
    const setDefault = () => { img.onerror = null; img.src = ROOT + "assets/logo.png"; img.setAttribute("data-invert", "1"); };
    img.onerror = setDefault;
    const u = isDefaultLogo() ? "" : mediaURL(DATA.logo);
    if (u) { img.removeAttribute("data-invert"); img.src = u; } else setDefault();
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
  updCount();
}

function renderAll() {
  renderCommon();
  const reelWrap = $("reelWrap"), rv = $("reelV");
  if (reelWrap && rv) {
    const u = mediaURL(DATA.reel);
    if (u) { if (rv.getAttribute("src") !== u) rv.src = u; reelWrap.style.display = "block"; } else { rv.removeAttribute("src"); reelWrap.style.display = "none"; }
  }
  if ($("grid")) { renderFilters(); renderGrid(); }
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
    b.onclick = () => { activeCat = c; renderFilters(); renderGrid(); };
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
    const card = document.createElement("button"); card.className = "card"; card.type = "button";
    card.innerHTML = `<div class="sw"><span class="tag ${s.cls}">${s.label}</span><img src="${esc(mediaURL(p.img) || PH)}" alt="${esc(p.name)}" loading="lazy" onerror="imgFallback(this)">
      <div class="glaze"><span>${out ? "Ask about restock" : "Choose color &amp; size"}</span></div></div>
      <div class="cb"><span class="cat">${esc(p.cat)}</span><h3>${esc(p.name)}</h3><span class="price">${fmt(p.price)}</span>
      <div class="dots">${(p.colors || []).map(c => `<span class="dot" style="background:${esc(c[1])}" title="${esc(c[0])}"></span>`).join("")}</div>
      <span class="stockline">${s.line}</span><span class="viewbtn">${out ? "Ask about restock" : "Choose color &amp; size"} \u2192</span></div>`;
    card.onclick = () => out
      ? openWa(wa("Hi Attitude Styles! The " + p.name + " is sold out \u2014 please notify me when it's back."))
      : openProduct(p.id);
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
function msgOne() {
  const l = oneLine(), d = dims(cur, sel.s);
  return `Hello Attitude Styles! I'd like to order:\n\n*${cur.name}*\nType: ${cur.cat}\nColor: ${l.c}\nSize: ${l.s}${d ? ` (${d})` : ""}\nQty: ${l.q} x ${fmt(cur.price)} = ${fmt(cur.price * l.q)}\n\n*Total: ${fmt(cur.price * l.q)}*\n\nPlease confirm availability and payment details.`;
}
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
   <a class="btn gold full" target="_blank" rel="noopener" href="${wa(msgOne())}">Order on WhatsApp</a>
   <button class="btn ghost full" data-add="1" type="button">Add to bag</button>
   </div></div>`;
}

document.addEventListener("click", e => {
  const el = e.target;
  if (el.classList && el.classList.contains("veil")) { if (!el.hasAttribute("data-static")) el.classList.remove("open"); return; }
  const t = el.closest && el.closest("[data-col],[data-sz],[data-q],[data-add],[data-close],[data-rm],[data-reel]");
  if (!t) return;
  const d = t.dataset;
  if (d.col !== undefined && cur) { sel.c = cur.colors.find(c => c[0] === d.col) || sel.c; drawProduct(); }
  else if (d.sz !== undefined && cur) { sel.s = d.sz; drawProduct(); }
  else if (d.q !== undefined && cur) { sel.q = Math.min(Math.max(1, Number(cur.stock) || 1), Math.max(1, sel.q + Number(d.q))); drawProduct(); }
  else if (d.reel !== undefined && cur) { sel.reel = !sel.reel; drawProduct(); }
  else if (d.add !== undefined && cur) { addToCart(); $("pv").classList.remove("open"); drawBag(); $("bv").classList.add("open"); }
  else if (d.close !== undefined) { const v = $(d.close); if (v) v.classList.remove("open"); }
  else if (d.rm !== undefined) { e.preventDefault(); cart.splice(Number(d.rm), 1); saveCart(); updCount(); drawBag(); }
});
document.addEventListener("keydown", e => {
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
function updCount() { const c = $("cnt"); if (c) c.textContent = cart.reduce((a, l) => a + l.q, 0); }
const findP = l => DATA.products.find(x => x.id === l.pid);
const lineTotal = l => (findP(l) ? findP(l).price : 0) * l.q;
const bagTotal = () => cart.reduce((a, l) => a + lineTotal(l), 0);
function msgBag() {
  const nm = $("nm") ? $("nm").value.trim() : "", ct = $("ct") ? $("ct").value.trim() : "";
  const lines = cart.map((l, i) => {
    const p = findP(l), d = dims(p, l.s);
    return `${i + 1}. *${p.name}*\n   Type: ${p.cat}\n   Color: ${l.c}\n   Size: ${l.s}${d ? ` (${d})` : ""}\n   Qty: ${l.q} x ${fmt(p.price)} = ${fmt(p.price * l.q)}`;
  }).join("\n\n");
  return `Hello Attitude Styles! I'd like to order:\n\n${lines}\n\n*Total: ${fmt(bagTotal())}*${nm ? `\nName: ${nm}` : ""}${ct ? `\nCity/State: ${ct}` : ""}\n\nPlease confirm availability and payment details.`;
}
function drawBag() {
  const shell = $("bs"); if (!shell) return;
  cart = cart.filter(l => findP(l));
  const keep = { n: $("nm") ? $("nm").value : "", c: $("ct") ? $("ct").value : "" };
  shell.innerHTML = `<button class="x" data-close="bv" aria-label="Close" type="button">\u2715</button><div class="pb"><h2>Your bag</h2>` +
    (cart.length ? cart.map((l, i) => { const p = findP(l); return `<div class="line"><div><b>${esc(p.name)}</b><small>${esc(l.c)} \u00b7 ${esc(l.s)} \u00b7 Qty ${l.q}</small><a href="#" data-rm="${i}">Remove</a></div><b>${fmt(lineTotal(l))}</b></div>`; }).join("") +
      `<div class="tot"><span>Total</span><span>${fmt(bagTotal())}</span></div>
   <div class="f"><input id="nm" placeholder="Your name (optional)" value="${esc(keep.n)}"><input id="ct" placeholder="City / State (optional)" value="${esc(keep.c)}"></div>
   <a class="btn gold full" id="wb" target="_blank" rel="noopener" href="${wa(msgBag())}">Send order on WhatsApp</a>`
      : `<div class="empty">Your bag is empty.</div>`) + `</div>`;
  const wb = $("wb");
  if (wb) ["nm", "ct"].forEach(i => { $(i).oninput = () => { wb.href = wa(msgBag()); }; });
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
function applyIcon() {
  if (!themeToggle) return;
  const dark = root.getAttribute("data-theme") === "dark" || (!root.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme:dark)").matches);
  themeToggle.innerHTML = dark ? "&#9789;" : "&#9788;";
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
  try {
    const response = await withTimeout(fetch(ROOT + "api/store", { cache: "no-store" }), 5000);
    if (response.ok) {
      const result = await response.json();
      if (result.data && Array.isArray(result.data.products)) {
        DATA = Object.assign({}, JSON.parse(JSON.stringify(DEFAULTS)), result.data);
        window.STORE_DATA = DATA;
      }
    }
  } catch (e) { /* fall back to data.js */ }
  try {
    if (supabaseConfigured) {
      const remote = await fetchStoreFromSupabase();
      if (remote && Array.isArray(remote.products)) {
        DATA = Object.assign({}, JSON.parse(JSON.stringify(DEFAULTS)), remote);
        window.STORE_DATA = DATA;
      }
    }
  } catch (e) { /* fall back to data.js */ }
  loadCart();
  renderAll();
  if ($("storeSearchInput") && /[?&]search=1/.test(location.search)) $("storeSearchInput").focus();
}

window.Store = {
  ROOT, DEFAULTS, esc, fmt, toast, mediaURL, saveMedia, persist, resetToDefaults, renderAll, waNumber,
  get data() { return DATA; },
  set data(d) { DATA = d; window.STORE_DATA = d; },
};
window.Store.ready = init();
