#!/usr/bin/env node
// Minimal OpenAI-chat-completions-compatible HTTP server standing in for a
// real LiteLLM proxy — used only by tests/agent.spec.ts, which needs a
// genuine tool-calling round trip through lib/llm.ts's chat() (POST
// {model,messages,tools,tool_choice} -> {choices:[{message:{content,
// tool_calls}}], usage}) without depending on a real Anthropic/OpenAI key
// or any live model. Never calls a real model — fully scripted and
// deterministic, matching this repo's own "never a live external call in a
// test" convention (same reasoning as the interactive-product-demo skill's
// scripted AI set pieces).
//
// Turn 1 (no "tool" role message yet in the incoming history): always
// returns exactly one tool_call — write_draft_fields against the entry
// named by MOCK_TARGET_UID/MOCK_TARGET_ID, setting MOCK_TARGET_FIELD to
// MOCK_TARGET_VALUE. Turn 2 (a "tool" role message is present, meaning
// runtime.ts already fed the tool's result back in): always ends the run
// with a short plain-text reply, no further tool calls, so a test can
// assert the run reaches `done` deterministically in exactly 2 turns.
//
// Usage: MOCK_TARGET_UID=... MOCK_TARGET_ID=... node e2e/mock-litellm.mjs
import http from "node:http";

const PORT = Number(process.env.MOCK_LITELLM_PORT || 4010);
const TARGET_UID = process.env.MOCK_TARGET_UID || "";
const TARGET_ID = process.env.MOCK_TARGET_ID || "";
const TARGET_FIELD = process.env.MOCK_TARGET_FIELD || "title";
const TARGET_VALUE = process.env.MOCK_TARGET_VALUE || "Agent e2e test title";

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || !req.url || !req.url.startsWith("/chat/completions")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found — this mock only implements POST /chat/completions" }));
    return;
  }
  const raw = await readBody(req);
  let body = {};
  try { body = JSON.parse(raw); } catch { /* malformed — fall through, treated as turn 1 below */ }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const hasToolResult = messages.some((m) => m && m.role === "tool");

  res.writeHead(200, { "Content-Type": "application/json" });
  if (!hasToolResult) {
    res.end(JSON.stringify({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: "call_mock_1",
            type: "function",
            function: {
              name: "write_draft_fields",
              arguments: JSON.stringify({ uid: TARGET_UID, id: TARGET_ID, fields: { [TARGET_FIELD]: TARGET_VALUE } }),
            },
          }],
        },
      }],
      usage: { prompt_tokens: 120, completion_tokens: 40 },
    }));
  } else {
    res.end(JSON.stringify({
      choices: [{ message: { content: "Done — updated the field as requested." } }],
      usage: { prompt_tokens: 150, completion_tokens: 20 },
    }));
  }
});

server.listen(PORT, () => {
  console.log(`mock-litellm listening on :${PORT} (target ${TARGET_UID}#${TARGET_ID})`);
});
