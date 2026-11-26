// Engine credentials come from one place, lib/engineAuth.ts (docs/c4-identity-plan.md, step 5). Checked here: nothing
// else reads the session token; the legacy implementation hands on what engine calls used before (the session cookie's
// token or a withServiceToken credential, a background job's owner, nothing without a credential) and the adapters send
// the same headers as before; and ai/audit works on the caller's own workspace, whatever the request body names.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";

// next/headers' cookies() needs a request scope. Next's request stores are real AsyncLocalStorage instances only when
// globalThis.AsyncLocalStorage exists as they load (Next's server sets it at start, see
// next/dist/server/node-environment-baseline.js), so it is set here, and Next and this project's modules are imported in
// before(), after the environment they read when they load.
if (typeof (globalThis as any).AsyncLocalStorage !== "function") (globalThis as any).AsyncLocalStorage = AsyncLocalStorage;

const STRAPI = "http://strapi.test";
const WORDPRESS = "http://wordpress.test/wp-json";
const INTERNAL_SECRET = "internal-secret-for-tests";

type Lib = {
  strapi: typeof import("../lib/strapi");
  auth: typeof import("../lib/engineAuth");
  cms: typeof import("../lib/cms/strapi");
  wp: typeof import("../lib/cms/wordpress");
  gov: typeof import("../lib/cms/governance");
  types: typeof import("../lib/cms/types");
  audit: typeof import("../app/api/ai/audit/route");
  NextRequest: typeof import("next/server").NextRequest;
  workAsyncStorage: { run<T>(store: unknown, fn: () => T): T };
  workUnitAsyncStorage: { run<T>(store: unknown, fn: () => T): T };
};
let lib: Lib;

/** Runs `fn` inside a request whose Cookie header is `cookie`, as far as next/headers' cookies() is concerned (it reads
 * Next's internal request store; outside one it throws "called outside a request scope"). Test-only. */
function inRequest<T>(cookie: string, fn: () => Promise<T>): Promise<T> {
  const cookies = new lib.NextRequest("http://studio.test/", { headers: cookie ? { cookie } : {} }).cookies;
  return lib.workAsyncStorage.run({ route: "/test", page: "/test" }, () =>
    lib.workUnitAsyncStorage.run({ type: "request", phase: "render", cookies }, fn));
}

// Every call the code under test makes goes to this fetch.
type Call = { url: string; method: string; headers: Record<string, string> };
let calls: Call[] = [];
let respond: (call: Call) => unknown = () => ({});
const realFetch = globalThis.fetch;
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const raw = init?.headers;
  const headers: Record<string, string> = raw instanceof Headers ? Object.fromEntries(raw.entries()) : { ...(raw as Record<string, string> | undefined) };
  const call = { url: String(input instanceof Request ? input.url : input), method: init?.method ?? "GET", headers };
  calls.push(call);
  const out = respond(call);
  return out instanceof Response ? out : new Response(JSON.stringify(out ?? {}), { status: 200, headers: { "content-type": "application/json" } });
}

const JOB = {
  engine: "strapi" as const, tenantKey: "dga", email: "editor@dga.local", jobId: "job-1",
  user: { id: 7, email: "editor@dga.local", roles: ["Editor"], isSuperAdmin: false },
};

before(async () => {
  process.env.STRAPI_URL = STRAPI;
  process.env.WORDPRESS_URL = WORDPRESS;
  process.env.STRAPI_INTERNAL_SECRET = INTERNAL_SECRET;
  // No scheduler account: governance's bookkeeping reads (the workspace registry) then use the caller's own session.
  for (const name of ["STRAPI_SCHEDULER_EMAIL", "STRAPI_SCHEDULER_PASSWORD", "LITELLM_URL", "WEBX_SESSION_COOKIE", "WEBX_ENGINE_COOKIE"]) delete process.env[name];
  const work = await import("next/dist/server/app-render/work-async-storage.external");
  const workUnit = await import("next/dist/server/app-render/work-unit-async-storage.external");
  lib = {
    strapi: await import("../lib/strapi"),
    auth: await import("../lib/engineAuth"),
    cms: await import("../lib/cms/strapi"),
    wp: await import("../lib/cms/wordpress"),
    gov: await import("../lib/cms/governance"),
    types: await import("../lib/cms/types"),
    audit: await import("../app/api/ai/audit/route"),
    NextRequest: (await import("next/server")).NextRequest,
    workAsyncStorage: work.workAsyncStorage as unknown as Lib["workAsyncStorage"],
    workUnitAsyncStorage: workUnit.workUnitAsyncStorage as unknown as Lib["workUnitAsyncStorage"],
  };
  globalThis.fetch = fakeFetch as typeof fetch;
});
after(() => { globalThis.fetch = realFetch; });
beforeEach(() => { calls = []; respond = () => ({}); });

