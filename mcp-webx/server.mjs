#!/usr/bin/env node
// WebX CMS — MCP server (zero-dependency, stdio JSON-RPC).
// Lets MCP clients (Claude Code/Desktop, Cursor) operate the CMS via the
// active engine's REST API using a service credential (Strapi API token, or
// a WordPress Application Password). Safe surface: read + create/update
// DRAFTS. No publish/delete tools — least privilege is enforced by the
// credential's own permissions.
//   CMS_ENGINE=strapi|wordpress (default strapi)
//   STRAPI_URL, STRAPI_TOKEN — Strapi engine
//   WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD — WordPress engine
import { createInterface } from "node:readline";
import { createClient } from "../shared/cms-client.mjs";

const ENGINE = process.env.CMS_ENGINE === "wordpress" ? "wordpress" : "strapi";
const STRAPI = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");
const TOKEN = process.env.STRAPI_TOKEN || "";
// Content operations go through whichever engine is active; the review
// queue (submit_for_review/list_reviews) is WebX's own bookkeeping and
// always lives in Strapi, same as webx-studio's field-policy/audit-log —
// see the Phase 2 plan for why that's not per-engine data (yet).
const reviewClient = createClient({ baseUrl: STRAPI, token: TOKEN, engine: "strapi" });
const client = ENGINE === "wordpress"
  ? createClient({
      baseUrl: process.env.WORDPRESS_URL || "http://localhost:8081/wp-json",
      token: process.env.WORDPRESS_USERNAME ? process.env.WORDPRESS_USERNAME + ":" + (process.env.WORDPRESS_APP_PASSWORD || "") : "",
      engine: "wordpress",
    })
  : reviewClient;
const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
const log = (s) => process.stderr.write("[webx-mcp] " + s + "\n");

function simplify(e) {
  if (!e || typeof e !== "object") return e;
  const out = { documentId: e.documentId || e.id };
  for (const k of ["title", "name", "subject", "question", "slug", "status", "updatedAt", "excerpt", "kind"]) if (e[k] != null) out[k] = e[k];
  return out;
}

const TOOLS = [
  { name: "list_content_types", description: "List the content types you can work with (Strapi plural API IDs, e.g. articles, services).", inputSchema: { type: "object", properties: {} } },
  { name: "search_content", description: "Search/list entries of a content type. Returns lightweight summaries.", inputSchema: { type: "object", required: ["contentType"], properties: { contentType: { type: "string", description: "Plural API ID, e.g. 'articles'" }, query: { type: "string", description: "Full-text query (optional)" }, limit: { type: "integer", description: "Max results (default 10, max 50)" } } } },
  { name: "get_entry", description: "Fetch one entry in full by documentId.", inputSchema: { type: "object", required: ["contentType", "documentId"], properties: { contentType: { type: "string" }, documentId: { type: "string" } } } },
  { name: "create_entry", description: "Create a new DRAFT entry. Does not publish. data is the entry fields object.", inputSchema: { type: "object", required: ["contentType", "data"], properties: { contentType: { type: "string" }, data: { type: "object" } } } },
  { name: "update_entry", description: "Update an existing entry (stays a draft until a human publishes). data is the changed fields.", inputSchema: { type: "object", required: ["contentType", "documentId", "data"], properties: { contentType: { type: "string" }, documentId: { type: "string" }, data: { type: "object" } } } },
  { name: "submit_for_review", description: "Submit an entry into the human review/approval queue (the Reviews board). This is the ONLY way an agent's change goes live — a person approves and publishes it. Agents cannot publish or delete directly.", inputSchema: { type: "object", required: ["contentType", "documentId"], properties: { contentType: { type: "string", description: "Plural API ID, e.g. 'articles'" }, documentId: { type: "string" }, note: { type: "string", description: "Why this needs review (optional)" } } } },
  { name: "list_reviews", description: "List items in the review/approval queue (newest first). Optionally filter by stage: in_review, changes, approved, published.", inputSchema: { type: "object", properties: { stage: { type: "string" }, limit: { type: "integer" } } } },
];

// plural API ID -> content-manager UID (used so the review board can publish it)
const UID = { articles: "api::article.article", services: "api::service.service", faqs: "api::faq.faq", landings: "api::landing.landing", blogs: "api::blog.blog", events: "api::event.event", downloads: "api::download.download" };
const toUid = (c) => UID[c] || ("api::" + c.replace(/s$/, "") + "." + c.replace(/s$/, ""));

const handlers = {
  list_content_types: async () => (ENGINE === "wordpress" ? ["posts"] : ["articles", "services", "faqs", "landings", "blogs", "events", "downloads"]),
  search_content: async ({ contentType, query, limit = 10 }) => {
    const { data } = await client.list(contentType, { pageSize: Math.min(Number(limit) || 10, 50), sort: "updatedAt:desc", q: query });
    return data.map(simplify);
  },
  get_entry: async ({ contentType, documentId }) => client.get(contentType, documentId),
  create_entry: async ({ contentType, data }) => simplify(await client.create(contentType, data)),
  update_entry: async ({ contentType, documentId, data }) => simplify(await client.update(contentType, documentId, data)),
  submit_for_review: async ({ contentType, documentId, note }) => {
    const e = (await client.get(contentType, documentId)) || {};
    const title = e.title || e.name || e.subject || e.question || (contentType + " " + String(documentId).slice(0, 6));
    const created = await reviewClient.create("reviews", { documentRef: documentId, contentType: toUid(contentType), title, stage: "in_review", kind: "review", requestedBy: "MCP agent", note: note || "", history: [{ to: "in_review", by: "MCP agent", at: new Date().toISOString() }] });
    return { ok: true, stage: "in_review", title, review: simplify(created) };
  },
  list_reviews: async ({ stage, limit = 20 }) => {
    const { data } = await reviewClient.list("reviews", { pageSize: Math.min(Number(limit) || 20, 100), sort: "updatedAt:desc", filters: stage ? [{ field: "stage", op: "eq", value: stage }] : undefined });
    return data.map((r) => ({ documentId: r.documentId || r.id, title: r.title, stage: r.stage, contentType: r.contentType, kind: r.kind, requestedBy: r.requestedBy }));
  },
};

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg; try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  try {
    if (method === "initialize") return send({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "webx-cms", version: "0.1.0" } } });
    if (method === "notifications/initialized" || method === "notifications/cancelled") return;
    if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} });
    if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    if (method === "tools/call") {
      const fn = handlers[params && params.name];
      if (!fn) return send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Unknown tool: " + (params && params.name) } });
      const out = await fn((params && params.arguments) || {});
      return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] } });
    }
    if (id != null) send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + method } });
  } catch (e) {
    if (id != null) send({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: "Error: " + (e && e.message || e) }] } });
  }
});
log("WebX CMS MCP server ready (engine=" + ENGINE + ", " + (ENGINE === "wordpress" ? "WORDPRESS_URL=" + (process.env.WORDPRESS_URL || "http://localhost:8081/wp-json") : "STRAPI=" + STRAPI) + ", credential=" + (client === reviewClient ? (TOKEN ? "set" : "MISSING") : (process.env.WORDPRESS_APP_PASSWORD ? "set" : "MISSING")) + ")");

rl.on("close", () => process.exit(0));
