#!/usr/bin/env node
// C4 step 4, the second factor in webx-control: the real binary over HTTP, with codes made the way an authenticator app makes them
// (Node's own HMAC-SHA-1). A workspace that requires a second factor past its grace period gives a person without one a session that
// may only set one up, and no engine token; setting one up makes the session whole; signing in with one waits for the code (202, a
// pending id) and makes the session only when it comes; a code is never accepted twice; recovery codes work once; eight wrong codes
// lock the codes; switching the factor off needs a code; a factor copied from Strapi (tools/migrate-mfa.mjs, against a fake Strapi)
// keeps the person's authenticator and their unused recovery codes; a waiting sign-in survives a restart; without the secret key
// nothing can be checked. Every step is in the audit table.
//
//   node tools/mfa-test.mjs [--port 1412]
//
// Needs the release build.
import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg("port", "1412");
const BASE = `http://localhost:${PORT}`;
const ADMIN = "mfa-admin-token", SERVICE = "mfa-service-token", AUTH = "mfa-broker-token", ENGINE = "mfa-engine-token";
const SECRET_KEY = randomBytes(32).toString("base64");
const DGA = "https://idp.example/realms/dga";
const exe = join(root, "target", "release", process.platform === "win32" ? "webx-control.exe" : "webx-control");
if (!existsSync(exe)) throw new Error(`no binary at ${exe}: cargo build --release first`);

