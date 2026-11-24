// WEBX_ENGINE_URLS: per-tenant engine URLs and media-URL rewriting (lib/engineUrls.ts),
// (the end-to-end case against lib/cms.ts is engineUrls.cms.test.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEngineUrls, engineBaseFor, absolutizeMedia } from "@/lib/engineUrls";

const urls = parseEngineUrls('{"alpha":"http://a.test:1338/","beta":"http://b.test"}');

test("parse drops trailing slashes; empty/unset gives no entries", () => {
  assert.deepEqual(urls, { alpha: "http://a.test:1338", beta: "http://b.test" });
  assert.deepEqual(parseEngineUrls(undefined), {});
  assert.deepEqual(parseEngineUrls(""), {});
});

test("each tenant resolves its own engine, others the default", () => {
  assert.equal(engineBaseFor(urls, "alpha", "http://d"), "http://a.test:1338");
  assert.equal(engineBaseFor(urls, "beta", "http://d"), "http://b.test");
  assert.equal(engineBaseFor(urls, "other", "http://d"), "http://d");
});

test("relative media URLs get the tenant's engine; links and absolute URLs stay", () => {
  const data = [{
    title: "x",
    coverImage: { url: "/uploads/a.png", mime: "image/png", thumbnailUrl: "/uploads/t.png" },
    gallery: [{ url: "/uploads/b.png", mime: "image/png" }, { url: "https://cdn.test/c.png", mime: "image/png" }],
    link: { url: "/about" },
  }];
  const out = absolutizeMedia(data, "http://a.test:1338");
  assert.equal(out[0].coverImage.url, "http://a.test:1338/uploads/a.png");
  assert.equal(out[0].coverImage.thumbnailUrl, "http://a.test:1338/uploads/t.png");
  assert.equal(out[0].gallery[0].url, "http://a.test:1338/uploads/b.png");
  assert.equal(out[0].gallery[1].url, "https://cdn.test/c.png");
  assert.equal(out[0].link.url, "/about");
  assert.equal(data[0].coverImage.url, "/uploads/a.png", "input is not mutated");
});
