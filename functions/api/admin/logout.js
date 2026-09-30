import { sessionCookie } from "../../_shared/auth.js";
import { error, json, sameOrigin } from "../../_shared/http.js";

export async function onRequestPost({ request }) {
  if (!sameOrigin(request)) return error("Invalid request origin.", 403);
  return json({ authenticated: false }, 200, { "set-cookie": sessionCookie("", 0) });
}