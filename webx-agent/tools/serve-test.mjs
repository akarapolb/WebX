#!/usr/bin/env node
// C5, the whole path with the real binaries: webx-control's job queue, the
// webx-agent worker (`serve --once`), and a mock model and a mock Studio tool
// gateway written here. A job is queued, claimed, run in slices and finished; a
// user's cancel reaches a running job through its heartbeat; a job that runs out
// of steps goes back to the queue and another run continues it from its checkpoint.
//
//   node tools/serve-test.mjs [--port 1406]
//
// Needs the release builds of ../webx-control and this crate.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const control = resolve(here, "..", "webx-control");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg("port", "1406"));
const BASE = `http://localhost:${PORT}`;
const SERVICE = "serve-test-service-token";
const exe = (dir, name) => join(dir, "target", "release", process.platform === "win32" ? name + ".exe" : name);
for (const p of [exe(control, "webx-control"), exe(here, "webx-agent")]) if (!existsSync(p)) throw new Error(`no binary at ${p}: cargo build --release in both crates first`);

let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); if (!ok) failures++; };
const q = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: { authorization: `Bearer ${SERVICE}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a mock LiteLLM: replies come from `script`, per goal text in the prompt; `slowTool` makes a turn after the plan take a while
const modelCalls = {};
const script = {
  "Read page p1": ['{"plan":["read it","report"]}', '{"tool":"read_page","args":{"id":"p1"}}', '{"final":"Page p1 says hello."}'],
  "Long job": ['{"plan":["a","b"]}', '{"tool":"read_page","args":{"id":"p1"}}', '{"tool":"read_page","args":{"id":"p2"}}', '{"final":"Both pages read."}'],
  "Cancel me": ['{"plan":["wait"]}', '{"tool":"read_page","args":{"id":"p1"}}', '{"tool":"read_page","args":{"id":"p1"}}', '{"final":"never gets here"}'],
};
let modelDelayMs = 0;
const model = http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", async () => {
    const msg = JSON.parse(body).messages.map((m) => m.content).join("\n");
    const goal = Object.keys(script).find((g) => msg.includes(g)) || "Read page p1";
    const n = (modelCalls[goal] = (modelCalls[goal] || 0) + 1);
    if (goal === "Cancel me" && n > 1) await sleep(modelDelayMs);
    const replies = script[goal];
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: replies[Math.min(n - 1, replies.length - 1)] } }] }));
  });
});
// a mock Studio gateway: lists one read tool, runs it, and records what it was asked (with the job identity)
const gwRuns = [];
const gateway = http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    const b = body ? JSON.parse(body) : {};
    res.setHeader("content-type", "application/json");
    if (req.headers.authorization !== "Bearer gw-secret") { res.statusCode = 401; return res.end("{}"); }
    if (req.url === "/tools") return res.end(JSON.stringify({ data: [{ name: "read_page", help: "Read a page", risk: "read", args: [{ name: "id", kind: "text", help: "Page id", required: true }] }] }));
    gwRuns.push(b);
    res.end(JSON.stringify({ ok: true, text: `page ${b.args?.id} says hello` }));
  });
});
const listen = (s) => new Promise((ok) => s.listen(0, "127.0.0.1", () => ok(s.address().port)));

const dir = mkdtempSync(join(tmpdir(), "webx-serve-"));
let ctl;
const workerEnv = () => ({ ...process.env, WEBX_CONTROL_URL: BASE, WEBX_CONTROL_SERVICE_TOKEN: SERVICE, LITELLM_URL: `http://127.0.0.1:${mp}/v1`, WEBX_TOOLS_URL: `http://127.0.0.1:${gp}`, WEBX_TOOLS_SECRET: "gw-secret" });
const worker = (extra = []) => new Promise((ok) => {
  const w = spawn(exe(here, "webx-agent"), ["serve", "--once", ...extra], { env: workerEnv(), stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  w.stderr.on("data", (c) => (stderr += c));
  w.on("exit", (status) => ok({ status, stderr }));
});
const make = (goal, extra = {}) => q("POST", "/internal/jobs", { data: { tenantKey: "dga", ownerEmail: `${goal.replace(/\W/g, "").toLowerCase()}@example.org`, ownerUserId: "7", engine: "strapi", requiredLevel: "read", policySnapshot: { level: "read" }, title: goal, goal, ...extra } });

let mp, gp;
try {
  mp = await listen(model);
  gp = await listen(gateway);
  ctl = spawn(exe(control, "webx-control"), ["--port", String(PORT), "--db", join(dir, "control.db")], { env: { ...process.env, WEBX_CONTROL_SERVICE_TOKEN: SERVICE }, stdio: ["ignore", "ignore", "inherit"] });
  for (let n = 0; ; n++) { try { if ((await fetch(`${BASE}/_health`)).ok) break; } catch {} if (n > 100) throw new Error("webx-control did not start"); await sleep(100); }

  // 1. a job runs to its end
  const a = (await make("Read page p1")).data;
  const w1 = await worker();
  const done = (await q("GET", `/internal/jobs/${a.documentId}`)).data;
  check("a queued job is claimed, run through the gateway and finished", w1.status === 0 && done.runState === "done" && done.outcome === "completed" && done.result.summary === "Page p1 says hello.", w1.stderr + JSON.stringify(done));
  check("the tool ran through the gateway with the job's identity and the owner's id", gwRuns.length === 1 && gwRuns[0].job.documentId === a.documentId && gwRuns[0].job.ownerUserId === "7" && gwRuns[0].job.tenantKey === "dga" && gwRuns[0].tool === "read_page");
  check("the job's progress and end time are recorded, and the lease is released", done.progress.toolCalls === 1 && done.finishedAt && done.leaseToken === null);
  check("with nothing queued the worker exits cleanly", (await worker()).status === 0);

  // 2. a job that runs out of steps goes back to the queue and the next run continues it from the checkpoint
  gwRuns.length = 0;
  const l = (await make("Long job")).data;
  const s1 = await worker(["--max-steps", "3"]);
  const mid = (await q("GET", `/internal/jobs/${l.documentId}`)).data;
  check("a job that runs out of steps goes back to the queue with its checkpoint", s1.status === 0 && mid.runState === "queued" && typeof mid.checkpoint?.snapshot === "string" && mid.checkpointSeq > 0, s1.stderr + JSON.stringify(mid).slice(0, 300));
  const toolsAfterFirst = gwRuns.length;
  const s2 = await worker(["--max-steps", "40"]);
  const fin = (await q("GET", `/internal/jobs/${l.documentId}`)).data;
  check("the next run continues it and finishes", s2.status === 0 && fin.runState === "done" && fin.result.summary === "Both pages read.", s2.stderr + JSON.stringify(fin).slice(0, 300));
  check("each tool ran once across the two runs", gwRuns.length === 2 && toolsAfterFirst < 2, `ran ${gwRuns.length}, ${toolsAfterFirst} in the first`);

  // 3. the user cancels a running job: the heartbeat carries it to the worker, which stops and reports cancelled
  modelDelayMs = 1500;
  const c = (await make("Cancel me")).data;
  const running = worker(["--heartbeat-ms", "200"]);
  for (let n = 0; n < 50; n++) { if ((await q("GET", `/internal/jobs/${c.documentId}`)).data.runState === "running") break; await sleep(100); }
  const asked = await q("POST", "/internal/jobs/control", { documentId: c.documentId, action: "cancel" });
  check("a cancel on a running job is accepted as a request", asked.ok === true && asked.job.runState === "running");
  await running;
  const gone = (await q("GET", `/internal/jobs/${c.documentId}`)).data;
  check("the worker hears it at its next heartbeat, stops, and reports the job cancelled", gone.runState === "cancelled" && gone.stateReason === "user" && gone.leaseToken === null, JSON.stringify(gone).slice(0, 300));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  try { ctl?.kill("SIGTERM"); } catch {}
  model.close(); gateway.close();
  await sleep(200);
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : "\nwebx-agent worker: all checks passed");
process.exit(failures ? 1 : 0);
