// The cross-site check runs before the per-address limiter (middleware.ts). The limiter counts the visitor's address, and
// a page on another site posts from the visitor's browser, so if it were counted another site could use up the visitor's
// sign-in attempts and lock them out. A file of its own: the limiter reads its cap when the module loads.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

const HOST = "studio.example.org";

describe("the cross-site check and the sign-in limit", () => {
  let middleware: (req: any) => Response;
  let NextRequest: new (url: string, init?: any) => any;

  before(async () => {
    process.env.WEBX_AUTH_RATE_MAX = "3";
    process.env.WEBX_API_RATE_MAX = "100000";
    ({ NextRequest } = await import("next/server"));
    ({ middleware } = await import("../middleware"));
  });

  const login = (headers: Record<string, string>) =>
    middleware(new NextRequest(`https://${HOST}/api/auth/login`, { method: "POST", headers: { host: HOST, ...headers } }));

  it("refuses another site's attempts without counting them against the visitor", () => {
    for (let i = 0; i < 25; i++) {
      assert.equal(login({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }).status, 403);
    }
    // The visitor's own three attempts are all still there; the fourth meets the limit, so the limit itself is live.
    for (let i = 0; i < 3; i++) assert.equal(login({ "sec-fetch-site": "same-origin", origin: `https://${HOST}` }).status, 200, `attempt ${i + 1}`);
    assert.equal(login({ "sec-fetch-site": "same-origin", origin: `https://${HOST}` }).status, 429);
  });
});
