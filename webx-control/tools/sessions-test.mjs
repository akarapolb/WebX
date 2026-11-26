#!/usr/bin/env node
// C4 step 2, sessions: the real webx-control binary, over HTTP. Sign-in decisions (the workspace's own provider, a verified
// e-mail, who may be made on the spot, a second subject for a linked e-mail, super admins), refresh rotation with its grace and
// its theft rule, ending sessions (logout, disabling, taking a workspace away, deleting, changing a provider), the 60-second
// engine token, the separate credentials, a restart, and a signing-key rotation. Tokens are checked the way an engine would:
// with Node's own crypto and the keys from /.well-known/jwks.json, chosen by `kid`.
//
//   node tools/sessions-test.mjs [--port 1405]
//
// Needs the release build.
import { spawn, spawnSync } from "node:child_process";
import { createPublicKey, randomBytes, verify } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg("port", "1405");
const BASE = `http://localhost:${PORT}`;
const ADMIN = "sess-admin-token", SERVICE = "sess-service-token", AUTH = "sess-broker-token", ENGINE = "sess-engine-token";
const exe = join(root, "target", "release", process.platform === "win32" ? "webx-control.exe" : "webx-control");
if (!existsSync(exe)) throw new Error(`no binary at ${exe}: cargo build --release first`);

const DGA = "https://idp.example/realms/dga", PEA = "https://idp.example/realms/pea", PLATFORM = "https://id.platform.example/realms/ops";
const dir = mkdtempSync(join(tmpdir(), "webx-sessions-"));
const db = join(dir, "control.db");
const seed = () => randomBytes(32).toString("base64");
const KEY_A = seed(), KEY_B = seed(), SECRET_KEY = seed();
let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); if (!ok) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (method, path, token, body) => {
  const r = await fetch(BASE + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j, headers: r.headers };
};
let server;
const baseEnv = (extra = {}) => ({ ...process.env, WEBX_CONTROL_ADMIN_TOKEN: ADMIN, WEBX_CONTROL_SERVICE_TOKEN: SERVICE, WEBX_CONTROL_AUTH_TOKEN: AUTH, WEBX_CONTROL_ENGINE_TOKEN: ENGINE, WEBX_CONTROL_SIGNING_KEY: KEY_A, WEBX_CONTROL_SECRET_KEY: SECRET_KEY, ...extra });
async function up(args = [], env = {}) {
  server = spawn(exe, ["--port", PORT, "--db", db, "--refresh-grace", "2", "--session-idle", "6", ...args], { env: baseEnv(env), stdio: ["ignore", "ignore", "inherit"] });
  server.done = new Promise((ok) => server.on("exit", ok));
  for (let n = 0; ; n++) {
    try { if ((await fetch(`${BASE}/_health`)).ok) return; } catch {}
    if (n > 100) throw new Error("webx-control did not start");
    await sleep(100);
  }
}
const down = async () => { server.kill("SIGTERM"); await server.done; };
const b64 = (s) => Buffer.from(s, "base64url");

/** what an engine does: fetch the key set, take the key the token names, check signature, issuer, audience and the times */
async function engineVerifies(token, aud) {
  const jwks = (await (await fetch(`${BASE}/.well-known/jwks.json`)).json()).keys;
  const [h, c, s] = token.split(".");
  const header = JSON.parse(b64(h).toString());
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (header.alg !== "EdDSA" || !jwk) return null;
  if (!verify(null, Buffer.from(`${h}.${c}`), createPublicKey({ key: jwk, format: "jwk" }), b64(s))) return null;
  const claims = JSON.parse(b64(c).toString());
  const now = Date.now() / 1000;
  return claims.iss === "webx-control" && claims.aud === aud && claims.exp > now && claims.nbf <= now ? claims : null;
}
const kidOf = (token) => JSON.parse(b64(token.split(".")[0]).toString()).kid;

