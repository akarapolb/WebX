#!/usr/bin/env node
// C5, the visitors' assistant (decision D12): the real webx-control binary, over HTTP, with a fake content engine (the Strapi-style
// read API a tenant's published pages, services, FAQs, articles and datasets come from) and a fake LiteLLM (an OpenAI-compatible
// /chat/completions endpoint), so no real engine, model, key or account is involved.
//
//   node tools/assist-test.mjs [--port 1410]
//
// Needs the release build.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg("port", "1410");
const BASE = `http://localhost:${PORT}`;
const ADMIN = "assist-admin-token";
const exe = join(root, "target", "release", process.platform === "win32" ? "webx-control.exe" : "webx-control");
if (!existsSync(exe)) throw new Error(`no binary at ${exe}: cargo build --release first`);

let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); if (!ok) failures++; };

// ---- a fake content engine
const engineRequests = [];
const content = {
  pages: [
    { documentId: "p1", slug: "home-blocks", title: "Home", blocks: [{ __component: "block.news-panel", title: "News" }, { __component: "block.hero", title: "Welcome to the hub", intro: "Open data for everyone, with the UN index." }] },
    { documentId: "p2", slug: "knowledge", title: "Knowledge", blocks: [{ __component: "block.faq" }, { __component: "block.tabs", items: [{ title: "Law A", body: "<p>The first law explains data sharing between agencies.</p>" }] }] },
  ],
  services: [{ documentId: "s1", title: "Register", description: "<p>Register your business online.</p>", url: "/register", slug: "register" }, { documentId: "s2", title: "Pay", description: "Pay fees.", slug: "pay" }],
  faqs: [{ documentId: "f1", question: "What is the EGDI?", answer: "<p>The UN E-Government Development Index measures online services, telecom infrastructure and human capital.</p>" }],
  articles: [{ documentId: "a1", title: "New dataset", excerpt: "We published a dataset of annual budgets.", body: "" }],
  datasets: [],
};
const engine = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  engineRequests.push(u.pathname + u.search);
  const name = u.pathname.replace(/^\/api\//, "");
  if (!(name in content)) { res.writeHead(404, { "content-type": "application/json" }); return res.end("{}"); }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ data: content[name] }));
});
await new Promise((ok) => engine.listen(0, "127.0.0.1", ok));
const ENGINE = `http://127.0.0.1:${engine.address().port}`;

// ---- a fake LiteLLM
const llmRequests = [];
let reply = () => ({ content: "" });
const llm = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    llmRequests.push({ url: req.url, auth: req.headers.authorization, body });
    const r = reply(body);
    setTimeout(() => { res.writeHead(r.status || 200, { "content-type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: r.content ?? "" } }] })); }, r.delayMs || 0);
  });
});
await new Promise((ok) => llm.listen(0, "127.0.0.1", ok));
const LLM = `http://127.0.0.1:${llm.address().port}`;

