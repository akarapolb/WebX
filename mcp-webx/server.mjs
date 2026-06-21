#!/usr/bin/env node
// WebX CMS — MCP server (zero-dependency, stdio JSON-RPC).
// Lets MCP clients (Claude Code/Desktop, Cursor) operate the CMS via Strapi's
// REST API using a Strapi API token. Safe surface: read + create/update DRAFTS.
// No publish/delete tools — least privilege is enforced by the token's perms.
import { createInterface } from "node:readline";

const STRAPI = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");
const TOKEN = process.env.STRAPI_TOKEN || "";
const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
const log = (s) => process.stderr.write("[webx-mcp] " + s + "\n");

async function strapi(path, opts = {}) {
  const r = await fetch(STRAPI + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: "Bearer " + TOKEN } : {}), ...(opts.headers || {}) },
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
  if (!r.ok) throw new Error("Strapi " + r.status + ": " + ((j && j.error && j.error.message) || text).slice(0, 240));
  return j;
}
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
];

const handlers = {
  list_content_types: async () => ["articles", "services", "faqs", "landings", "blogs", "events", "downloads"],
  search_content: async ({ contentType, query, limit = 10 }) => {
    const qs = "?pagination[pageSize]=" + Math.min(Number(limit) || 10, 50) + "&sort=updatedAt:desc" + (query ? "&_q=" + encodeURIComponent(query) : "");
    const j = await strapi("/api/" + contentType + qs);
    return (j.data || []).map(simplify);
  },
  get_entry: async ({ contentType, documentId }) => (await strapi("/api/" + contentType + "/" + documentId + "?populate=*")).data,
  create_entry: async ({ contentType, data }) => simplify((await strapi("/api/" + contentType, { method: "POST", body: JSON.stringify({ data }) })).data),
  update_entry: async ({ contentType, documentId, data }) => simplify((await strapi("/api/" + contentType + "/" + documentId, { method: "PUT", body: JSON.stringify({ data }) })).data),
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
log("WebX CMS MCP server ready (STRAPI=" + STRAPI + ", token=" + (TOKEN ? "set" : "MISSING") + ")");

rl.on("close", () => process.exit(0));
