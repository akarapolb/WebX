// getTenant (lib/cms.ts) against a stub tenant route. Decision D9: a key no tenant has is a 404 NotFoundError,
// which renders the page under its own key; an outage still fails the build. Own file: lib/cms.ts reads its
// addresses when first imported, and each test file runs in its own process.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

test("getTenant: a registered key, an unknown one (D9), and the failures that still throw", async () => {
  const server = createServer((req, res) => {
    const key = new URL(req.url || "/", "http://x").searchParams.get("tenant");
    const json = (status: number, body: unknown) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); };
    if (key === "dga") return json(200, { data: { key: "dga", name: "DGA", brand: { primaryColor: "#123456" } } });
    if (key === "nobody") return json(404, { data: null, error: { status: 404, name: "NotFoundError", message: "Not Found", details: {} } });
    if (key === "proxy404") { res.statusCode = 404; res.setHeader("content-type", "text/html"); return res.end("<html>no such page</html>"); }
    return json(500, { data: null, error: { status: 500, name: "InternalServerError", message: "boom", details: {} } });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.STRAPI_URL = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  delete process.env.WEBX_CONTROL_URL;
  try {
    const { getTenant } = await import("@/lib/cms");
    assert.equal((await getTenant("dga")).brand?.primaryColor, "#123456");
    assert.deepEqual(await getTenant("nobody"), { key: "nobody", name: "nobody" }, "an unregistered key: its own bare record, never another tenant's");
    await assert.rejects(getTenant("proxy404"), /HTTP 404/, "a 404 that is not the CMS's NotFoundError is a failure");
    await assert.rejects(getTenant("down"), /HTTP 500/, "an outage fails the build");
  } finally {
    server.close();
  }
});