const dir = mkdtempSync(join(tmpdir(), "webx-assist-"));
const db = join(dir, "control.db");
const call = async (method, path, { body, headers } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(headers || {}) }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j, headers: Object.fromEntries(r.headers) };
};
let server;
async function up(env = {}, args = []) {
  server = spawn(exe, ["--port", PORT, "--db", db, ...args], { env: { ...process.env, WEBX_CONTROL_ADMIN_TOKEN: ADMIN, WEBX_ENGINE_URL: ENGINE, LITELLM_URL: "", ...env }, stdio: ["ignore", "ignore", "inherit"] });
  server.done = new Promise((ok) => server.on("exit", ok));
  for (let n = 0; ; n++) {
    try { if ((await fetch(`${BASE}/_health`)).ok) return; } catch {}
    if (n > 100) throw new Error("webx-control did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
}
const down = async () => { server.kill("SIGTERM"); await server.done; };
let n = 0;
const ip = () => `10.70.${Math.floor(++n / 250)}.${n % 250}`;
const ask = (q, { tenant = "pea", locale = "th", address = ip() } = {}) => call("POST", `/api/assist/ask?tenant=${tenant}`, { body: { q, locale }, headers: { "x-forwarded-for": address } });
const post = (path, body, tenant = "pea", address = ip()) => call("POST", `${path}?tenant=${tenant}`, { body, headers: { "x-forwarded-for": address } });

try {
  // ---- without a model: quotes the best passage, and says so
  await up();
  for (const key of ["dga", "pea"]) await call("PUT", `/admin/tenants/${key}`, { headers: { authorization: `Bearer ${ADMIN}` }, body: { engine: "strapi", publicTemplate: "gov-portal" } });
  check("status says answers are quoted, not generated", (await call("GET", "/api/assist/status")).json.llm === false);
  const a1 = await ask("what is the EGDI", { locale: "en" });
  check("without a model the answer quotes the best passage, with its sources", a1.status === 200 && a1.json.mode === "extractive" && a1.json.answer.startsWith("The UN E-Government Development Index") && a1.json.sources[0].title === "What is the EGDI?" && a1.json.sources[0].n === 1 && a1.json.cited[0] === 1, JSON.stringify(a1.json));
  check("each source says where on the site it is: an FAQ is on the page with the FAQ block, in English under /en/<tenant>", a1.json.sources[0].url === "/en/pea/knowledge", JSON.stringify(a1.json.sources));
  check("the engine was asked for this workspace and language, published content, a page of at most 100", engineRequests.some((u) => u.startsWith("/api/faqs?") && u.includes("tenant=pea") && u.includes("locale=en") && u.includes("pagination[pageSize]=100")) && engineRequests.some((u) => u.includes("/api/pages?populate[blocks][populate]=*")), engineRequests.join("\n"));
  const a2 = await ask("law about data sharing between agencies", { locale: "th" });
  check("a tab of a page is a passage of its own, linked to its page", a2.json.mode === "extractive" && a2.json.sources[0].title === "Law A" && a2.json.sources[0].url === "/pea/knowledge", JSON.stringify(a2.json));
  const none = await ask("zzzz qqqq xxxx");
  check("nothing relevant: no answer and no sources", none.status === 200 && none.json.answer === null && none.json.mode === "none" && none.json.sources.length === 0 && none.json.cited.length === 0, JSON.stringify(none.json));
  check("an empty question: 400 q required", (await ask("   ")).status === 400 && (await ask("")).json.error === "q required");
  const before = engineRequests.length;
  await ask("what is the EGDI", { locale: "en" });
  await ask("what is the EGDI", { locale: "en" });
  check("a run of questions does not read the engine each time (the corpus is kept for a minute)", engineRequests.length === before, `${engineRequests.length - before} more engine requests`);
  const asked = engineRequests.length;
  const unknown = await ask("what is the EGDI", { tenant: "nobody", locale: "en" });
  check("an unregistered workspace is refused: 404, with no engine read for it or any other (decision D9)", unknown.status === 404 && engineRequests.length === asked, JSON.stringify(unknown.json));
  for (const path of ["/api/assist/simplify", "/api/assist/translate", "/api/assist/find"]) {
    const r = await post(path, { text: "x", q: "x" });
    check(`${path} without a model: 503 AI not configured`, r.status === 503 && r.json.error === "AI not configured", JSON.stringify(r));
  }
  check("a browser on the public site may call it: preflight answered", (await call("OPTIONS", "/api/assist/ask?tenant=pea", { headers: { origin: "http://localhost:3100", "access-control-request-method": "POST" } })).headers["access-control-allow-origin"] === "http://localhost:3100");
  let limited = 0;
  const same = ip();
  for (let k = 0; k < 25; k++) if ((await ask("what is the EGDI", { locale: "en", address: same })).status === 429) limited++;
  check("an address that asks 25 questions in a minute is rate-limited after 20: 429", limited === 5, `limited ${limited}`);
  await down();

  // ---- an engine that does not answer: no answer, not an error
  await up({ WEBX_ENGINE_URL: "http://127.0.0.1:1" });
  const dead = await ask("what is the EGDI", { locale: "en" });
  check("an engine that is down gives no answer rather than an error", dead.status === 200 && dead.json.mode === "none" && dead.json.answer === null, JSON.stringify(dead));
  await down();

  // ---- with a model
  await up({ LITELLM_URL: LLM + "/", LITELLM_KEY: "sk-test", LITELLM_ASK_MODEL: "webx-thai", LITELLM_MODEL: "webx-general", LITELLM_TIMEOUT_MS: "400" });
  check("status says answers are generated", (await call("GET", "/api/assist/status")).json.llm === true);
  reply = () => ({ content: "The EGDI measures online services [1] and capital [1] [9]." });
  const l1 = await ask("what is the EGDI", { locale: "en" });
  const sent = llmRequests.at(-1);
  check("with a model: its answer, only valid citations kept, sources always returned", l1.json.mode === "llm" && l1.json.answer === "The EGDI measures online services [1] and capital [1]." && l1.json.cited.join() === "1" && l1.json.sources.length >= 1, JSON.stringify(l1.json));
  check("the model gets an OpenAI-shaped request: the ask model, the key, ONLY the numbered sources, then the sources and the question", sent.url === "/chat/completions" && sent.auth === "Bearer sk-test" && sent.body.model === "webx-thai" && sent.body.messages[0].role === "system" && /ONLY the numbered sources/.test(sent.body.messages[0].content) && /^Sources:\n\[1\] What is the EGDI\?\n/.test(sent.body.messages[1].content) && sent.body.messages[1].content.endsWith("Question: what is the EGDI") && sent.body.max_tokens === 600, JSON.stringify(sent.body).slice(0, 300));
  reply = () => ({ content: "คำตอบ [1]" });
  await ask("what is the EGDI", { locale: "th" });
  check("a Thai question gets the Thai system prompt", /ตอบเป็นภาษาไทย/.test(llmRequests.at(-1).body.messages[0].content));
  for (const [name, r] of [["an error", { status: 500 }], ["an empty reply", { content: "   " }], ["a timeout", { content: "late [1]", delayMs: 1500 }]]) {
    reply = () => r;
    const f = await ask("what is the EGDI", { locale: "en" });
    check(`a model failure (${name}) falls back to the quote, with sources`, f.json.mode === "extractive" && f.json.answer && f.json.sources.length >= 1, JSON.stringify(f.json));
  }
  const calls = llmRequests.length;
  reply = () => ({ content: "never asked" });
  await ask("zzzz qqqq xxxx");
  check("nothing relevant: the model is not called", llmRequests.length === calls);

  reply = () => ({ content: "ข้อความที่เข้าใจง่าย" });
  const s = await post("/api/assist/simplify", { text: "ผู้ยื่นคำขอต้องดำเนินการภายในสามสิบวัน" });
  const sreq = llmRequests.at(-1);
  check("simplify: the text in plain words, from the general model", s.status === 200 && s.json.text === "ข้อความที่เข้าใจง่าย" && sreq.body.model === "webx-general" && /อธิบายเนื้อหาภาษาราชการไทย/.test(sreq.body.messages[0].content) && sreq.body.messages[1].content === "อธิบายข้อความต่อไปนี้ให้เข้าใจง่าย:\n\nผู้ยื่นคำขอต้องดำเนินการภายในสามสิบวัน", JSON.stringify(sreq.body).slice(0, 300));
  reply = () => ({ content: "Hello" });
  const t = await post("/api/assist/translate", { text: "สวัสดี", target: "en" });
  check("translate: the text in the language asked for", t.json.text === "Hello" && /professional translator/.test(llmRequests.at(-1).body.messages[0].content) && llmRequests.at(-1).body.messages[1].content === "Translate to en:\n\nสวัสดี" && llmRequests.at(-1).body.max_tokens === 1200);
  await post("/api/assist/translate", { text: "สวัสดี" });
  check("with no target it is English", llmRequests.at(-1).body.messages[1].content.startsWith("Translate to en:"));
  check("no text: 400 text required", (await post("/api/assist/simplify", { text: "  " })).json.error === "text required" && (await post("/api/assist/translate", {})).status === 400);
  reply = () => ({ status: 500 });
  const broken = await post("/api/assist/simplify", { text: "x" });
  check("a model that fails: 502 AI error", broken.status === 502 && broken.json.error === "AI error", JSON.stringify(broken));

  reply = () => ({ content: "ใช้บริการ Register" });
  const f = await post("/api/assist/find", { q: "ลงทะเบียนธุรกิจ" });
  const freq = llmRequests.at(-1);
  check("find: the model answers from the workspace's services and FAQs, and the services come back with their slugs", f.status === 200 && f.json.answer === "ใช้บริการ Register" && f.json.services.length === 2 && f.json.services[0].title === "Register" && f.json.services[0].slug === "register" && /\[S0\] Register: Register your business online\./.test(freq.body.messages[1].content) && /\[Q0\] What is the EGDI\? — The UN E-Government/.test(freq.body.messages[1].content) && /คำถามประชาชน: ลงทะเบียนธุรกิจ$/.test(freq.body.messages[1].content) && /ผู้ช่วยแนะนำบริการภาครัฐ/.test(freq.body.messages[0].content), JSON.stringify(f.json) + freq.body.messages[1].content.slice(0, 200));
  check("find reads the services in Thai", engineRequests.some((u) => u.startsWith("/api/services?pagination[pageSize]=60") && u.includes("locale=th") && u.includes("tenant=pea")));
  check("find with no question: 400 q required", (await post("/api/assist/find", {})).json.error === "q required");

  // the three model calls and the answers share one allowance of 20 a minute per address
  reply = () => ({ content: "ok" });
  const shared = ip();
  let over = 0;
  for (let k = 0; k < 24; k++) if ((await post("/api/assist/simplify", { text: "x" }, "pea", shared)).status === 429) over++;
  check("the model calls are rate-limited after 20 a minute per address: 429 Too many requests", over === 4, `limited ${over}`);
} catch (e) {
  console.error(e);
  failures++;
} finally {
  if (server) { try { await down(); } catch {} }
  engine.close();
  llm.close();
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : "\nwebx-control assistant: all checks passed");
process.exit(failures ? 1 : 0);
