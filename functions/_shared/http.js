export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  const requestUrl = new URL(request.url);

  if (origin) return origin === requestUrl.origin;

  const site = request.headers.get("Sec-Fetch-Site");
  if (site === "same-origin" || site === "same-site") return true;

  const referer = request.headers.get("Referer");
  if (referer) {
    try {
      return new URL(referer).origin === requestUrl.origin;
    } catch {
      // Ignore malformed referers and fall through to the safe default.
    }
  }

  return false;
}

export function error(message, status = 400) {
  return json({ error: message }, status);
}