import { error } from "./http.js";

const COOKIE = "__Host-store_admin";
const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function signingKey(secret) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSession(secret) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(18)));
  const payload = `${expires}.${nonce}`;
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function isAdmin(request, secret) {
  if (!secret) return false;
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token) return false;

  const [expiresText, nonce, signatureText, extra] = token.split(".");
  const expires = Number(expiresText);
  if (!nonce || !signatureText || extra || !Number.isSafeInteger(expires) || expires <= Date.now() / 1000) return false;
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await signingKey(secret),
      fromBase64Url(signatureText),
      encoder.encode(`${expiresText}.${nonce}`),
    );
  } catch {
    return false;
  }
}

export async function requireAdmin(request, env) {
  if (!(await isAdmin(request, env.SESSION_SECRET))) return error("Authentication required.", 401);
  return null;
}

export function sessionCookie(value, maxAge = SESSION_SECONDS) {
  return `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}