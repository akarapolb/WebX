// CSRF (lib/csrf.ts, middleware.ts): a page on another site must not be able to make the browser change anything through
// Studio's API with the visitor's cookie. The second half walks every route file under app/api and posts to it from
// "another site", so a route added later is covered, or fails here, without anyone remembering to list it.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { crossSiteRefusal, csrfExempt, parseTrustedOrigins } from "../lib/csrf";

const HOST = "studio.example.org";
const CHANGING = ["POST", "PUT", "PATCH", "DELETE"];

describe("crossSiteRefusal", () => {
  it("lets requests that change nothing through, whoever sent them", () => {
    for (const method of ["GET", "HEAD", "OPTIONS", "get"]) {
      assert.equal(crossSiteRefusal({ method, secFetchSite: "cross-site", origin: "https://evil.example", host: HOST }), null, method);
    }
  });

  it("trusts a browser that says the request is from this origin or from the user typing the address", () => {
    for (const method of CHANGING) {
      assert.equal(crossSiteRefusal({ method, secFetchSite: "same-origin", origin: `https://${HOST}`, host: HOST }), null, method);
      assert.equal(crossSiteRefusal({ method, secFetchSite: "none", host: HOST }), null, method);
    }
  });

  it("refuses another site, and a sibling subdomain of the same site, which the Lax cookie would still follow", () => {
    for (const method of CHANGING) {
      assert.match(crossSiteRefusal({ method, secFetchSite: "cross-site", origin: "https://evil.example", host: HOST }) ?? "", /cross-site/, method);
      assert.match(crossSiteRefusal({ method, secFetchSite: "same-site", origin: "https://blog.example.org", host: HOST }) ?? "", /same-site/, method);
    }
    assert.ok(crossSiteRefusal({ method: "POST", secFetchSite: "cross-site", host: HOST }), "no Origin does not rescue a cross-site request");
    assert.ok(crossSiteRefusal({ method: "POST", secFetchSite: "something-new", host: HOST }), "a value we do not know is not same-origin");
    assert.ok(crossSiteRefusal({ method: "POST", secFetchSite: "cross-site", origin: `https://${HOST}`, host: HOST }), "Sec-Fetch-Site wins over a matching Origin");
  });

  it("lets an origin the operator named post even from another site", () => {
    const trusted = parseTrustedOrigins("https://admin.example.org, http://localhost:4000");
    assert.equal(crossSiteRefusal({ method: "POST", secFetchSite: "same-site", origin: "https://admin.example.org", host: HOST }, trusted), null);
    assert.equal(crossSiteRefusal({ method: "POST", secFetchSite: "cross-site", origin: "http://localhost:4000", host: HOST }, trusted), null);
    assert.equal(crossSiteRefusal({ method: "POST", origin: "https://admin.example.org", host: HOST }, trusted), null, "also without Sec-Fetch-Site");
    assert.ok(crossSiteRefusal({ method: "POST", secFetchSite: "cross-site", origin: "https://evil.example", host: HOST }, trusted));
    assert.ok(crossSiteRefusal({ method: "POST", secFetchSite: "same-site", origin: "https://admin.example.org:8443", host: HOST }, trusted), "another port is another origin");
    assert.ok(crossSiteRefusal({ method: "POST", secFetchSite: "cross-site", host: HOST }, trusted), "a trusted list does not trust a request with no Origin");
  });

  it("falls back to the Origin when the browser sends no Sec-Fetch-Site", () => {
    assert.equal(crossSiteRefusal({ method: "POST", origin: `https://${HOST}`, host: HOST }), null);
    assert.equal(crossSiteRefusal({ method: "POST", origin: `https://${HOST.toUpperCase()}`, host: HOST }), null, "host names compare without case");
    assert.equal(crossSiteRefusal({ method: "POST", origin: "http://localhost:3000", host: "localhost:3000" }), null, "a port is part of the host");
    assert.ok(crossSiteRefusal({ method: "POST", origin: "http://localhost:3001", host: "localhost:3000" }));
    assert.ok(crossSiteRefusal({ method: "POST", origin: "https://evil.example", host: HOST }));
    assert.ok(crossSiteRefusal({ method: "POST", origin: `https://${HOST}.evil.example`, host: HOST }), "a host that merely starts with ours is another host");
    assert.ok(crossSiteRefusal({ method: "POST", origin: "null", host: HOST }), "a sandboxed frame sends Origin: null");
    assert.ok(crossSiteRefusal({ method: "POST", origin: "not a url", host: HOST }));
    assert.ok(crossSiteRefusal({ method: "POST", origin: "file:///etc/passwd", host: HOST }));
    assert.ok(crossSiteRefusal({ method: "POST", origin: `https://${HOST}` }), "no host to compare with: refused, not assumed ours");
  });

  it("reads the host a proxy forwarded when it rewrites Host", () => {
    const behind = { method: "POST", origin: `https://${HOST}`, host: "webx:3000" };
    assert.ok(crossSiteRefusal(behind), "the internal name is not what the browser called");
    assert.equal(crossSiteRefusal({ ...behind, forwardedHost: HOST }), null);
    assert.equal(crossSiteRefusal({ ...behind, forwardedHost: `${HOST}, other.example` }), null);
    assert.ok(crossSiteRefusal({ ...behind, origin: "https://evil.example", forwardedHost: HOST }));
  });

  it("lets a request that no browser page sent through: curl, a server, a test run", () => {
    for (const method of CHANGING) assert.equal(crossSiteRefusal({ method, host: HOST }), null, method);
    assert.equal(crossSiteRefusal({ method: "POST", origin: "", host: HOST }), null);
  });
});

