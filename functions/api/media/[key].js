import { error } from "../../_shared/http.js";

const KEY_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$/;

export async function onRequestGet({ params, env }) {
  if (!KEY_PATTERN.test(params.key) || !env.MEDIA_BUCKET) return error("Media not found.", 404);
  const object = await env.MEDIA_BUCKET.get(params.key);
  if (!object) return error("Media not found.", 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-security-policy", "default-src 'none'; sandbox");
  headers.set("cross-origin-resource-policy", "same-origin");
  return new Response(object.body, { headers });
}