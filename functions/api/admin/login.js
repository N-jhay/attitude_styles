import { createSession, sessionCookie } from "../../_shared/auth.js";
import { error, json, sameOrigin } from "../../_shared/http.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return error("Invalid request origin.", 403);
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || !env.DB) {
    return error("Admin authentication is not configured.", 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return error("Invalid request body.");
  }
  if (typeof body.password !== "string" || body.password.length > 256) {
    return error("Incorrect password.", 401);
  }

  const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientIp));
  const rateKey = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  let attempts;
  try {
    const row = await env.DB.prepare("INSERT INTO admin_login_attempts (ip_hash, window_started, attempts) VALUES (?, unixepoch(), 1) ON CONFLICT(ip_hash) DO UPDATE SET attempts = CASE WHEN window_started <= unixepoch() - 900 THEN 1 ELSE attempts + 1 END, window_started = CASE WHEN window_started <= unixepoch() - 900 THEN unixepoch() ELSE window_started END RETURNING attempts")
      .bind(rateKey).first();
    attempts = row?.attempts;
  } catch {
    return error("Could not verify login.", 503);
  }
  if (attempts > 5) return error("Too many login attempts. Try again in 15 minutes.", 429);
  if (body.password !== env.ADMIN_PASSWORD) return error("Incorrect password.", 401);

  await env.DB.prepare("DELETE FROM admin_login_attempts WHERE ip_hash = ?").bind(rateKey).run();
  const session = await createSession(env.SESSION_SECRET);
  return json({ authenticated: true }, 200, { "set-cookie": sessionCookie(session) });
}