describe("parseTrustedOrigins", () => {
  it("keeps http(s) origins, lower-cased and without a path, and drops the rest", () => {
    assert.deepEqual(parseTrustedOrigins(undefined), []);
    assert.deepEqual(parseTrustedOrigins(""), []);
    assert.deepEqual(parseTrustedOrigins("https://A.example.org/some/path, ftp://x.example, nonsense, ,http://b.example:8080"),
      ["https://a.example.org", "http://b.example:8080"]);
  });
});

describe("csrfExempt", () => {
  it("is for the server-to-server routes only", () => {
    assert.equal(csrfExempt("/api/internal/releases/process-due"), true);
    assert.equal(csrfExempt("/api/webhooks/stripe"), true);
    assert.equal(csrfExempt("/api/auth/login"), false);
    assert.equal(csrfExempt("/api/cms/mfa/start"), false);
    assert.equal(csrfExempt("/api/internalx/anything"), false, "a prefix of the name is not the folder");
    assert.equal(csrfExempt("/api/webhooks"), false);
    assert.equal(csrfExempt("/api/ai/audit"), false);
  });
});

// ---- the route table -------------------------------------------------------------------------------------------------

const API_DIR = path.join(__dirname, "..", "app", "api");

/** app/api/cms/[uid]/[id]/route.ts -> /api/cms/x/x */
function routePaths(dir: string, urlPrefix: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const segment = entry.name.replace(/^\[\[\.\.\.[^\]]+\]\]$/, "x/y").replace(/^\[\.\.\.[^\]]+\]$/, "x/y").replace(/^\[[^\]]+\]$/, "x");
      out.push(...routePaths(path.join(dir, entry.name), `${urlPrefix}/${segment}`));
    } else if (/^route\.(ts|tsx|js)$/.test(entry.name)) {
      out.push(urlPrefix);
    }
  }
  return out;
}

describe("every route under app/api", () => {
  let middleware: (req: any) => Response;
  let NextRequest: new (url: string, init?: any) => any;
  const routes = routePaths(API_DIR, "/api");

  before(async () => {
    // The limiter reads its caps when the module loads; this table posts a few hundred requests from one address.
    process.env.WEBX_AUTH_RATE_MAX = "100000";
    process.env.WEBX_API_RATE_MAX = "100000";
    delete process.env.WEBX_TRUSTED_ORIGINS;
    ({ NextRequest } = await import("next/server"));
    ({ middleware } = await import("../middleware"));
  });

  const request = (route: string, method: string, headers: Record<string, string>) =>
    new NextRequest(`https://${HOST}${route}`, { method, headers: { host: HOST, cookie: "webx_session=a-real-looking-session", ...headers } });

  it("was found (this test is not vacuous)", () => {
    assert.ok(routes.length > 20, `only ${routes.length} routes found under ${API_DIR}`);
    assert.ok(routes.includes("/api/auth/login") && routes.includes("/api/cms/mfa/start"));
  });

  it("refuses a state-changing request that comes from another site, with the visitor's cookie", () => {
    const failures: string[] = [];
    let checked = 0;
    const fromElsewhere: Record<string, string>[] = [
      { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
      { "sec-fetch-site": "same-site", origin: "https://blog.example.org" },
      { origin: "https://evil.example" }, // an older browser: no Sec-Fetch-Site
    ];
    for (const route of routes.filter((r) => !csrfExempt(r + "/"))) {
      for (const method of CHANGING) {
        checked++;
        for (const headers of fromElsewhere) {
          const res = middleware(request(route, method, headers));
          if (res.status !== 403) failures.push(`${method} ${route} ${JSON.stringify(headers)} -> ${res.status}`);
        }
      }
    }
    assert.ok(checked > 80, `only ${checked} route/method pairs checked`);
    assert.deepEqual(failures, [], "these routes let another site through");
  });

  it("still serves Studio's own pages, and a caller that is not a browser page", () => {
    const failures: string[] = [];
    const ours: Record<string, string>[] = [
      { "sec-fetch-site": "same-origin", origin: `https://${HOST}` },
      { origin: `https://${HOST}` },
      {},
    ];
    for (const route of routes.filter((r) => !csrfExempt(r + "/"))) {
      for (const headers of ours) {
        const res = middleware(request(route, "POST", headers));
        if (res.status === 403 || res.status === 429) failures.push(`POST ${route} ${JSON.stringify(headers)} -> ${res.status}`);
      }
    }
    assert.deepEqual(failures, []);
  });

  it("leaves the secret-protected and signed server routes reachable from anywhere", () => {
    const exempt = routes.filter((r) => csrfExempt(r + "/"));
    assert.ok(exempt.length >= 5, "the scheduler routes and Stripe's webhook");
    for (const route of exempt) {
      const res = middleware(request(route, "POST", { "sec-fetch-site": "cross-site", origin: "https://evil.example" }));
      assert.notEqual(res.status, 403, route);
    }
  });
});