// ---- (a) nothing but engineAuth reads the session token ------------------------------------------------------------

describe("the session token reader", () => {
  const root = path.join(__dirname, "..");
  const allowed = new Set(["lib/strapi.ts", "lib/engineAuth.ts"]);
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        // dependencies, and build output and other tool folders (.next, .next-prod, ...)
        if (entry.name !== "node_modules" && !entry.name.startsWith(".")) sourceFiles(path.join(dir, entry.name), out);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join("/"));
      }
    }
    return out;
  }
  const files = sourceFiles(root);

  it("was given the whole app to read (this test is not vacuous)", () => {
    assert.ok(files.length > 200, `only ${files.length} files found`);
    for (const f of ["lib/strapi.ts", "lib/cms/strapi.ts", "app/(app)/layout.tsx", "app/api/strapi/[...path]/route.ts", "tests/engine-auth.test.ts"]) {
      assert.ok(files.includes(f), `${f} not found`);
    }
  });

  it("is called only in lib/strapi.ts and lib/engineAuth.ts, and imported only by lib/engineAuth.ts", () => {
    const call = /\bsessionToken\s*\(/;
    const named = /import\s+(?:type\s+)?\{[^}]*\bsessionToken\b[^}]*\}\s*from/;
    const problems: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, f), "utf8");
      if (!allowed.has(f) && call.test(src)) problems.push(`${f}: calls it`);
      if (f !== "lib/engineAuth.ts" && named.test(src)) problems.push(`${f}: imports it`);
    }
    assert.deepEqual(problems, [], "engine calls must get their credential from lib/engineAuth.ts");
  });
});

// ---- (b) the legacy implementation ---------------------------------------------------------------------------------

describe("engineAuth, legacy implementation", () => {
  it("hands on the credential withServiceToken put in place, with nobody to act for", async () => {
    assert.deepEqual(await lib.strapi.withServiceToken("service-token", () => lib.auth.engineAuth()), { credential: "service-token" });
  });

  it("hands on the session cookie's token, and does not make a person's call a background job", async () => {
    await inRequest("webx_session=person-token", async () => {
      assert.deepEqual(await lib.auth.engineAuth(), { credential: "person-token" });
      assert.equal(lib.strapi.actingSession(), undefined);
    });
  });

  it("prefers a withServiceToken credential to the session cookie", async () => {
    const got = await inRequest("webx_session=person-token", () => lib.strapi.withServiceToken("service-token", () => lib.auth.engineAuth()));
    assert.deepEqual(got, { credential: "service-token" });
  });

  it("names a background job's owner and the job", async () => {
    const got = await lib.strapi.withServiceToken("scheduler-token", () => lib.strapi.withActingSession(JOB, () => lib.auth.engineAuth()));
    assert.deepEqual(got, { credential: "scheduler-token", acting: { email: "editor@dga.local", tenantKey: "dga", jobId: "job-1" } });
  });

  it("gives no credential when there is none, in a job too", async () => {
    assert.equal(await inRequest("", () => lib.auth.engineAuth()), null);
    assert.equal(await inRequest("webx_session=; webx_session_engine=wordpress", () => lib.auth.engineAuth()), null);
    assert.equal(await inRequest("", () => lib.strapi.withActingSession(JOB, () => lib.auth.engineAuth())), null);
  });
});

