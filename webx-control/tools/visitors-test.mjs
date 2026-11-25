#!/usr/bin/env node
// C5, the visitors' routes (decision D12): the real webx-control binary, over HTTP, called the way a visitor's
// browser calls it. A cookie choice is logged for a registered workspace, an unknown one is filed under the
// first tenant (or refused with --strict-tenants), bad bodies are refused, an address that logs too much is
// slowed, and what was logged can be read back by the control plane's records API.
//
//   node tools/visitors-test.mjs [--port 1407]
//
// Needs the release build.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg("port", "1407");
const BASE = `http://localhost:${PORT}`;
const ADMIN = "visitors-admin-token", SERVICE = "visitors-service-token";
const exe = join(root, "target", "release", process.platform === "win32" ? "webx-control.exe" : "webx-control");
if (!existsSync(exe)) throw new Error(`no binary at ${exe}: cargo build --release first`);

const dir = mkdtempSync(join(tmpdir(), "webx-visitors-"));
const db = join(dir, "control.db");
let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); if (!ok) failures++; };
const call = async (method, path, { token, body, headers } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...(headers || {}) }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j, headers: Object.fromEntries(r.headers) };
};
let server;
async function up(args = [], env = {}) {
  server = spawn(exe, ["--port", PORT, "--db", db, ...args], { env: { ...process.env, WEBX_CONTROL_ADMIN_TOKEN: ADMIN, WEBX_CONTROL_SERVICE_TOKEN: SERVICE, ...env }, stdio: ["ignore", "ignore", "inherit"] });
  server.done = new Promise((ok) => server.on("exit", ok));
  for (let n = 0; ; n++) {
    try { if ((await fetch(`${BASE}/_health`)).ok) return; } catch {}
    if (n > 100) throw new Error("webx-control did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
}
const down = async () => { server.kill("SIGTERM"); await server.done; };
const consent = { data: { consentId: "c-1", action: "accept_all", categories: { necessary: true, analytics: true, marketing: false }, language: "th", path: "/pea", userAgent: "Mozilla/5.0" } };
const logs = async (extra = "") => (await call("GET", `/internal/records/consent-log?pageSize=100${extra}`, { token: SERVICE })).json;

try {
  await up();
  for (const key of ["dga", "pea"]) await call("PUT", `/admin/tenants/${key}`, { token: ADMIN, body: { engine: "strapi", publicTemplate: "gov-portal" } });

  const a = await call("POST", "/api/consent-logs?tenant=pea", { body: consent, headers: { "x-forwarded-for": "10.0.0.1" } });
  check("a visitor's cookie choice is logged without signing in: 201", a.status === 201 && typeof a.json.data.documentId === "string", JSON.stringify(a));
  const stored = (await call("GET", `/internal/records/consent-log/${a.json.data.documentId}`, { token: SERVICE })).json.data;
  check("it is stored as given, for the workspace in the URL", stored.tenantKey === "pea" && stored.consentId === "c-1" && stored.action === "accept_all" && stored.categories.analytics === true && stored.path === "/pea" && stored.createdAt, JSON.stringify(stored));

  const u = await call("POST", "/api/consent-logs?tenant=nobody", { body: consent, headers: { "x-forwarded-for": "10.0.0.2" } });
  const filed = (await call("GET", `/internal/records/consent-log/${u.json.data.documentId}`, { token: SERVICE })).json.data;
  check("an unregistered tenant is filed under the first one, as Strapi does", u.status === 201 && filed.tenantKey === "dga", JSON.stringify(filed));
  check("no tenant named: the first one too", (await call("POST", "/api/consent-logs", { body: consent, headers: { "x-forwarded-for": "10.0.0.2" } })).status === 201);

  const long = "x".repeat(3000);
  const c = await call("POST", "/api/consent-logs?tenant=dga", { body: { data: { action: "custom", path: long, userAgent: long, injected: "no" } }, headers: { "x-forwarded-for": "10.0.0.3" } });
  const cut = (await call("GET", `/internal/records/consent-log/${c.json.data.documentId}`, { token: SERVICE })).json.data;
  check("long text is cut and unknown fields are dropped", cut.path.length === 512 && cut.userAgent.length === 512 && cut.injected === undefined, JSON.stringify(cut).slice(0, 200));

  check("a body that is not JSON: 400", (await call("POST", "/api/consent-logs?tenant=dga", { body: "not json", headers: { "x-forwarded-for": "10.0.0.4" } })).status === 400);
  check("a choice without an action: 400", (await call("POST", "/api/consent-logs?tenant=dga", { body: { data: { path: "/" } }, headers: { "x-forwarded-for": "10.0.0.4" } })).status === 400);
  check("categories that are not an object: 400", (await call("POST", "/api/consent-logs?tenant=dga", { body: { data: { action: "x", categories: [1] } }, headers: { "x-forwarded-for": "10.0.0.4" } })).status === 400);
  const big = await call("POST", "/api/consent-logs?tenant=dga", { body: { data: { action: "x", categories: { k: "y".repeat(40_000) } } }, headers: { "x-forwarded-for": "10.0.0.4" } });
  check("a body past 16 KB is refused: 413", big.status === 413, String(big.status));

  // one address logging too much is slowed; others are not
  let limited = 0;
  for (let n = 0; n < 40; n++) if ((await call("POST", "/api/consent-logs?tenant=dga", { body: consent, headers: { "x-forwarded-for": "10.9.9.9" } })).status === 429) limited++;
  check("an address that logs 40 times in a minute is rate-limited after 30: 429", limited === 10, `limited ${limited}`);
  check("another address is not affected", (await call("POST", "/api/consent-logs?tenant=dga", { body: consent, headers: { "x-forwarded-for": "10.9.9.8" } })).status === 201);

  // the visitor's route cannot read or change anything, and the records API still needs the service token
  check("the public route is write-only: a GET is not served", (await call("GET", "/api/consent-logs?tenant=pea")).status !== 200);
  check("reading the log needs the service token: 401", (await call("GET", "/internal/records/consent-log")).status === 401);
  const mine = await logs(`&filter=${encodeURIComponent("tenantKey:eq:pea")}`);
  check("the control plane lists a workspace's log by tenantKey", mine.meta.pagination.total === 1 && mine.data[0].consentId === "c-1", JSON.stringify(mine).slice(0, 200));

  // search statistics: what visitors search for, counted without who searched
  const search = (tenant, body, ip = "10.1.0.1", extra = {}) => call("POST", `/api/search-stats/log${tenant === null ? "" : "?tenant=" + tenant}`, { body, headers: { "x-forwarded-for": ip, ...extra } });
  const stats = async (q = "") => (await call("GET", `/internal/records/search-stat?pageSize=100${q}`, { token: SERVICE })).json;
  const peaStats = (extra = "") => stats(`&filter=${encodeURIComponent("tenantKey:eq:pea")}${extra}`);
  const s1 = await search("pea", { q: "  Open   DATA ", locale: "en", results: 7 });
  check("a search is counted and answered 204 with no body", s1.status === 204 && s1.json === null, JSON.stringify(s1));
  await search("pea", { q: "open data", locale: "en", results: 0 });
  await search("pea", { q: "OPEN DATA", locale: "en", results: 3 });
  const row = (await peaStats()).data.find((r) => r.query === "open data");
  check("the same search, however it was typed, is one row that counts up", row && row.count === 3 && row.locale === "en" && row.tenantKey === "pea", JSON.stringify(row));
  check("it remembers the last result count and how often it found nothing", row.results === 3 && row.zeroCount === 1 && typeof row.lastAt === "string" && typeof row.documentId === "string", JSON.stringify(row));
  await search("pea", { q: "open data", locale: "th", results: 1 });
  await search("pea", { q: "budget", locale: "xx", results: "12" });
  const all = (await peaStats()).data;
  check("each language is its own row; an unknown language is Thai", all.some((r) => r.query === "open data" && r.locale === "th") && all.find((r) => r.query === "budget").locale === "th");
  check("a result count sent as text is read; the rest are clamped", all.find((r) => r.query === "budget").results === 12);
  await search("pea", { q: "huge", results: 999999 });
  await search("pea", { q: "negative", results: -5 });
  await search("pea", { q: "junk", results: "lots" });
  const clamped = Object.fromEntries((await peaStats()).data.map((r) => [r.query, r.results]));
  check("results are clamped to 0..10000 and junk is 0", clamped.huge === 10000 && clamped.negative === 0 && clamped.junk === 0, JSON.stringify(clamped));
  for (const q of ["somchai@example.com", "081-234-5678", "1 2345 67890 12 3", "", "   "]) {
    check(`a query that is empty or looks like personal data is dropped, still 204: "${q}"`, (await search("pea", { q, results: 1 })).status === 204);
  }
  const names = (await peaStats()).data.map((r) => r.query);
  check("none of them was stored", !names.some((n) => /@|081|2345|^$/.test(n)), JSON.stringify(names));
  check("a year in a query is kept", (await search("pea", { q: "EGDI 2026", results: 2 })).status === 204 && (await peaStats()).data.some((r) => r.query === "egdi 2026"));
  const top = (await peaStats("&sort=count:DESC")).data;
  check("the list is most searched first", top[0].query === "open data" && top[0].count === 3 && top[1].count <= top[0].count, JSON.stringify(top.map((r) => [r.query, r.count])));
  check("it filters by language", (await peaStats(`&filter=${encodeURIComponent("locale:eq:en")}`)).data.every((r) => r.locale === "en"));
  check("and pages with a total", (await stats(`&filter=${encodeURIComponent("tenantKey:eq:pea")}&page=2&pageSize=2`)).meta.pagination.pageSize === 2);
  check("a search with no tenant is filed under the first workspace", (await search(null, { q: "no tenant", results: 1 })).status === 204 && (await stats(`&filter=${encodeURIComponent("tenantKey:eq:dga")}`)).data.some((r) => r.query === "no tenant"));
  check("an unregistered tenant too, as Strapi does", (await search("nobody", { q: "stranger", results: 1 })).status === 204 && (await stats(`&filter=${encodeURIComponent("tenantKey:eq:dga")}`)).data.some((r) => r.query === "stranger"));
  check("another workspace's statistics are separate", !(await stats(`&filter=${encodeURIComponent("tenantKey:eq:pea")}`)).data.some((r) => r.query === "stranger"));
  check("a body that is not JSON: 400", (await call("POST", "/api/search-stats/log?tenant=pea", { body: "nope", headers: { "x-forwarded-for": "10.1.0.2" } })).status === 400);
  check("a body past 4 KB is refused: 413", (await search("pea", { q: "x", pad: "y".repeat(5000) }, "10.1.0.3")).status === 413);
  check("the statistics cannot be changed through the records API: 404", (await call("POST", "/internal/records/search-stat", { token: SERVICE, body: { data: { query: "forged" } } })).status === 404);
  check("reading them needs the service token: 401", (await call("GET", "/internal/records/search-stat")).status === 401);
  check("an unknown filter is refused: 400", (await call("GET", `/internal/records/search-stat?filter=${encodeURIComponent("tenant.key:eq:pea")}`, { token: SERVICE })).status === 400);
  // its own allowance: 30 a minute per address, not shared with the consent log's
  let slowed = 0;
  for (let k = 0; k < 40; k++) if ((await search("pea", { q: "flood " + k, results: 1 }, "10.2.2.2")).status === 429) slowed++;
  check("an address that searches 40 times in a minute is rate-limited after 30: 429", slowed === 10, `limited ${slowed}`);
  check("the consent log's allowance for that address is its own", (await call("POST", "/api/consent-logs?tenant=dga", { body: consent, headers: { "x-forwarded-for": "10.2.2.2" } })).status === 201);
  check("the browser's preflight is answered for it too", (await call("OPTIONS", "/api/search-stats/log?tenant=pea", { headers: { origin: "http://localhost:3100", "access-control-request-method": "POST" } })).headers["access-control-allow-origin"] === "http://localhost:3100");

  // a visitor's browser is on the public site's origin, not this service's: CORS names the origins that may call
  const site = "http://localhost:3100", other = "https://evil.example.com";
  const pre = await call("OPTIONS", "/api/consent-logs?tenant=pea", { headers: { origin: site, "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
  check("a preflight from the public site's origin is answered 204 naming that origin", pre.status === 204 && pre.headers["access-control-allow-origin"] === site && /POST/.test(pre.headers["access-control-allow-methods"] || "") && /content-type/i.test(pre.headers["access-control-allow-headers"] || ""), JSON.stringify(pre.headers));
  const withOrigin = await call("POST", "/api/consent-logs?tenant=pea", { body: consent, headers: { origin: site, "x-forwarded-for": "10.0.0.5" } });
  check("the post itself carries the origin too, and Vary: Origin", withOrigin.status === 201 && withOrigin.headers["access-control-allow-origin"] === site && /origin/i.test(withOrigin.headers.vary || ""), JSON.stringify(withOrigin.headers));
  const evilPre = await call("OPTIONS", "/api/consent-logs?tenant=pea", { headers: { origin: other, "access-control-request-method": "POST" } });
  check("an origin that is not listed gets no permission from the preflight", evilPre.status === 204 && evilPre.headers["access-control-allow-origin"] === undefined, JSON.stringify(evilPre.headers));
  check("nor on the post", (await call("POST", "/api/consent-logs?tenant=pea", { body: consent, headers: { origin: other, "x-forwarded-for": "10.0.0.6" } })).headers["access-control-allow-origin"] === undefined);
  check("the tenant lookup a browser makes is covered too", (await call("GET", "/api/tenants/resolve?tenant=pea", { headers: { origin: site } })).headers["access-control-allow-origin"] === site);
  check("a server call with no Origin gets no CORS headers", (await call("GET", "/api/tenants/keys")).headers["access-control-allow-origin"] === undefined);
  check("/internal is never opened to a browser", (await call("GET", "/internal/records/consent-log", { token: SERVICE, headers: { origin: site } })).headers["access-control-allow-origin"] === undefined);
  check("nor is the sign-in check", (await call("GET", "/api/auth/me", { headers: { origin: site } })).headers["access-control-allow-origin"] === undefined);

  // the numbers an analytics screen shows, from the control plane (service token)
  const sum = async (q = "") => (await call("GET", `/internal/consent/summary${q}`, { token: SERVICE }));
  const pea = (await sum("?tenant=pea")).json.data;
  check("the consent summary counts a workspace's choices by kind", pea.total === 3 && pea.accept === 3 && pea.reject === 0 && pea.custom === 0, JSON.stringify(pea));
  const dga = (await sum("?tenant=dga")).json.data;
  check("the other workspace has its own numbers", dga.total === 35 && dga.accept === 34 && dga.custom === 1, JSON.stringify(dga));
  check("no tenant: every workspace together", (await sum()).json.data.total === pea.total + dga.total);
  check("a window that has not started yet has none", (await sum(`?tenant=dga&from=${encodeURIComponent(new Date(Date.now() + 86400000).toISOString())}`)).json.data.total === 0);
  check("a window that ended before has none", (await sum("?before=2020-01-01T00:00:00Z")).json.data.total === 0);
  check("a window around now has them all", (await sum(`?tenant=dga&from=${encodeURIComponent(new Date(Date.now() - 86400000).toISOString())}&before=${encodeURIComponent(new Date(Date.now() + 86400000).toISOString())}`)).json.data.total === 35);
  check("a bad time is refused: 400", (await sum("?from=yesterday")).status === 400);
  check("an unknown parameter is refused: 400", (await sum("?colour=red")).status === 400);
  check("the summary needs the service token: 401", (await call("GET", "/internal/consent/summary")).status === 401);

  // the same log survives a restart, and --strict-tenants refuses an unknown workspace
  await down();
  await up(["--strict-tenants"]);
  check("the log is still there after a restart", (await logs()).meta.pagination.total >= 4);
  check("with --strict-tenants an unknown workspace is refused: 404", (await call("POST", "/api/consent-logs?tenant=nobody", { body: consent, headers: { "x-forwarded-for": "10.0.1.1" } })).status === 404);
  check("a registered one is still accepted", (await call("POST", "/api/consent-logs?tenant=dga", { body: consent, headers: { "x-forwarded-for": "10.0.1.1" } })).status === 201);

  // a deployment names its public sites in WEBX_PUBLIC_SITE_ORIGINS (a trailing slash is ignored), or "*" for any
  await down();
  await up([], { WEBX_PUBLIC_SITE_ORIGINS: "https://pea.example.go.th/, https://nbtc.example.go.th" });
  const named = await call("OPTIONS", "/api/consent-logs", { headers: { origin: "https://pea.example.go.th", "access-control-request-method": "POST" } });
  check("an origin named in WEBX_PUBLIC_SITE_ORIGINS is allowed", named.headers["access-control-allow-origin"] === "https://pea.example.go.th", JSON.stringify(named.headers));
  check("the development origins stay allowed", (await call("OPTIONS", "/api/consent-logs", { headers: { origin: site, "access-control-request-method": "POST" } })).headers["access-control-allow-origin"] === site);
  check("an unnamed one is still refused", (await call("OPTIONS", "/api/consent-logs", { headers: { origin: other, "access-control-request-method": "POST" } })).headers["access-control-allow-origin"] === undefined);
  await down();
  await up([], { WEBX_PUBLIC_SITE_ORIGINS: "*" });
  check("\"*\" allows any origin", (await call("OPTIONS", "/api/consent-logs", { headers: { origin: other, "access-control-request-method": "POST" } })).headers["access-control-allow-origin"] === "*");
} catch (e) {
  console.error(e);
  failures++;
} finally {
  if (server) { try { await down(); } catch {} }
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : "\nwebx-control visitors: all checks passed");
process.exit(failures ? 1 : 0);
