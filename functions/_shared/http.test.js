import test from "node:test";
import assert from "node:assert/strict";

import { sameOrigin } from "./http.js";

function requestFor(url, headers = {}) {
  return new Request(url, { headers });
}

test("accepts same-origin requests when the browser omits Origin but reports same-origin fetch site", () => {
  const request = requestFor("https://shop.example.test/api/admin/login", {
    "Sec-Fetch-Site": "same-origin",
  });

  assert.equal(sameOrigin(request), true);
});

test("accepts same-origin requests when the browser sends a matching Referer header", () => {
  const request = requestFor("https://shop.example.test/api/admin/store", {
    Referer: "https://shop.example.test/admin",
  });

  assert.equal(sameOrigin(request), true);
});

test("rejects cross-site requests", () => {
  const request = requestFor("https://shop.example.test/api/admin/store", {
    Origin: "https://evil.example.test",
  });

  assert.equal(sameOrigin(request), false);
});
