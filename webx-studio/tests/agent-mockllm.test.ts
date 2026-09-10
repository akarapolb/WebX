// The mock LLM server over real HTTP, called through lib/llm.ts's chat():
// checks that the request webx-studio sends and the reply it parses match
// the OpenAI-compatible shape, and that protocol violations are reported.
// Kept apart from the tool tests: lib/llm.ts reads LITELLM_URL once, when it
// is first imported, so nothing in this file may import it statically.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

import { startRun } from "../lib/agent/engine/checkpoint";
import { limitsFor } from "../lib/agent/engine/limits";
import { runSlice } from "../lib/agent/engine/loop";
import { fakeClock } from "./harness/fakeClock";
import { fakeTools } from "./harness/fakeTools";

test("the mock LLM server plays a scenario to lib/llm.ts and reports protocol violations", async (t) => {
  const child = spawn(process.execPath, ["--import", "tsx", path.join("tests", "harness", "mockLlmServer.ts")], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, MOCK_LITELLM_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    child.kill();
  });

  const port = await new Promise<number>((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`mock LLM server did not start: ${stderr}`)), 30_000);
    child.stderr!.on("data", (chunk) => (stderr += chunk));
    child.stdout!.on("data", (chunk) => {
      const m = /listening on :(\d+)/.exec(String(chunk));
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`mock LLM server exited with code ${code}: ${stderr}`));
    });
  });
  const base = `http://127.0.0.1:${port}`;

  const selected = await fetch(base + "/__mock/scenario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "write-draft-field", vars: { uid: "api::article.article", id: "a1", field: "title", value: "New title" } }),
  });
  assert.equal(selected.status, 200);

  process.env.LITELLM_URL = base;
  const { chat } = await import("../lib/llm");
  const tools = fakeTools({
    write_draft_fields: { write: true, run: (a) => ({ ok: true, summary: "Wrote 1 field(s) as a draft", data: { uid: a.uid, id: a.id } }) },
  });
  const r = await runSlice(
    startRun({ runId: "run-1", threadId: "thread-1", mode: "docked", lang: "en", ref: { kind: "none" }, model: "webx-kimi", message: "Retitle it" }),
    { chat, tools: tools.tools, clock: fakeClock(), emit: () => {}, systemPrompt: () => "You are the WebX test agent.", strictProtocol: true },
    limitsFor("docked"),
  );
  assert.equal(r.stop, "text");
  assert.equal(r.finalText, "Done — updated the field as requested.");
  assert.deepEqual(tools.calls.map((c) => c.args), [{ uid: "api::article.article", id: "a1", fields: { title: "New title" } }]);

  const bad = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "webx-kimi", messages: [{ role: "system", content: "sys" }, { role: "tool", tool_call_id: "x", content: "{}" }] }),
  });
  assert.equal(bad.status, 400);

  const report = await (await fetch(base + "/__mock/report")).json();
  assert.equal(report.requests, 3);
  assert.equal(report.remaining, 0);
  assert.deepEqual(report.failures, []);
  assert.equal(report.violations.length, 1);
  assert.ok(report.violations[0].violations.some((v: any) => v.code === "orphan_tool_message"));
});