const signIn = (o = {}) => call("POST", "/internal/sessions", AUTH, { issuer: DGA, subject: "sub-ann", email: "ann@example.org", emailVerified: true, tenantKey: "dga", amr: ["pwd"], ip: "203.0.113.7", userAgent: "sessions-test", ...o });
const refresh = (refreshToken) => call("POST", "/internal/sessions/refresh", AUTH, { refreshToken });
const status = (sid) => call("GET", `/internal/sessions/${encodeURIComponent(sid)}`, AUTH);
const me = (token) => call("GET", "/api/auth/me", token);
const engineToken = (body) => call("POST", "/internal/engine-token", AUTH, body);
const putUser = (email, body) => call("PUT", `/admin/users/${encodeURIComponent(email)}`, ADMIN, body);
const audit = async (filter) => (await call("GET", `/internal/audit?pageSize=200&sort=${encodeURIComponent("at:asc")}&filter=${encodeURIComponent(filter)}`, SERVICE)).json.data;
const reason = (r) => r.json?.error?.details?.reason;
// a workspace that signs in through control (step 3: anything else is legacy, and has no sessions)
const ws = (issuer, extra = {}) => ({ mode: "both", issuer, clientId: "webx-studio", ...extra });
const ORST = "https://idp.example/realms/orst";
const ANN = (disabled = false, pea = true) => ({ name: "Ann", disabled, memberships: [{ tenantKey: "dga", role: "editor" }, ...(pea ? [{ tenantKey: "pea", role: "viewer" }] : [])] });

