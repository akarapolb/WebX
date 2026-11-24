// lib/cms.ts against two stub engines. Own file: lib/cms.ts reads WEBX_ENGINE_URLS
// when first imported, and each test file runs in its own process.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

test("two tenants on two engines: pages and media use their own engine", async () => {
  const seen: string[] = [];
  const mk = (name: string) => createServer((req, res) => {
    seen.push(name + " " + req.url);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ data: [{ slug: name, cover: { url: "/uploads/" + name + ".png", mime: "image/png" } }] }));
  });
  const a = mk("alpha"), b = mk("beta");
  await Promise.all([a, b].map((s) => new Promise<void>((r) => s.listen(0, "127.0.0.1", r))));
  const ua = "http://127.0.0.1:" + (a.address() as AddressInfo).port;
  const ub = "http://127.0.0.1:" + (b.address() as AddressInfo).port;
  process.env.WEBX_ENGINE_URLS = JSON.stringify({ alpha: ua + "/", beta: ub });
  process.env.STRAPI_URL = "http://127.0.0.1:1";
  try {
    const cms = await import("@/lib/cms");
    const [pa, pb] = await Promise.all([cms.getPage("alpha", "alpha"), cms.getPage("beta", "beta")]);
    assert.equal(pa.cover.url, ua + "/uploads/alpha.png");
    assert.equal(pb.cover.url, ub + "/uploads/beta.png");
    assert.equal(cms.mediaUrl(pa.cover), ua + "/uploads/alpha.png");
    assert.equal(cms.mediaUrl(pb.cover), ub + "/uploads/beta.png");
    assert.ok(seen.some((s) => s.startsWith("alpha ") && s.includes("tenant=alpha")));
    assert.ok(seen.some((s) => s.startsWith("beta ") && s.includes("tenant=beta")));
    assert.ok(!seen.some((s) => s.startsWith("alpha ") && s.includes("tenant=beta")), "no cross-engine reads");
  } finally {
    a.close(); b.close();
  }
});
