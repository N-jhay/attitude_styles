import { error, json } from "../_shared/http.js";

export async function onRequestGet({ env }) {
  if (!env.DB) return error("Store database is not configured.", 503);
  try {
    const row = await env.DB.prepare("SELECT data_json FROM store_state WHERE id = 1").first();
    if (!row) return json({ data: null });
    return json({ data: JSON.parse(row.data_json) });
  } catch {
    return error("Could not load store data.", 500);
  }
}