#!/usr/bin/env node
// WebX CLI — operate the CMS from the terminal / scripts / CI. Zero-dependency
// (Node 18+). Talks to Strapi REST with a Strapi API token; AI uses LiteLLM.
//   STRAPI_URL (default http://localhost:1337) · STRAPI_TOKEN · LITELLM_URL · LITELLM_KEY
const STRAPI = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");
const TOKEN = process.env.STRAPI_TOKEN || "";
const LITELLM = (process.env.LITELLM_URL || "").replace(/\/$/, "");
const LKEY = process.env.LITELLM_KEY || "";
const stripHtml = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const titleOf = (e) => e.title || e.name || e.subject || e.question || ("#" + (e.documentId || e.id));

async function api(path, opts = {}) {
  const r = await fetch(STRAPI + path, { ...opts, headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: "Bearer " + TOKEN } : {}), ...(opts.headers || {}) } });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error("Strapi " + r.status + ": " + ((j && j.error && j.error.message) || t).slice(0, 200));
  return j;
}
// parse: positionals + --key=val / --flag / -q val
function parse(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq >= 0) { opt[a.slice(2, eq)] = a.slice(eq + 1); }
      else { const k = a.slice(2), n = argv[i + 1]; if (n !== undefined && !n.startsWith("-")) { opt[k] = n; i++; } else opt[k] = true; }
    }
    else if (a.startsWith("-")) { opt[a.slice(1)] = argv[++i]; }
    else pos.push(a);
  }
  return { pos, opt };
}
const die = (m) => { console.error("error: " + m); process.exit(1); };

const TYPES = ["articles", "services", "faqs", "landings", "blogs", "events", "downloads"];

const cmds = {
  async types() { console.log(TYPES.join("\n")); },
  async ls(p, o) {
    const type = p[0] || die("usage: webx ls <type> [-q query] [-n limit]");
    const qs = "?pagination[pageSize]=" + (o.n || o.limit || 20) + "&sort=updatedAt:desc" + (o.q ? "&_q=" + encodeURIComponent(o.q) : "");
    const j = await api("/api/" + type + qs);
    for (const e of (j.data || [])) console.log((e.documentId || e.id).padEnd(26) + "  " + titleOf(e));
    console.log("\n" + (j.data || []).length + " of " + (j.meta?.pagination?.total ?? "?") + " " + type);
  },
  async get(p) {
    const [type, id] = p; if (!type || !id) die("usage: webx get <type> <documentId>");
    console.log(JSON.stringify((await api("/api/" + type + "/" + id + "?populate=*")).data, null, 2));
  },
  async new(p, o) {
    const type = p[0] || die("usage: webx new <type> --title=... [--field=value]");
    const data = {}; for (const k of Object.keys(o)) if (k !== "_") data[k] = o[k] === true ? "" : o[k];
    const j = await api("/api/" + type, { method: "POST", body: JSON.stringify({ data }) });
    console.log("created draft " + (j.data?.documentId || j.data?.id) + " in " + type);
  },
  async set(p, o) {
    const [type, id] = p; if (!type || !id) die("usage: webx set <type> <documentId> --field=value");
    const data = {}; for (const k of Object.keys(o)) data[k] = o[k];
    await api("/api/" + type + "/" + id, { method: "PUT", body: JSON.stringify({ data }) });
    console.log("updated " + id + " in " + type);
  },
  async audit(p, o) {
    const types = o.t || o.type ? [o.t || o.type] : TYPES;
    const tf = o.tenant ? "&filters[tenant][key][$eq]=" + encodeURIComponent(o.tenant) : "";
    const now = Date.now(); const findings = []; let scanned = 0;
    for (const type of types) {
      let j; try { j = await api("/api/" + type + "?pagination[pageSize]=100" + tf); } catch { continue; }
      for (const e of (j.data || [])) {
        scanned++;
        const title = titleOf(e), body = stripHtml([e.body, e.content, e.answer, e.description, e.excerpt].filter((x) => typeof x === "string").join("\n"));
        const meta = [e.seoDescription, e.excerpt, e.description].filter((x) => typeof x === "string" && x.trim())[0] || "";
        if (!meta) findings.push(["MED", "SEO/AEO", title, "no meta description / excerpt"]);
        if (body.length < 200) findings.push(["LOW", "Quality", title, "thin content (" + body.length + " chars)"]);
        if (e.updatedAt) { const d = Math.round((now - new Date(e.updatedAt).getTime()) / 864e5); if (d > 365) findings.push(["LOW", "Freshness", title, "stale " + d + "d"]); }
        if (/(?<!\d)\d{13}(?!\d)/.test(body)) findings.push(["HIGH", "PDPA", title, "possible 13-digit national ID"]);
      }
    }
    const rank = { HIGH: 0, MED: 1, LOW: 2 };
    findings.sort((a, b) => rank[a[0]] - rank[b[0]]);
    for (const f of findings) console.log(f[0].padEnd(5) + " " + f[1].padEnd(10) + " " + f[2].slice(0, 50).padEnd(52) + " " + f[3]);
    console.log("\nscanned " + scanned + " · " + findings.length + " issues");
  },
  async ai(p) {
    if (!LITELLM) die("AI off: set LITELLM_URL (see litellm/README.md)");
    const prompt = p.join(" "); if (!prompt) die("usage: webx ai <prompt>");
    const r = await fetch(LITELLM + "/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", ...(LKEY ? { Authorization: "Bearer " + LKEY } : {}) }, body: JSON.stringify({ model: process.env.LITELLM_MODEL || "webx-default", messages: [{ role: "user", content: prompt }] }) });
    const j = await r.json();
    console.log(j?.choices?.[0]?.message?.content ?? JSON.stringify(j));
  },
  help() {
    console.log(["WebX CLI — operate the CMS from the terminal", "",
      "  webx types                          list content types",
      "  webx ls <type> [-q q] [-n 20]       list / search entries",
      "  webx get <type> <documentId>        full entry as JSON",
      "  webx new <type> --title=.. --k=v    create a draft",
      "  webx set <type> <id> --field=value  update an entry (draft)",
      "  webx audit [--type t] [--tenant k]  content audit (SEO/PDPA/quality)",
      "  webx ai <prompt>                    ask the configured LLM (LiteLLM)",
      "", "env: STRAPI_URL, STRAPI_TOKEN, LITELLM_URL, LITELLM_KEY"].join("\n"));
  },
};

const { pos, opt } = parse(process.argv.slice(2));
const cmd = pos.shift() || "help";
(cmds[cmd] || cmds.help)(pos, opt).catch((e) => die(e.message || String(e)));