try {
  // ---- a start-up that refuses to give two credentials the same value, and a seed for the signing key
  const clash = spawnSync(exe, ["--port", "1", "--db", join(dir, "clash.db")], { env: baseEnv({ WEBX_CONTROL_AUTH_TOKEN: SERVICE }), encoding: "utf8", timeout: 10_000 });
  check("a broker credential equal to the service token stops the start", clash.status !== 0 && /must not be the same value/.test(clash.stderr), clash.stderr);
  const sameKey = spawnSync(exe, ["--port", "1", "--db", join(dir, "same.db")], { env: baseEnv({ WEBX_CONTROL_SECRET_KEY: KEY_A }), encoding: "utf8", timeout: 10_000 });
  check("a secret key equal to the signing key stops the start", sameKey.status !== 0 && /WEBX_CONTROL_SECRET_KEY must not be the same value/.test(sameKey.stderr), sameKey.stderr);
  const k1 = spawnSync(exe, ["keygen"], { encoding: "utf8" }), k2 = spawnSync(exe, ["keygen"], { encoding: "utf8" });
  check("keygen prints a new 32-byte seed each time", k1.status === 0 && Buffer.from(k1.stdout.trim(), "base64").length === 32 && k1.stdout !== k2.stdout);

  await up();
  const jwks = await call("GET", "/.well-known/jwks.json");
  check("the key set is public and may be cached five minutes", jwks.status === 200 && jwks.json.keys.length === 1 && /max-age=300/.test(jwks.headers.get("cache-control") ?? ""));

  // ---- who may call what
  check("the session routes refuse the service token, the admin token, the engine token and no token",
    [SERVICE, ADMIN, ENGINE, null].every(async () => true) &&
    (await Promise.all([SERVICE, ADMIN, ENGINE, null].map((t) => call("POST", "/internal/sessions", t, {})))).every((r) => r.status === 401));
  check("with the broker credential set, the service token no longer makes tokens", (await call("POST", "/internal/token", SERVICE, { email: "ann@example.org" })).status === 401);
  check("and the broker credential does not read the audit log or the queue", (await call("GET", "/internal/audit", AUTH)).status === 401 && (await call("GET", "/internal/jobs", AUTH)).status === 401 && (await call("GET", "/internal/audit", SERVICE)).status === 200);

  // ---- what a workspace accepts, and its people
  check("no settings, no sign-in: the settings are an admin matter", (await call("PUT", "/admin/tenants/dga/identity", SERVICE, ws(DGA))).status === 401);
  check("a workspace's provider is set (201), then changed (200)", (await call("PUT", "/admin/tenants/dga/identity", ADMIN, ws(DGA))).status === 201 && (await call("PUT", "/admin/tenants/pea/identity", ADMIN, ws(PEA))).status === 201 && (await call("PUT", "/admin/tenants/dga/identity", ADMIN, ws(DGA))).status === 200 && (await call("PUT", "/admin/tenants/orst/identity", ADMIN, ws(ORST))).status === 201);
  const got = await call("GET", "/admin/tenants/dga/identity", ADMIN);
  check("and read back: verified e-mail required, nobody made on the spot", got.json.data.issuer === DGA && got.json.data.mode === "both" && got.json.data.requireVerifiedEmail === true && got.json.data.allowJit === false);
  check("settings with only a provider are legacy, the default", (await call("PUT", "/admin/tenants/nsm/identity", ADMIN, { issuer: DGA })).status === 201 && (await call("GET", "/admin/tenants/nsm/identity", ADMIN)).json.data.mode === "legacy");
  check("both and control need a provider and a client", (await call("PUT", "/admin/tenants/nsm/identity", ADMIN, { mode: "both", issuer: DGA })).status === 400 && (await call("PUT", "/admin/tenants/nsm/identity", ADMIN, { mode: "control", clientId: "x" })).status === 400);
  check("a provider that is not an https URL is refused, and making people on the spot needs a role", (await call("PUT", "/admin/tenants/dga/identity", ADMIN, { issuer: "http://idp.example" })).status === 400 && (await call("PUT", "/admin/tenants/dga/identity", ADMIN, ws(DGA, { allowJit: true }))).status === 400 && (await call("PUT", "/admin/tenants/dga/identity", ADMIN, ws(DGA, { allowJit: true, jitRole: "admin" }))).status === 400);
  await putUser("ann@example.org", ANN());
  await putUser("bob@example.org", { name: "Bob", memberships: [{ tenantKey: "pea", role: "admin" }] });
  await putUser("root@example.org", { name: "Root", superAdmin: true, memberships: [{ tenantKey: "dga", role: "admin" }] });

  // ---- refusals, each with its reason
  const refusals = [
    ["another workspace's provider", { issuer: PEA }, "issuer_mismatch"],
    ["a workspace with no settings", { tenantKey: "opdc" }, "workspace_not_configured"],
    ["a workspace that is still legacy", { tenantKey: "nsm" }, "workspace_legacy"],
    ["an e-mail the provider did not verify", { emailVerified: false }, "email_not_verified"],
    ["a user who does not exist, with no one made on the spot", { email: "new@example.org", subject: "sub-new" }, "unknown_user"],
    ["a member of another workspace only", { email: "bob@example.org", subject: "sub-bob" }, "not_a_member"],
    ["a super admin vouched for by a workspace's provider", { email: "root@example.org", subject: "sub-root" }, "super_admin_needs_operator_link"],
  ];
  for (const [what, body, why] of refusals) {
    const r = await signIn(body);
    check(`refused (403 ${why}): ${what}`, r.status === 403 && reason(r) === why, JSON.stringify(r.json));
  }
  check("a malformed sign-in is a 400", (await signIn({ email: "nope" })).status === 400 && (await signIn({ issuer: "ftp://x" })).status === 400 && (await signIn({ tenantKey: "BAD" })).status === 400);
  check("each refusal is in the audit table with its reason", (await audit("action:eq:sign_in_refused")).filter((r) => /issuer_mismatch|workspace_not_configured|workspace_legacy|email_not_verified|unknown_user|not_a_member|super_admin_needs_operator_link/.test(r.targetRef)).length === refusals.length);

  // ---- step 3: the provider's client secret, kept sealed, read only by the broker and only once the workspace switches
  check("a client secret is set, and the operator's view says only that it is there", (await call("PUT", "/admin/tenants/nsm/identity", ADMIN, { issuer: DGA, clientId: "nsm-studio", clientSecret: "nsm-s3cret" })).status === 200 && (await call("GET", "/admin/tenants/nsm/identity", ADMIN)).json.data.hasClientSecret === true && !JSON.stringify((await call("GET", "/admin/tenants/nsm/identity", ADMIN)).json).includes("nsm-s3cret"));
  check("while the workspace is legacy the broker learns its mode and nothing else", JSON.stringify((await call("GET", "/internal/tenants/nsm/identity", AUTH)).json.data) === JSON.stringify({ tenantKey: "nsm", mode: "legacy" }));
  await call("PUT", "/admin/tenants/nsm/identity", ADMIN, { mode: "both", issuer: DGA, clientId: "nsm-studio" });
  const settings = await call("GET", "/internal/tenants/nsm/identity", AUTH);
  check("once it switches the broker reads the provider, the client and the secret (a save without the secret kept it)", settings.status === 200 && settings.json.data.clientSecret === "nsm-s3cret" && settings.json.data.clientId === "nsm-studio" && settings.json.data.issuer === DGA && settings.json.data.mode === "both");
  check("only the broker reads it: not the service token, the admin token, the engine credential or no token", (await Promise.all([SERVICE, ADMIN, ENGINE, null].map((t) => call("GET", "/internal/tenants/nsm/identity", t)))).every((r) => r.status === 401));
  check("a workspace with no settings is a 404", (await call("GET", "/internal/tenants/opdc/identity", AUTH)).status === 404);
  check("no audit row carries the secret, and each change is there", (await audit("action:eq:workspace_identity_saved")).every((r) => !r.targetRef.includes("nsm-s3cret")) && (await audit("action:eq:workspace_identity_saved")).some((r) => r.tenantKey === "nsm" && /secret=set/.test(r.targetRef)));

  // ---- a sign-in, and what its token says
  const s1 = await signIn();
  check("a member signs in: 201 with a session, an access token and a refresh token", s1.status === 201 && s1.json.data.sessionId && s1.json.data.accessToken && s1.json.data.refreshToken.startsWith(s1.json.data.sessionId + "."));
  const sid1 = s1.json.data.sessionId;
  const claims1 = await engineVerifies(s1.json.data.accessToken, "webx-studio");
  check("an engine verifies it by kid, and reads the session, workspace and role",
    claims1 && claims1.sid === sid1 && claims1.tid === "dga" && claims1.role === "editor" && claims1.sub === "ann@example.org" && claims1.sa === false && claims1.mfa === false && claims1.amr[0] === "pwd" && typeof claims1.uid === "string" && claims1.crole === null);
  check("it is not an engine token", (await engineVerifies(s1.json.data.accessToken, "engine")) === null);
  const who = await me(s1.json.data.accessToken);
  check("/api/auth/me names the session and workspace", who.status === 200 && who.json.data.sid === sid1 && who.json.data.tid === "dga" && who.json.data.superAdmin === false && who.json.data.role === "editor");
  const again = await signIn({ email: "another.address@example.org" });
  check("the next sign-in is by (provider, subject): the e-mail the provider sends now is not consulted", again.status === 201 && (await engineVerifies(again.json.data.accessToken, "webx-studio")).sub === "ann@example.org");
  const stranger = await signIn({ subject: "sub-someone-else" });
  check("a second subject for a linked e-mail is refused", stranger.status === 403 && reason(stranger) === "subject_changed");
  const st = await status(sid1);
  check("the session reads back as active", st.status === 200 && st.json.data.active === true && st.json.data.tenantKey === "dga");

  // ---- refresh: rotation, the grace, and the theft rule (--refresh-grace 2)
  const r1 = await refresh(s1.json.data.refreshToken);
  check("refresh rotates the token", r1.status === 200 && r1.json.data.refreshToken && r1.json.data.refreshToken !== s1.json.data.refreshToken && (await engineVerifies(r1.json.data.accessToken, "webx-studio")).sid === sid1);
  const tab = await refresh(s1.json.data.refreshToken);
  check("the token it replaced still works a moment, for an access token only", tab.status === 200 && tab.json.data.accessToken && tab.json.data.refreshToken === undefined);
  await sleep(3200); // the grace is counted in whole seconds, so it ends between 2 and 3 seconds after the refresh
  const theft = await refresh(s1.json.data.refreshToken);
  check("after the grace the old token shown again is theft: 401 refresh_reuse", theft.status === 401 && reason(theft) === "refresh_reuse");
  check("and the whole session is over, for the thief and the person", (await refresh(r1.json.data.refreshToken)).status === 401 && (await me(r1.json.data.accessToken)).status === 401);
  const dead = await status(sid1);
  check("its status says why", dead.json.data.active === false && /refresh_reuse/.test(dead.json.data.reason));
  check("refresh_reuse is in the audit table with the session id", (await audit("action:eq:refresh_reuse")).some((r) => r.entryId === sid1));

  // ---- a guess does not end a session
  const s2 = (await signIn()).json.data;
  const guess = await refresh(s2.sessionId + ".definitely-not-the-secret");
  check("a wrong secret is 401 and leaves the session alone", guess.status === 401 && reason(guess) === "invalid_refresh_token" && (await status(s2.sessionId)).json.data.active === true && (await refresh(s2.refreshToken)).status === 200);

  // ---- engine tokens
  const s3 = (await signIn()).json.data;
  const et = await engineToken({ sessionId: s3.sessionId, tenantKey: "dga" });
  const ec = et.status === 200 ? await engineVerifies(et.json.data.token, "engine") : null;
  check("an engine token for the session's workspace: audience engine, sixty seconds, role and session in it", ec && ec.tid === "dga" && ec.role === "editor" && ec.sid === s3.sessionId && ec.exp - ec.iat === 60);
  check("it is not a Studio token and Studio's /api/auth/me does not take it", (await engineVerifies(et.json.data.token, "webx-studio")) === null && (await me(et.json.data.token)).status === 401);
  const mismatch = await engineToken({ sessionId: s3.sessionId, tenantKey: "pea" });
  check("another workspace than the session's is refused: switch first", mismatch.status === 403 && reason(mismatch) === "workspace_mismatch");
  const sw = await call("POST", `/internal/sessions/${s3.sessionId}/switch`, AUTH, { tenantKey: "pea" });
  check("a session cannot move to a workspace whose provider is another one", sw.status === 403 && reason(sw) === "issuer_mismatch");
  check("an engine token needs the broker credential", (await call("POST", "/internal/engine-token", SERVICE, { sessionId: s3.sessionId })).status === 401);
  const job = await engineToken({ purpose: "job", ownerEmail: "ann@example.org", tenantKey: "dga", jobId: "job-1" });
  const jc = job.status === 200 ? await engineVerifies(job.json.data.token, "engine") : null;
  check("a job's token names the job and belongs to no session", jc && jc.job === "job-1" && jc.purpose === "job" && jc.sid === null && jc.tid === "dga");
  check("a job whose owner is not in that workspace gets none", (await engineToken({ purpose: "job", ownerEmail: "ann@example.org", tenantKey: "orst", jobId: "job-2" })).status === 403);
  check("the job is in the audit table", (await audit("action:eq:engine_token_job")).some((r) => r.entryId === "job-1") && (await audit("action:eq:engine_token_refused")).some((r) => r.entryId === "job-2"));

  // ---- logout
  check("logout: 200", (await call("DELETE", `/internal/sessions/${s3.sessionId}`, AUTH)).status === 200);
  check("the access token is refused at once, and so is an engine token", (await me(s3.accessToken)).status === 401 && (await engineToken({ sessionId: s3.sessionId })).status === 401);
  check("logging out twice is fine, an unknown session is a 404", (await call("DELETE", `/internal/sessions/${s3.sessionId}`, AUTH)).status === 200 && (await call("DELETE", "/internal/sessions/nope", AUTH)).status === 404 && (await status("nope")).status === 404);
  check("logout is in the audit table once", (await audit("action:eq:logout")).filter((r) => r.entryId === s3.sessionId).length === 1);

  // ---- disabling a user
  const s4 = (await signIn()).json.data;
  await putUser("ann@example.org", ANN(true));
  const s4s = await status(s4.sessionId);
  check("disabling a user ends their sessions", s4s.json.data.active === false && /user_disabled/.test(s4s.json.data.reason));
  check("their access token, refresh token and engine tokens stop", (await me(s4.accessToken)).status === 401 && (await refresh(s4.refreshToken)).status === 401 && (await engineToken({ sessionId: s4.sessionId })).status === 401);
  check("a job of theirs gets no token and they cannot sign in", (await engineToken({ purpose: "job", ownerEmail: "ann@example.org", tenantKey: "dga", jobId: "job-3" })).status === 403 && reason(await signIn()) === "user_disabled");
  await putUser("ann@example.org", ANN());
  const s5 = await signIn();
  check("enabled again, they sign in again", s5.status === 201);

  // ---- taking something away ends sessions, adding does not
  await putUser("ann@example.org", { name: "Annie", memberships: [{ tenantKey: "dga", role: "editor" }, { tenantKey: "pea", role: "viewer" }, { tenantKey: "orst", role: "viewer" }] });
  check("a new name and a new workspace end nothing", (await status(s5.json.data.sessionId)).json.data.active === true);
  await putUser("ann@example.org", ANN(false, false));
  check("losing a workspace does", (await status(s5.json.data.sessionId)).json.data.active === false);
  await putUser("ann@example.org", ANN());
  const s6 = (await signIn()).json.data;
  await putUser("ann@example.org", { name: "Ann", memberships: [{ tenantKey: "dga", role: "admin" }, { tenantKey: "pea", role: "viewer" }] });
  check("a changed role does too", (await status(s6.sessionId)).json.data.active === false);
  await putUser("ann@example.org", ANN());

  // ---- step 3: roles are the catalogue's, and a custom role is named in the token
  check("a free-text role is refused", (await putUser("cy@example.org", { memberships: [{ tenantKey: "dga", role: "Lead Editor" }] })).status === 400);
  await putUser("cy@example.org", { memberships: [{ tenantKey: "dga", role: "editor", customRole: "reviewer" }] });
  const cy = await signIn({ email: "cy@example.org", subject: "sub-cy" });
  check("a custom role is named in the token (crole)", cy.status === 201 && (await engineVerifies(cy.json.data.accessToken, "webx-studio")).crole === "reviewer" && (await me(cy.json.data.accessToken)).json.data.crole === "reviewer");
  await putUser("cy@example.org", { memberships: [{ tenantKey: "dga", role: "editor" }] });
  check("taking the custom role away ends the session: the token named it", (await status(cy.json.data.sessionId)).json.data.active === false);

  // ---- a super admin signs in only through an identity an operator linked
  check("an operator links the platform's provider to a super admin", (await call("PUT", "/admin/users/root@example.org/identities", ADMIN, { identities: [{ issuer: PLATFORM, subject: "sub-root" }] })).status === 200);
  check("the link is read back as the operator's", (await call("GET", "/admin/users/root@example.org/identities", ADMIN)).json.data[0].linkedBy === "admin");
  check("a subject belongs to one person", (await call("PUT", "/admin/users/ann@example.org/identities", ADMIN, { identities: [{ issuer: PLATFORM, subject: "sub-root" }] })).status === 400);
  const rs = await signIn({ issuer: PLATFORM, subject: "sub-root", email: "root@example.org", tenantKey: "orst" });
  const rc = rs.status === 201 ? await engineVerifies(rs.json.data.accessToken, "webx-studio") : null;
  check("then they sign in, to a workspace that signs in through control whatever its provider, as a super admin with no role there", rc && rc.sa === true && rc.superAdmin === true && rc.tid === "orst" && rc.role === null, JSON.stringify(rs.json));
  const rsw = await call("POST", `/internal/sessions/${rs.json.data.sessionId}/switch`, AUTH, { tenantKey: "dga" });
  check("and move to another such workspace", rsw.status === 200 && (await engineVerifies(rsw.json.data.accessToken, "webx-studio")).tid === "dga");

  // ---- step 3: a workspace set back to legacy (a rollback) ends every session in it, a super admin's too
  const annIn = (await signIn()).json.data;
  await call("PUT", "/admin/tenants/dga/identity", ADMIN, { mode: "legacy", issuer: DGA, clientId: "webx-studio" });
  check("back to legacy: every session in the workspace ends, a super admin's too", (await status(annIn.sessionId)).json.data.reason === "revoked: workspace_legacy" && (await status(rs.json.data.sessionId)).json.data.reason === "revoked: workspace_legacy" && (await me(annIn.accessToken)).status === 401);
  check("and nobody signs in there", reason(await signIn()) === "workspace_legacy");
  await call("PUT", "/admin/tenants/dga/identity", ADMIN, ws(DGA));

  // ---- people made on the spot, only where the workspace says so
  check("a workspace opts in to people made on the spot, with a role", (await call("PUT", "/admin/tenants/pea/identity", ADMIN, ws(PEA, { allowJit: true, jitRole: "viewer" }))).status === 200);
  const jit = await signIn({ issuer: PEA, tenantKey: "pea", email: "new@example.org", subject: "sub-new" });
  check("a new person is made, with that role", jit.status === 201 && (await engineVerifies(jit.json.data.accessToken, "webx-studio")).role === "viewer" && (await call("GET", "/admin/users/new@example.org", ADMIN)).json.data.memberships[0].role === "viewer");
  check("it is in the audit table", (await audit("action:eq:user_provisioned")).some((r) => r.adminEmail === "new@example.org"));

  // ---- changing a workspace's provider ends the sessions made with the old one
  const pea = (await signIn({ issuer: PEA, tenantKey: "pea", subject: "sub-ann-pea" })).json.data;
  await call("PUT", "/admin/tenants/pea/identity", ADMIN, ws("https://new-idp.example/realms/pea"));
  check("a new provider for the workspace ends its sessions, and the old one is refused", (await status(pea.sessionId)).json.data.active === false && reason(await signIn({ issuer: PEA, tenantKey: "pea", subject: "sub-ann-pea" })) === "issuer_mismatch");
  await call("PUT", "/admin/tenants/pea/identity", ADMIN, ws(PEA));

  // ---- idle expiry (--session-idle 6) and a restart
  const idle = (await signIn()).json.data;
  const keep = (await signIn()).json.data;
  await down();
  await up();
  check("a restart loses no session: the refresh token still works", (await refresh(keep.refreshToken)).status === 200);
  check("and the client secret opens after it, under the same key", (await call("GET", "/internal/tenants/nsm/identity", AUTH)).json.data.clientSecret === "nsm-s3cret");
  await sleep(6500);
  const expired = await refresh(idle.refreshToken);
  check("a session nobody refreshed for 6 seconds is over", expired.status === 401 && reason(expired) === "session_ended" && (await status(idle.sessionId)).json.data.reason === "expired");

  // ---- deleting a user
  const gone = (await signIn()).json.data;
  check("deleting a user: 200", (await call("DELETE", "/admin/users/ann@example.org", ADMIN)).status === 200);
  check("their sessions are gone and their tokens refused", (await status(gone.sessionId)).status === 404 && (await me(gone.accessToken)).status === 401 && (await refresh(gone.refreshToken)).status === 401);
  check("the audit table still says what happened", (await audit("action:eq:revoke")).some((r) => r.entryId === gone.sessionId && /user_deleted/.test(r.targetRef)) && (await audit("action:eq:sign_in")).some((r) => r.entryId === gone.sessionId));
  await putUser("ann@example.org", ANN());
  check("a user made again with the same e-mail does not inherit the old tokens", (await me(gone.accessToken)).status === 401);

  // ---- sign out everywhere
  const e1 = (await signIn({ subject: "sub-ann-2" })).json.data;
  check("a re-made user has no identity: the e-mail links again", e1 !== undefined);
  const e2 = (await signIn({ subject: "sub-ann-2" })).json.data;
  const rev = await call("POST", "/internal/users/ann@example.org/revoke", AUTH);
  check("sign out everywhere ends them all", rev.status === 200 && rev.json.data.revoked === 2 && (await status(e1.sessionId)).json.data.active === false && (await status(e2.sessionId)).json.data.active === false);
  check("an unknown user is a 404", (await call("POST", "/internal/users/nobody@example.org/revoke", AUTH)).status === 404);

  // ---- the engines' read-only credential
  const roster = await call("GET", "/engine/users/root@example.org", ENGINE);
  check("an engine reads who is on a roster", roster.status === 200 && roster.json.data.superAdmin === true && roster.json.data.memberships[0].tenantKey === "dga" && (await call("GET", "/engine/users/nobody@example.org", ENGINE)).status === 404);
  const writes = await Promise.all(["POST", "PUT", "DELETE", "PATCH"].map((m) => call(m, "/engine/users/root@example.org", ENGINE, {})));
  check("but writes nothing, whatever it sends", writes.every((r) => r.status === 405) && (await call("GET", "/admin/users/root@example.org", ENGINE)).status === 401 && (await call("GET", "/internal/audit", ENGINE)).status === 401);
  check("and only it opens /engine", (await Promise.all([ADMIN, SERVICE, AUTH, null].map((t) => call("GET", "/engine/users/root@example.org", t)))).every((r) => r.status === 401));
  const cat = await call("GET", "/engine/roles", ENGINE);
  check("an engine reads the role catalogue: four base roles, only admin manages", cat.status === 200 && Object.keys(cat.json.data.roles).join() === "admin,editor,author,viewer" && cat.json.data.roles.admin.includes("manage_people") && !cat.json.data.roles.editor.includes("manage_people") && cat.json.data.roles.viewer.join() === "read" && cat.json.data.management.length === 3);
  await call("POST", "/internal/records/custom-role", SERVICE, { data: { tenantKey: "dga", roleKey: "reviewer", name: "Reviewer", permissions: { "api::faq.faq": { view: true } } } });
  await call("POST", "/internal/records/custom-role", SERVICE, { data: { tenantKey: "pea", roleKey: "other", name: "Other", permissions: {} } });
  const crs = await call("GET", "/engine/tenants/dga/custom-roles", ENGINE);
  check("an engine reads a workspace's custom roles, and only that workspace's", crs.status === 200 && crs.json.data.length === 1 && crs.json.data[0].roleKey === "reviewer" && crs.json.data[0].permissions["api::faq.faq"].view === true);
  check("a bad workspace key is a 404, and the custom roles need the engine credential", (await call("GET", "/engine/tenants/BAD/custom-roles", ENGINE)).status === 404 && (await call("GET", "/engine/tenants/dga/custom-roles", SERVICE)).status === 401);

  // ---- rotating the signing key (A -> B, then A retired); refresh tokens are not signed, so they outlive both
  const rot = (await signIn({ issuer: PLATFORM, subject: "sub-root", email: "root@example.org", tenantKey: "orst" })).json.data;
  const kidA = kidOf(rot.accessToken);
  await down();
  await up([], { WEBX_CONTROL_SIGNING_KEY: KEY_B, WEBX_CONTROL_SIGNING_KEY_PREVIOUS: KEY_A });
  const both = (await (await fetch(`${BASE}/.well-known/jwks.json`)).json()).keys;
  check("during the rotation the key set has the new key first and the old one", both.length === 2 && both[1].kid === kidA && both[0].kid !== kidA);
  check("a token made before it still verifies", (await engineVerifies(rot.accessToken, "webx-studio")) !== null && (await me(rot.accessToken)).status === 200);
  const rr = await refresh(rot.refreshToken);
  check("a refresh now signs with the new key", rr.status === 200 && kidOf(rr.json.data.accessToken) === both[0].kid && (await engineVerifies(rr.json.data.accessToken, "webx-studio")) !== null);
  await down();
  await up([], { WEBX_CONTROL_SIGNING_KEY: KEY_B, WEBX_CONTROL_SIGNING_KEY_PREVIOUS: "" });
  check("once the old key is dropped its tokens are refused, by the service and by an engine", (await engineVerifies(rot.accessToken, "webx-studio")) === null && (await me(rot.accessToken)).status === 401);
  const survive = await refresh(rr.json.data.refreshToken);
  check("and the session carries on: the refresh token is not a signed token", survive.status === 200 && (await engineVerifies(survive.json.data.accessToken, "webx-studio")) !== null);

  // ---- step 3: without WEBX_CONTROL_SECRET_KEY no client secret is stored or read, and nothing else changes
  await down();
  await up([], { WEBX_CONTROL_SIGNING_KEY: KEY_B, WEBX_CONTROL_SECRET_KEY: "" });
  check("without the key the secret cannot be read (503) or set (400)", (await call("GET", "/internal/tenants/nsm/identity", AUTH)).status === 503 && (await call("PUT", "/admin/tenants/nsm/identity", ADMIN, { mode: "both", issuer: DGA, clientId: "nsm-studio", clientSecret: "x" })).status === 400);
  check("and sessions go on", (await refresh(survive.json.data.refreshToken)).status === 200);
  await down();
  await up([], { WEBX_CONTROL_SIGNING_KEY: KEY_B, WEBX_CONTROL_SECRET_KEY: seed() });
  check("under another key it does not open: 503, not a wrong secret", (await call("GET", "/internal/tenants/nsm/identity", AUTH)).status === 503);
} catch (e) {
  console.error(e);
  failures++;
} finally {
  if (server) { try { await down(); } catch {} }
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : "\nwebx-control sessions: all checks passed");
process.exit(failures ? 1 : 0);