let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); if (!ok) failures++; };
const call = async (method, path, token, body) => {
  const r = await fetch(BASE + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
};
const reason = (r) => r.json?.error?.details?.reason;
const claims = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

// ---- what an authenticator app does (RFC 6238)
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const base32 = (s) => { let bits = ""; for (const c of s.replace(/=+$/, "").toUpperCase()) bits += B32.indexOf(c).toString(2).padStart(5, "0"); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
const totp = (secret, step) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(step)); const h = createHmac("sha1", base32(secret)).update(b).digest(); const o = h[h.length - 1] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0"); };
const step = () => Math.floor(Date.now() / 1000 / 30);
/** a 6-digit code that is no step's code near now */
const wrongCode = (secret) => { const s = step(); for (let i = 0; ; i++) { const c = String(i).padStart(6, "0"); if ([-2, -1, 0, 1, 2].every((d) => totp(secret, s + d) !== c)) return c; } };

// ---- a fake Strapi with two MFA enrolments, as Studio wrote them
const bobSecret = "JBSWY3DPEHPK3PXP";
const legacy = (code) => createHash("sha256").update(code.toUpperCase().replace(/-/g, "")).digest("hex");
const strapiRows = [
  { adminEmail: "Bob@Example.org", secret: bobSecret, enabled: true, recoveryCodesHash: [legacy("AAAAA-BBBBB"), legacy("CCCCC-DDDDD")], recoveryCodesUsed: [legacy("CCCCC-DDDDD")] },
  { adminEmail: "dee@example.org", secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", enabled: false, recoveryCodesHash: [] },
  { adminEmail: "nobody@example.org", secret: "GEZDGNBVGY3TQOJQ", enabled: true },
];
const fake = createServer((req, res) => {
  const json = (o, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (req.method === "POST" && req.url === "/admin/login") return json({ data: { token: "jwt-fake" } });
  if (req.headers.authorization !== "Bearer jwt-fake") return json({ error: "no" }, 401);
  if (req.url.startsWith("/content-manager/collection-types/api::mfa-enrollment.mfa-enrollment")) return json({ results: strapiRows, pagination: { page: 1, pageCount: 1, total: strapiRows.length } });
  json({ error: "nope" }, 404);
});
await new Promise((ok) => fake.listen(0, "127.0.0.1", ok));
const STRAPI = `http://127.0.0.1:${fake.address().port}`;
const migrate = (...args) => new Promise((ok) => {
  const child = spawn(process.execPath, [join(root, "tools", "migrate-mfa.mjs"), ...args], { env: { ...process.env, STRAPI_URL: STRAPI, STRAPI_ADMIN_EMAIL: "a@b.c", STRAPI_ADMIN_PASSWORD: "x", WEBX_CONTROL_URL: BASE, WEBX_CONTROL_ADMIN_TOKEN: ADMIN } });
  let out = "", err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  child.on("exit", (code) => ok({ code, out, err, all: out + err }));
});

const dir = mkdtempSync(join(tmpdir(), "webx-mfa-"));
let server;
async function up(env = {}) {
  server = spawn(exe, ["--port", PORT, "--db", join(dir, "control.db")], { env: { ...process.env, WEBX_CONTROL_ADMIN_TOKEN: ADMIN, WEBX_CONTROL_SERVICE_TOKEN: SERVICE, WEBX_CONTROL_AUTH_TOKEN: AUTH, WEBX_CONTROL_ENGINE_TOKEN: ENGINE, WEBX_CONTROL_SECRET_KEY: SECRET_KEY, ...env }, stdio: ["ignore", "ignore", "inherit"] });
  server.done = new Promise((ok) => server.on("exit", ok));
  for (let n = 0; ; n++) {
    try { if ((await fetch(`${BASE}/_health`)).ok) return; } catch {}
    if (n > 100) throw new Error("webx-control did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
}
const down = async () => { server.kill("SIGTERM"); await server.done; };
const signIn = (email, subject) => call("POST", "/internal/sessions", AUTH, { issuer: DGA, subject, email, emailVerified: true, tenantKey: "dga", amr: ["pwd"], ip: "203.0.113.5" });
const finish = (pendingId, code) => call("POST", "/internal/sessions/mfa", AUTH, { pendingId, code });
const mine = (method, what, token, body) => call(method, `/api/auth/mfa/${what}`, token, body);
const audit = async (action) => (await call("GET", `/internal/audit?pageSize=200&filter=${encodeURIComponent("action:eq:" + action)}`, SERVICE)).json.data;

try {
  await up();
  // dga signs in through control and has required a second factor for longer than the grace period
  await call("PUT", "/admin/tenants/dga/identity", ADMIN, { mode: "both", issuer: DGA, clientId: "studio", mfaRequired: true, mfaRequiredAt: "2026-01-01T00:00:00.000Z" });
  for (const who of ["ann", "bob", "cy"]) await call("PUT", `/admin/users/${who}@example.org`, ADMIN, { memberships: [{ tenantKey: "dga", role: "editor" }] });

  // ---- overdue, without a second factor: a session that may only set one up
  const s1 = await signIn("ann@example.org", "sub-ann");
  check("an overdue person without a second factor gets a session of scope enroll", s1.status === 201 && s1.json.data.scope === "enroll" && claims(s1.json.data.accessToken).scope === "enroll", JSON.stringify(s1.json));
  const t1 = s1.json.data.accessToken;
  const eng = await call("POST", "/internal/engine-token", AUTH, { sessionId: s1.json.data.sessionId });
  check("and no engine token", eng.status === 403 && reason(eng) === "mfa_enrolment_required");
  const st = await mine("GET", "status", t1);
  check("their own status says it is overdue", st.status === 200 && st.json.data.overdue === true && st.json.data.enrolled === false && st.json.data.scope === "enroll");
  check("/api/auth/me shows the scope", (await call("GET", "/api/auth/me", t1)).json.data.scope === "enroll");

  // ---- setting one up
  const started = await mine("POST", "start", t1);
  const secret = started.json.data?.secret;
  check("start gives a secret and an otpauth URI", started.status === 200 && /^[A-Z2-7]{32}$/.test(secret) && started.json.data.otpauthUri.startsWith("otpauth://totp/WebX%20Studio:ann%40example.org?secret=" + secret));
  check("a wrong code does not confirm it", reason(await mine("POST", "confirm", t1, { code: wrongCode(secret) })) === "mfa_invalid");
  const s0 = step();
  const confirmed = await mine("POST", "confirm", t1, { code: totp(secret, s0) });
  const recovery = confirmed.json.data?.recoveryCodes ?? [];
  check("the right one does: eight recovery codes, once", confirmed.status === 200 && recovery.length === 8 && recovery.every((c) => /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(c)));
  const t1b = confirmed.json.data.accessToken;
  check("and the session is whole: scope full, multi-factor", claims(t1b).scope === "full" && claims(t1b).mfa === true);
  check("it now gets engine tokens", (await call("POST", "/internal/engine-token", AUTH, { sessionId: s1.json.data.sessionId })).status === 200);

  // ---- signing in with a second factor waits for the code
  const p1 = await signIn("ann@example.org", "sub-ann");
  check("a person with a second factor gets 202 and a pending id, no session", p1.status === 202 && p1.json.data.mfaRequired === true && p1.json.data.pendingId?.length > 30 && p1.json.data.accessToken === undefined);
  check("a wrong code: 401 mfa_invalid", reason(await finish(p1.json.data.pendingId, wrongCode(secret))) === "mfa_invalid");
  const done = await finish(p1.json.data.pendingId, totp(secret, s0 + 1));
  check("the right code makes the session, multi-factor and whole", done.status === 201 && claims(done.json.data.accessToken).mfa === true && done.json.data.scope === "full");
  check("the pending id is used up", reason(await finish(p1.json.data.pendingId, totp(secret, s0 + 1))) === "mfa_pending_expired");
  const p2 = await signIn("ann@example.org", "sub-ann");
  check("a code is never accepted twice", reason(await finish(p2.json.data.pendingId, totp(secret, s0 + 1))) === "mfa_invalid");
  const viaRecovery = await finish(p2.json.data.pendingId, recovery[0].toLowerCase());
  check("a recovery code works (in any case)", viaRecovery.status === 201);
  const p3 = await signIn("ann@example.org", "sub-ann");
  check("once", reason(await finish(p3.json.data.pendingId, recovery[0])) === "mfa_invalid");

  // ---- switching it off needs a code
  const t3 = (await finish(p3.json.data.pendingId, recovery[1])).json.data.accessToken;
  check("switching off without the right code is refused", reason(await mine("POST", "disable", t3, { code: wrongCode(secret) })) === "mfa_invalid" && (await mine("POST", "disable", t3, {})).status === 400);
  check("replacing it needs a code too", (await mine("POST", "start", t3, {})).status === 400);
  const off = await mine("POST", "disable", t3, { code: recovery[2] });
  check("with a recovery code it goes; where the workspace requires a factor that session is over (no new token)", off.status === 200 && off.json.data.enrolled === false && off.json.data.accessToken === undefined && (await call("GET", "/admin/users/ann@example.org/mfa", ADMIN)).json.data.enrolled === false && (await mine("GET", "status", t3)).status === 401, JSON.stringify(off.json));
  check("and the person's other sessions end", (await call("GET", `/internal/sessions/${done.json.data.sessionId}`, AUTH)).json.data.reason === "revoked: mfa_disabled");

  // ---- eight wrong codes lock the codes
  const cy = (await signIn("cy@example.org", "sub-cy")).json.data.accessToken;
  const cySecret = (await mine("POST", "start", cy)).json.data.secret;
  await mine("POST", "confirm", cy, { code: totp(cySecret, step()) });
  const pc = (await signIn("cy@example.org", "sub-cy")).json.data.pendingId;
  for (let i = 0; i < 8; i++) await finish(pc, wrongCode(cySecret));
  const locked = await finish(pc, totp(cySecret, step() + 1));
  check("after eight wrong codes even the right one is refused: 429 mfa_locked", locked.status === 429 && reason(locked) === "mfa_locked");
  check("the operator sees the lock", (await call("GET", "/admin/users/cy@example.org/mfa", ADMIN)).json.data.lockedUntil > Date.now() / 1000);

  // ---- a factor copied from Strapi
  const dry = await migrate("--dry-run");
  check("a dry run of the copy writes nothing", dry.code === 0 && /would copy bob@example\.org: authenticator, 1 unused recovery code/.test(dry.out) && (await call("GET", "/admin/users/bob@example.org/mfa", ADMIN)).json.data.enrolled === false, dry.all);
  const copy = await migrate();
  check("the copy takes finished enrolments, skips unconfirmed ones, and reports people control does not know (exit 1)", copy.code === 1 && /copied bob@example\.org/.test(copy.out) && /skip dee@example\.org/.test(copy.out) && /not in webx-control: nobody@example\.org/.test(copy.err), copy.all);
  const pb = await signIn("bob@example.org", "sub-bob");
  check("bob now waits for his code", pb.status === 202);
  check("and his old authenticator works", (await finish(pb.json.data.pendingId, totp(bobSecret, step()))).status === 201);
  const pb2 = (await signIn("bob@example.org", "sub-bob")).json.data.pendingId;
  check("a recovery code Strapi had marked used does not", reason(await finish(pb2, "CCCCC-DDDDD")) === "mfa_invalid");
  check("an unused one does, once", (await finish(pb2, "aaaaa-bbbbb")).status === 201 && reason(await finish((await signIn("bob@example.org", "sub-bob")).json.data.pendingId, "AAAAA-BBBBB")) === "mfa_invalid");
  const again = await migrate();
  check("run again, it leaves a factor control already has alone", /kept bob@example\.org/.test(again.out), again.all);

  // ---- a waiting sign-in survives a restart; without the key nothing can be checked
  const waiting = (await signIn("bob@example.org", "sub-bob")).json.data.pendingId;
  await down();
  await up({ WEBX_CONTROL_SECRET_KEY: "" });
  const nokey = await finish(waiting, totp(bobSecret, step() + 1));
  check("without WEBX_CONTROL_SECRET_KEY no code can be checked: 503", nokey.status === 503 && reason(nokey) === "mfa_unavailable");
  await down();
  await up();
  check("with it back, the sign-in that waited completes", (await finish(waiting, totp(bobSecret, step() + 1))).status === 201);

  // ---- a factor taken away here (a lost phone) is not brought back by copying Strapi's again
  check("an operator takes bob's factor away", (await call("DELETE", "/admin/users/bob@example.org/mfa", ADMIN)).status === 200 && (await call("GET", "/admin/users/bob@example.org/mfa", ADMIN)).json.data.enrolled === false);
  const recopy = await migrate();
  check("copying Strapi's again leaves it gone", /kept bob@example.org/.test(recopy.out) && (await call("GET", "/admin/users/bob@example.org/mfa", ADMIN)).json.data.enrolled === false, recopy.all);
  const forced = await migrate("--replace");
  check("only --replace brings it back", /copied bob@example.org/.test(forced.out) && (await call("GET", "/admin/users/bob@example.org/mfa", ADMIN)).json.data.enrolled === true, forced.all);

  // ---- the trail
  const trail = await Promise.all(["mfa_enrolment_started", "mfa_enabled", "mfa_failed", "mfa_locked", "mfa_recovery_used", "mfa_disabled", "mfa_imported", "mfa_reset", "sign_in_mfa_pending"].map(async (a) => [a, (await audit(a)).length]));
  check("every step is in the audit table", trail.every(([, n]) => n > 0), JSON.stringify(trail));
  check("a sign-in with a code says how", (await audit("sign_in")).some((r) => /mfa=totp/.test(r.targetRef)) && (await audit("sign_in")).some((r) => /mfa=recovery/.test(r.targetRef)) && (await audit("sign_in")).some((r) => /scope=enroll/.test(r.targetRef)));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  if (server) { try { await down(); } catch {} }
  fake.close();
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : "\nwebx-control MFA: all checks passed");
process.exit(failures ? 1 : 0);
