import { requireAdmin } from "../../_shared/auth.js";
import { error, json, sameOrigin } from "../../_shared/http.js";

function validStore(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (!Array.isArray(data.products) || data.products.length > 300) return false;
  if (typeof data.whatsapp !== "string" || !/^\d{8,15}$/.test(data.whatsapp)) return false;
  if (typeof data.tagline !== "string" || data.tagline.length > 300) return false;
  if (typeof (data.announcement || "") !== "string" || (data.announcement || "").length > 300) return false;
  if (typeof (data.logo || "") !== "string" || (data.logo || "").length > 2048) return false;
  if (typeof (data.reel || "") !== "string" || (data.reel || "").length > 2048) return false;

  return data.products.every(product => {
    if (!product || typeof product !== "object" || Array.isArray(product)) return false;
    if (!(typeof product.id === "string" || Number.isSafeInteger(product.id))) return false;
    if (typeof product.name !== "string" || product.name.length > 160) return false;
    if (typeof product.cat !== "string" || product.cat.length > 100) return false;
    if (!Number.isFinite(product.price) || product.price < 0 || product.price > 1_000_000_000) return false;
    if (!Number.isSafeInteger(product.stock) || product.stock < 0 || product.stock > 1_000_000_000) return false;
    if (typeof (product.img || "") !== "string" || (product.img || "").length > 2048) return false;
    if (product.videoUrl != null && (typeof product.videoUrl !== "string" || product.videoUrl.length > 2048)) return false;
    if (!Array.isArray(product.sizes) || product.sizes.length > 30 || product.sizes.some(size => typeof size !== "string" || size.length > 40)) return false;
    if (!Array.isArray(product.colors) || product.colors.length > 30 || product.colors.some(color => !Array.isArray(color) || color.length !== 2 || color.some(value => typeof value !== "string" || value.length > 80))) return false;
    return true;
  });
}

export async function onRequestPut({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (!sameOrigin(request)) return error("Invalid request origin.", 403);
  if (!env.DB) return error("Store database is not configured.", 503);

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > 300_000) return error("Store data is too large.", 413);
  let data;
  try {
    const body = await request.text();
    if (body.length > 300_000) return error("Store data is too large.", 413);
    data = JSON.parse(body);
  } catch {
    return error("Invalid JSON body.");
  }
  if (!validStore(data)) return error("Store data failed validation.");

  try {
    await env.DB.prepare("INSERT INTO store_state (id, data_json, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = CURRENT_TIMESTAMP")
      .bind(JSON.stringify(data)).run();
    return json({ saved: true });
  } catch {
    return error("Could not save store data.", 500);
  }
}