describe("engineAuthHeaders", () => {
  const acting = { email: "editor@dga.local", tenantKey: "dga", jobId: "job-1" };

  it("Strapi: the bearer credential, and the owner when the call acts for one", () => {
    assert.deepEqual(lib.auth.engineAuthHeaders("strapi", { credential: "t" }), { Authorization: "Bearer t" });
    assert.deepEqual(lib.auth.engineAuthHeaders("strapi", { credential: "t", acting }), {
      Authorization: "Bearer t", "X-WebX-Acting-Email": "editor@dga.local", "X-WebX-Acting-Tenant": "dga",
    });
  });

  it("WordPress: the Basic credential and nothing else", () => {
    assert.deepEqual(lib.auth.engineAuthHeaders("wordpress", { credential: "dXNlcjphcHA=" }), { Authorization: "Basic dXNlcjphcHA=" });
    assert.deepEqual(lib.auth.engineAuthHeaders("wordpress", { credential: "dXNlcjphcHA=", acting }), { Authorization: "Basic dXNlcjphcHA=" });
  });
});

describe("the adapters send the headers they sent before", () => {
  it("Strapi, a person's call: their bearer token, governed, the internal secret", async () => {
    respond = () => ({ results: [] });
    await inRequest("webx_session=person-token", () => lib.cms.strapiAdapter.entries.list("api::article.article"));
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].headers, { Authorization: "Bearer person-token", "X-WebX-Governed": "1", "X-Internal-Secret": INTERNAL_SECRET });
  });

  it("Strapi, a background job: the scheduler's token and the job's owner, plus what the call adds", async () => {
    respond = () => ({ data: { documentId: "d1" } });
    await lib.strapi.withServiceToken("scheduler-token", () =>
      lib.strapi.withActingSession(JOB, () => lib.cms.strapiAdapter.entries.create("api::article.article", { title: "x" })));
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].headers, {
      Authorization: "Bearer scheduler-token", "X-WebX-Governed": "1",
      "X-WebX-Acting-Email": "editor@dga.local", "X-WebX-Acting-Tenant": "dga",
      "X-Internal-Secret": INTERNAL_SECRET, "Content-Type": "application/json",
    });
  });

  it("WordPress: the Basic string only, in a background job too", async () => {
    respond = () => ({ id: 3, email: "editor@wp.test", roles: ["editor"] });
    await inRequest("webx_session=dXNlcjphcHA=; webx_session_engine=wordpress", () => lib.wp.wordpressAdapter.auth.me());
    await lib.strapi.withServiceToken("c2NoZWQ6YXBw", () =>
      lib.strapi.withActingSession({ ...JOB, engine: "wordpress" }, () => lib.wp.wordpressAdapter.media.update("1", { caption: "x" })));
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].headers, { Authorization: "Basic dXNlcjphcHA=" });
    assert.deepEqual(calls[1].headers, { Authorization: "Basic c2NoZWQ6YXBw", "Content-Type": "application/json" });
  });

  it("both refuse with 401 Unauthenticated, before calling the engine, without a credential", async () => {
    const unauthenticated = (e: any) => e instanceof lib.types.CmsError && e.status === 401 && e.message === "Unauthenticated";
    await assert.rejects(inRequest("", () => lib.cms.strapiAdapter.entries.list("api::article.article")), unauthenticated);
    await assert.rejects(inRequest("webx_session_engine=wordpress", () => lib.wp.wordpressAdapter.auth.me()), unauthenticated);
    assert.equal(calls.length, 0);
  });
});

// ---- (c) ai/audit takes the workspace from the session -------------------------------------------------------------

