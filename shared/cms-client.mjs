// Shared, zero-dependency HTTP client for mcp-webx, cli-webx, and eval/ — the
// non-webx-studio agent surfaces (Node 18+, built-in fetch only). Talks to
// either engine's PUBLIC REST API with a service credential (never an admin
// session): Strapi with an API token, WordPress with an Application Password.
// Mirrors the CmsAdapter contract webx-studio's own admin UI uses
// (webx-studio/lib/cms/{strapi,wordpress}.ts) — same idea, same normalization
// choices, just a plainer shape suited to CLI/MCP call sites.

function buildStrapiQuery({ page, pageSize, sort, q, filters } = {}) {
  const parts = [];
  if (page != null) parts.push("pagination[page]=" + page);
  if (pageSize != null) parts.push("pagination[pageSize]=" + pageSize);
  if (sort) parts.push("sort=" + sort);
  if (q && String(q).trim()) parts.push("_q=" + encodeURIComponent(String(q).trim()));
  for (const f of filters || []) {
    const path = String(f.field).split(".").map((seg) => "[" + seg + "]").join("");
    parts.push("filters" + path + "[$" + (f.op || "eq") + "]=" + encodeURIComponent(String(f.value)));
  }
  return parts.length ? "?" + parts.join("&") : "";
}

function createStrapiClient({ baseUrl, token }) {
  const base = String(baseUrl || "http://localhost:1337").replace(/\/$/, "");

  async function request(path, opts = {}) {
    const r = await fetch(base + path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(opts.headers || {}),
      },
    });
    const text = await r.text();
    let j;
    try { j = JSON.parse(text); } catch { j = { raw: text }; }
    if (!r.ok) throw new Error("Strapi " + r.status + ": " + ((j && j.error && j.error.message) || text).slice(0, 240));
    return j;
  }

  return {
    engine: "strapi",
    async list(type, query) {
      const j = await request("/api/" + type + buildStrapiQuery(query));
      return { data: j.data || [], total: j.meta?.pagination?.total };
    },
    async get(type, id) {
      const j = await request("/api/" + type + "/" + id + "?populate=*");
      return j.data;
    },
    async create(type, data) {
      const j = await request("/api/" + type, { method: "POST", body: JSON.stringify({ data }) });
      return j.data;
    },
    async update(type, id, data) {
      const j = await request("/api/" + type + "/" + id, { method: "PUT", body: JSON.stringify({ data }) });
      return j.data;
    },
    async remove(type, id) {
      await request("/api/" + type + "/" + id, { method: "DELETE" });
    },
  };
}

// WordPress proof of concept — same narrow scope as webx-studio's own
// wordpress.ts adapter (native `posts` only, no ACF/custom fields). "token"
// here is the raw "username:applicationPassword" pair; base64-encoded once,
// here, so callers don't have to.
function richText(field) {
  if (field == null) return "";
  if (typeof field === "string") return field;
  return field.raw ?? field.rendered ?? "";
}
function normalizeWpPost(p) {
  const published = p.status === "publish";
  return {
    id: p.id,
    documentId: String(p.id),
    title: richText(p.title),
    excerpt: richText(p.excerpt),
    content: richText(p.content),
    status: published ? "published" : "draft",
    updatedAt: p.modified,
    createdAt: p.date,
    slug: p.slug,
  };
}

function createWordPressClient({ baseUrl, token }) {
  const base = String(baseUrl || "http://localhost:8081/wp-json").replace(/\/$/, "");
  const basic = token && token.includes(":") ? Buffer.from(token).toString("base64") : token;

  async function request(path, opts = {}) {
    const r = await fetch(base + path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(basic ? { Authorization: "Basic " + basic } : {}),
        ...(opts.headers || {}),
      },
    });
    const text = await r.text();
    let j;
    try { j = JSON.parse(text); } catch { j = { raw: text }; }
    if (!r.ok) throw new Error("WordPress " + r.status + ": " + ((j && j.message) || text).slice(0, 240));
    return { body: j, headers: r.headers };
  }

  // Phase 5 multi-tenancy — mirrors webx-studio/lib/cms/wordpress.ts's
  // wtenant cache: resolves a tenant key (e.g. "dga") to the wtenant
  // taxonomy's term id, the only shape WP's REST API understands.
  let wtenantCache = null;
  async function wtenantId(key) {
    if (!wtenantCache) {
      const { body } = await request("/wp/v2/wtenant?per_page=100");
      wtenantCache = new Map((body || []).map((t) => [t.slug, t.id]));
    }
    return wtenantCache.get(key);
  }

  return {
    engine: "wordpress",
    async list(type, query = {}) {
      const parts = [];
      if (query.pageSize != null) parts.push("per_page=" + query.pageSize);
      // WP rejects the whole request if a non-public status is requested
      // without auth (unlike Strapi, which just filters to public content).
      // Unauthenticated callers (e.g. eval/'s public-read corpus fetch) get
      // the default published-only view instead of a hard error.
      if (basic) parts.push("status=publish,draft,pending,future");
      if (query.q && String(query.q).trim()) parts.push("search=" + encodeURIComponent(String(query.q).trim()));
      if (query.tenant) {
        const id = await wtenantId(String(query.tenant));
        parts.push("wtenant=" + (id != null ? id : "-1")); // unknown tenant key -> no results
      }
      const { body, headers } = await request("/wp/v2/" + type + "?" + parts.join("&"));
      return { data: (body || []).map(normalizeWpPost), total: Number(headers.get("X-WP-Total") ?? (body || []).length) };
    },
    async get(type, id) {
      const { body } = await request("/wp/v2/" + type + "/" + id + "?context=edit");
      return normalizeWpPost(body);
    },
    async create(type, data) {
      const { body } = await request("/wp/v2/" + type, { method: "POST", body: JSON.stringify({ status: "draft", ...data }) });
      return normalizeWpPost(body);
    },
    async update(type, id, data) {
      const { body } = await request("/wp/v2/" + type + "/" + id, { method: "POST", body: JSON.stringify(data) });
      return normalizeWpPost(body);
    },
    async remove(type, id) {
      await request("/wp/v2/" + type + "/" + id + "?force=true", { method: "DELETE" });
    },
  };
}

export function createClient({ baseUrl, token, engine } = {}) {
  return engine === "wordpress" ? createWordPressClient({ baseUrl, token }) : createStrapiClient({ baseUrl, token });
}
