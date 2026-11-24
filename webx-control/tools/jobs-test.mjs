#!/usr/bin/env node
// C5, the job queue: the real webx-control binary, over HTTP. The lease rules the
// unit tests check one by one, here as a worker sees them, including two workers
// claiming at the same moment and a restart in the middle of a job.
//
//   node tools/jobs-test.mjs [--port 1405]
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg("port", "1405");
const BASE = `http://localhost:${PORT}`;
const SERVICE = "jobs-service-token";
const exe = join(root, "target", "release", process.platform === "win32" ? "webx-control.exe" : "webx-control");
if (!existsSync(exe)) throw new Error(`no binary at ${exe}: cargo build --release first`);

const dir = mkdtempSync(join(tmpdir(), "webx-jobs-"));
const db = join(dir, "control.db");
let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); if (!ok) failures++; };
const call = async (method, path, body, token = SERVICE) => {
  const r = await fetch(BASE + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j };
};
let server;
async function up() {
  server = spawn(exe, ["--port", PORT, "--db", db], { env: { ...process.env, WEBX_CONTROL_SERVICE_TOKEN: SERVICE }, stdio: ["ignore", "ignore", "inherit"] });
  server.done = new Promise((ok) => server.on("exit", ok));
  for (let n = 0; ; n++) {
    try { if ((await fetch(`${BASE}/_health`)).ok) return; } catch {}
    if (n > 100) throw new Error("webx-control did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
}
const down = async () => { server.kill("SIGTERM"); await server.done; };
const make = (owner, extra = {}) => call("POST", "/internal/jobs", { data: { tenantKey: "dga", ownerEmail: owner, title: "T", goal: "do it", requiredLevel: "read", engine: "strapi", ownerUserId: "7", ...extra } });

try {
  await up();
  check("no token: 401", (await call("GET", "/internal/jobs", null, "")).status === 401);
  check("a job needs a tenant and an owner: 400", (await call("POST", "/internal/jobs", { data: { goal: "x" } })).status === 400);
  const a = await make("ann@example.org", { params: { plan: ["one", "two"] } });
  check("create: queued, with its fields back", a.status === 200 && a.json.data.runState === "queued" && a.json.data.goal === "do it" && a.json.data.params.plan.length === 2 && a.json.data.documentId.length === 24);
  const id = a.json.data.documentId;
  check("read and list it", (await call("GET", `/internal/jobs/${id}`)).json.data.ownerEmail === "ann@example.org" && (await call("GET", "/internal/jobs?tenantKey=dga&runState=queued")).json.meta.pagination.total === 1);
  check("an unknown list parameter is refused: 400", (await call("GET", "/internal/jobs?bogus=1")).status === 400);

  // two workers claim at the same moment: exactly one gets the job
  const [c1, c2] = await Promise.all([call("POST", "/internal/jobs/claim", { workerId: "w1", limit: 1 }), call("POST", "/internal/jobs/claim", { workerId: "w2", limit: 1 })]);
  const got = [c1, c2].filter((c) => c.json.jobs.length === 1);
  check("two workers claiming at once: exactly one wins the job", got.length === 1, JSON.stringify([c1.json, c2.json]));
  const job = got[0].json.jobs[0];
  const tok = job.leaseToken;
  check("the claim gives a lease token and the job's whole identity", tok?.length === 32 && job.runState === "running" && job.ownerUserId === "7" && job.engine === "strapi");

  check("heartbeat with the token", (await call("POST", "/internal/jobs/heartbeat", { documentId: id, leaseToken: tok })).json.ok === true);
  check("heartbeat with a wrong token: ok false", (await call("POST", "/internal/jobs/heartbeat", { documentId: id, leaseToken: "nope" })).json.ok === false);
  check("a request without the token is refused: 400", (await call("POST", "/internal/jobs/checkpoint", { documentId: id })).status === 400);
  const cp = await call("POST", "/internal/jobs/checkpoint", { documentId: id, leaseToken: tok, checkpoint: { v: 1, turn: 2 }, checkpointSeq: 2, eventSeq: 1, progress: { turns: 2 }, tokensUsed: 55, events: [{ seq: 1, type: "plan" }] });
  check("checkpoint under the lease", cp.json.ok === true);
  const mid = (await call("GET", `/internal/jobs/${id}`)).json.data;
  check("the checkpoint, progress and events are stored", mid.checkpoint.turn === 2 && mid.progress.turns === 2 && mid.tokensUsed === 55 && mid.events.length === 1 && mid.checkpointSeq === 2);

  // the user asks to pause while it runs: the worker hears it at its next heartbeat
  const ask = await call("POST", "/internal/jobs/control", { documentId: id, action: "pause" });
  check("a pause request on a running job is a flag", ask.json.ok === true && ask.json.job.runState === "running" && ask.json.job.pauseRequestedAt);
  const hb = await call("POST", "/internal/jobs/heartbeat", { documentId: id, leaseToken: tok });
  check("and the heartbeat reports it", hb.json.pauseRequested === true && hb.json.cancelRequested === false);

  // the service restarts in the middle: the lease and the checkpoint survive
  await down();
  await up();
  check("the lease survives a restart", (await call("POST", "/internal/jobs/heartbeat", { documentId: id, leaseToken: tok })).json.ok === true);
  check("and so does the checkpoint", (await call("GET", `/internal/jobs/${id}`)).json.data.checkpoint.turn === 2);

  check("finish paused", (await call("POST", "/internal/jobs/finish", { documentId: id, leaseToken: tok, runState: "paused", stateReason: "user", eventSeq: 1 })).json.ok === true);
  check("a second finish with the same token: ok false (the lease is gone)", (await call("POST", "/internal/jobs/finish", { documentId: id, leaseToken: tok, runState: "done", eventSeq: 1 })).json.ok === false);
  const resumed = await call("POST", "/internal/jobs/control", { documentId: id, action: "resume" });
  check("resume puts it back in the queue", resumed.json.ok === true && resumed.json.job.runState === "queued");
  const again = (await call("POST", "/internal/jobs/claim", { workerId: "w1", limit: 1 })).json.jobs[0];
  check("it is claimed again with the checkpoint to resume from", again && again.checkpoint.turn === 2 && again.leaseToken !== tok);
  check("it ends done with a result", (await call("POST", "/internal/jobs/finish", { documentId: id, leaseToken: again.leaseToken, runState: "done", outcome: "completed", result: { summary: "ok" }, eventSeq: 1 })).json.ok === true);
  const end = (await call("GET", `/internal/jobs/${id}`)).json.data;
  check("finished job: state, outcome, result and end time", end.runState === "done" && end.outcome === "completed" && end.result.summary === "ok" && end.finishedAt && end.leaseToken === null);

  // one running job per owner, and a per-workspace cap given with the claim
  await make("bob@example.org"); await make("bob@example.org"); await make("cy@example.org");
  const batch = (await call("POST", "/internal/jobs/claim", { workerId: "w", limit: 10, defaultCap: 5 })).json.jobs;
  check("one running job per owner: Bob's second job waits", batch.length === 2 && batch.filter((j) => j.ownerEmail === "bob@example.org").length === 1);
  check("an unknown action is refused: 400", (await call("POST", "/internal/jobs/control", { documentId: id, action: "explode" })).status === 400);
  check("control on a job that does not exist: 404", (await call("POST", "/internal/jobs/control", { documentId: "nope", action: "cancel" })).status === 404);

  // schedules: due, advance (compare-and-set), the job it queues, disable
  const past = new Date(Date.now() - 60000).toISOString();
  const sc = (await call("POST", "/internal/schedules", { data: { tenantKey: "dga", ownerEmail: "sam@example.org", name: "Weekly", template: "audit", nextRunAt: past, recurrence: { freq: "daily" } } })).json.data;
  check("a schedule is saved enabled with runSeq 0", sc.enabled === true && sc.runSeq === 0 && sc.recurrence.freq === "daily");
  check("it is due", (await call("GET", "/internal/schedules/due")).json.schedules.some((x) => x.documentId === sc.documentId));
  const adv = { documentId: sc.documentId, expectedSeq: 0, nextRunAt: new Date(Date.now() + 86400000).toISOString(), job: { idempotencyKey: "occ-1", tenantKey: "dga", ownerEmail: "sam@example.org", ownerUserId: "9", title: "Weekly", requiredLevel: "read", goal: "audit" } };
  const [r1, r2] = await Promise.all([call("POST", "/internal/schedules/advance", adv), call("POST", "/internal/schedules/advance", adv)]);
  check("two ticks racing over one occurrence: exactly one advances it", [r1, r2].filter((r) => r.json.ok === true).length === 1);
  const made1 = [r1, r2].find((r) => r.json.ok === true).json;
  const qj = (await call("GET", `/internal/jobs/${made1.jobId}`)).json.data;
  check("the occurrence's job is queued with the schedule id", qj.runState === "queued" && qj.scheduleId === sc.documentId);
  check("the schedule is no longer due and remembers its job", !(await call("GET", "/internal/schedules/due")).json.schedules.some((x) => x.documentId === sc.documentId) && (await call("GET", `/internal/schedules/${sc.documentId}`)).json.data.lastJobId === made1.jobId);
  check("disable at a stale seq does nothing", (await call("POST", "/internal/schedules/disable", { documentId: sc.documentId, expectedSeq: 0, reason: "user" })).json.ok === false);
  check("disable at the current seq turns it off with the reason", (await call("POST", "/internal/schedules/disable", { documentId: sc.documentId, expectedSeq: 1, reason: "user" })).json.ok === true && (await call("GET", `/internal/schedules/${sc.documentId}`)).json.data.disabledReason === "user");
  check("an advance without the required fields: 400", (await call("POST", "/internal/schedules/advance", { documentId: sc.documentId })).status === 400);
  // the list query Studio's adapter sends: filter=field:op:value and sort=createdAt:DESC
  const fq = (p) => call("GET", `/internal/${p}`);
  const f1 = await fq(`jobs?filter=${encodeURIComponent("tenantKey:eq:dga")}&filter=${encodeURIComponent("createdAt:gte:2020-01-01T00:00:00.000Z")}&sort=createdAt:DESC&pageSize=100`);
  check("jobs list takes Studio's filter and sort form", f1.status === 200 && f1.json.meta.pagination.total >= 1);
  check("a creation-time bound in the future matches none", (await fq(`jobs?filter=${encodeURIComponent("createdAt:gte:2999-01-01T00:00:00.000Z")}`)).json.meta.pagination.total === 0);
  check("schedules filter on enabled", (await fq(`schedules?filter=${encodeURIComponent("enabled:eq:false")}`)).json.data.every((x) => x.enabled === false) && (await fq(`schedules?filter=${encodeURIComponent("enabled:eq:true")}`)).json.meta.pagination.total === 0);
  check("a filter it does not know is refused: 400", (await fq(`jobs?filter=${encodeURIComponent("goal:contains:x")}`)).status === 400);
} catch (e) {
  console.error(e);
  failures++;
} finally {
  if (server) { try { await down(); } catch {} }
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : "\nwebx-control job queue: all checks passed");
process.exit(failures ? 1 : 0);