describe("ai/audit works on the caller's own workspace", () => {
  const people: Record<string, { id: number; email: string; roles: { name: string; code: string }[] }> = {
    "alpha-token": { id: 1, email: "editor@alpha.test", roles: [{ name: "Editor", code: "strapi-editor" }] },
    "root-token": { id: 2, email: "root@platform.test", roles: [{ name: "Super Admin", code: "strapi-super-admin" }] },
  };
  // editor@alpha.test is on alpha's roster; root@platform.test is on none (an unscoped super admin).
  const registry = { results: [
    { key: "alpha", adminEmails: ["editor@alpha.test"] },
    { key: "beta", adminEmails: ["editor@beta.test"] },
  ] };
  const BRAND = STRAPI + "/content-manager/collection-types/api::tenant.tenant?filters[key][$eq]=";

  function strapiFake(call: Call): unknown {
    if (call.url === STRAPI + "/admin/users/me") {
      const me = people[(call.headers.Authorization || "").replace(/^Bearer /, "")];
      return me ? { data: me } : new Response("{}", { status: 401 });
    }
    if (call.url.startsWith(BRAND)) return { results: [{ brand: { primaryColor: "#0a5cad" } }] };
    if (call.url.startsWith(STRAPI + "/content-manager/collection-types/api::tenant.tenant?")) return registry;
    if (call.url.startsWith(STRAPI + "/content-manager/collection-types/")) return { results: [] };
    return new Response("{}", { status: 404 });
  }

  async function audit(cookie: string, body: unknown): Promise<{ status: number; json: any }> {
    const req = new lib.NextRequest("http://studio.test/api/ai/audit", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
    const res = await inRequest(cookie, () => lib.audit.POST(req));
    return { status: res.status, json: await res.json() };
  }
  /** The audit's own reads, one per content type; the rest are the session and registry lookups. */
  const contentReads = () => calls.filter((c) => c.url.includes("&status=published"));
  const brandReads = () => calls.filter((c) => c.url.startsWith(BRAND)).map((c) => c.url.slice(BRAND.length));

  beforeEach(() => { lib.gov.invalidateTenantCache(); respond = strapiFake; });

  it("without a session: 401, and nothing is read", async () => {
    const res = await audit("", { tenant: "alpha" });
    assert.equal(res.status, 401);
    assert.deepEqual(res.json, { error: "Unauthenticated" });
    assert.equal(calls.length, 0);
  });

  it("with a session the engine no longer accepts: 401, and no content is read", async () => {
    const res = await audit("webx_session=expired-token", { tenant: "alpha" });
    assert.equal(res.status, 401);
    assert.deepEqual(res.json, { error: "Unauthenticated" });
    assert.deepEqual([contentReads().length, brandReads().length], [0, 0]);
  });

  it("a caller with a workspace who names another one: 403, and nothing of either workspace is read", async () => {
    const res = await audit("webx_session=alpha-token", { tenant: "beta" });
    assert.equal(res.status, 403);
    assert.deepEqual(res.json, { error: "Cross-tenant operation not permitted" });
    assert.deepEqual([contentReads().length, brandReads().length], [0, 0]);
  });

  it("a caller with a workspace who names it, or none: their workspace, read with their own credential", async () => {
    for (const body of [{ tenant: "alpha" }, { tenant: "" }, {}, { tenant: 7 }]) {
      calls = [];
      const res = await audit("webx_session=alpha-token", body);
      assert.equal(res.status, 200, JSON.stringify(body));
      assert.equal(res.json.ok, true);
      assert.equal(contentReads().length, 5, JSON.stringify(body));
      for (const c of contentReads()) {
        assert.ok(c.url.endsWith("&status=published&filters[tenant][key][$eq]=alpha"), c.url);
        assert.deepEqual(c.headers, { Authorization: "Bearer alpha-token" });
      }
      assert.deepEqual(brandReads(), ["alpha&pageSize=1"], JSON.stringify(body));
      assert.ok(res.json.brandContrast, "the workspace's brand colour is checked");
    }
  });

  it("an unscoped super admin may still name any workspace, or none", async () => {
    let res = await audit("webx_session=root-token", { tenant: "beta" });
    assert.equal(res.status, 200);
    assert.equal(contentReads().length, 5);
    for (const c of contentReads()) assert.ok(c.url.endsWith("&filters[tenant][key][$eq]=beta"), c.url);
    assert.deepEqual(brandReads(), ["beta&pageSize=1"]);

    calls = [];
    res = await audit("webx_session=root-token", {});
    assert.equal(res.status, 200);
    assert.equal(contentReads().length, 5);
    for (const c of contentReads()) assert.ok(c.url.endsWith("&status=published"), c.url);
    assert.deepEqual(brandReads(), []);
    assert.equal(res.json.brandContrast, null);
  });
});
