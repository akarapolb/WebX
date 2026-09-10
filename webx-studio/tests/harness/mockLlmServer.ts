// A scenario-driven stand-in for LiteLLM's /chat/completions, for running the
// real webx-studio server against a scripted model (e2e/tests/agent.spec.ts).
// Point webx-studio's LITELLM_URL at it.
//
//   node --import tsx tests/harness/mockLlmServer.ts
//
// Environment: MOCK_LITELLM_PORT (default 4010; 0 picks a free port), and
// optionally MOCK_SCENARIO plus MOCK_VARS (JSON) to select a scenario at start.
//
//   POST /chat/completions   the scripted reply, or 400 if the request breaks the protocol
//   POST /__mock/scenario    {"name": "...", "vars": {...}} selects a scenario
//   GET  /__mock/report      requests, remaining steps, protocol violations, failures
import http from "node:http";
import type { AddressInfo } from "node:net";
import { loadScenario, ScenarioRun } from "./scenario";

let run: ScenarioRun | null = null;

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJson(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/__mock/scenario") {
      const body = await readJson(req);
      run = new ScenarioRun(loadScenario(String(body.name)), body.vars || {});
      return send(res, 200, { ok: true, scenario: run.scenario.name, steps: run.scenario.steps.length });
    }
    if (req.method === "GET" && req.url === "/__mock/report") {
      if (!run) return send(res, 200, { scenario: null });
      return send(res, 200, { scenario: run.scenario.name, requests: run.requests, remaining: run.remaining, violations: run.violations, failures: run.failures });
    }
    if (req.method === "POST" && req.url?.startsWith("/chat/completions")) {
      if (!run) return send(res, 503, { error: { message: "No scenario selected. POST /__mock/scenario first." } });
      const body = await readJson(req);
      const out = run.respond(body);
      if (!out.ok) return send(res, out.status, { error: { message: out.error } });
      return send(res, 200, {
        id: `mock-${run.requests}`,
        object: "chat.completion",
        model: body.model || "mock",
        choices: [{ index: 0, finish_reason: out.reply.finishReason, message: { role: "assistant", ...out.reply.message } }],
        usage: out.reply.usage,
      });
    }
    send(res, 404, { error: { message: "Not found" } });
  } catch (e: any) {
    send(res, 500, { error: { message: String(e?.message || e) } });
  }
});

if (process.env.MOCK_SCENARIO) run = new ScenarioRun(loadScenario(process.env.MOCK_SCENARIO), JSON.parse(process.env.MOCK_VARS || "{}"));

server.listen(Number(process.env.MOCK_LITELLM_PORT ?? 4010), () => {
  const { port } = server.address() as AddressInfo;
  console.log(`mock-llm listening on :${port}${run ? ` (scenario ${run.scenario.name})` : ""}`);
});
