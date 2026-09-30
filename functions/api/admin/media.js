import { requireAdmin } from "../../_shared/auth.js";
import { error, json, sameOrigin } from "../../_shared/http.js";

const MEDIA_TYPES = new Map([
  ["image/jpeg", { ext: "jpg", limit: 8 * 1024 * 1024 }],
  ["image/png", { ext: "png", limit: 8 * 1024 * 1024 }],
  ["image/webp", { ext: "webp", limit: 8 * 1024 * 1024 }],
  ["video/mp4", { ext: "mp4", limit: 50 * 1024 * 1024 }],
  ["video/webm", { ext: "webm", limit: 50 * 1024 * 1024 }],
]);

export async function onRequestPost({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (!sameOrigin(request)) return error("Invalid request origin.", 403);
  if (!env.MEDIA_BUCKET) return error("Media storage is not configured.", 503);

  let form;
  try {
    form = await request.formData();
  } catch {
    return error("Expected a multipart upload.");
  }
  const file = form.get("file");
  const type = file && MEDIA_TYPES.get(file.type);
  if (!file || typeof file.stream !== "function" || !type) return error("Choose a JPEG, PNG, WebP, MP4, or WebM file.");
  if (file.size < 1 || file.size > type.limit) return error("This file exceeds the upload size limit.", 413);

  const key = `${crypto.randomUUID()}.${type.ext}`;
  try {
    await env.MEDIA_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
    });
    return json({ url: `/api/media/${key}` }, 201);
  } catch {
    return error("Media upload failed.", 500);
  }
}