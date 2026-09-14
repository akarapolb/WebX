// Pluggable vector store for RAG. Same interface, two backends:
//   • "strapi" (default) — vectors in the doc-embedding collection, in-app
//     cosine. Zero infra, works on SQLite. This is the verified dev/demo path.
//   • "pgvector" (production scale) — set WEBX_VECTOR=pgvector + PGVECTOR_URL.
//     Uses Postgres + the pgvector extension for ANN at scale. Requires `pg`
//     (npm i pg) and a provisioned database; loaded only when selected.
import { STRAPI_URL, STRAPI_INTERNAL_SECRET } from "@/lib/config";

export type VecUpsert = { documentRef: string; contentType: string; title: string; text: string; url?: string; vector: number[] };
export type VecHit = { title: string; text: string; url?: string; contentType?: string; score: number };
type Opts = { token: string; tenant?: string; k?: number };

const EM = "api::doc-embedding.doc-embedding";
const cosine = (a: number[], b: number[]) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / ((Math.sqrt(na) * Math.sqrt(nb)) || 1);
};
const round = (n: number) => Math.round(n * 100) / 100;

export function vectorBackend(): "pgvector" | "strapi" {
  return process.env.WEBX_VECTOR === "pgvector" && process.env.PGVECTOR_URL ? "pgvector" : "strapi";
}

// ── strapi backend (default) ────────────────────────────────────────────────
async function strapiUpsert(docs: VecUpsert[], o: Opts) {
  // Strapi's admin-mfa middleware gates content-manager routes behind MFA
  // unless this header is present (see strapi-cms/src/middlewares/admin-mfa.ts).
  // Without it every call below 401s — upsert silently drops every doc,
  // query silently returns zero hits.
  const auth = { Authorization: "Bearer " + o.token, ...(STRAPI_INTERNAL_SECRET ? { "X-Internal-Secret": STRAPI_INTERNAL_SECRET } : {}) };
  let n = 0;
  for (const d of docs) {
    try {
      const old = await fetch(STRAPI_URL + "/content-manager/collection-types/" + EM + "?pageSize=50&filters[documentRef][$eq]=" + encodeURIComponent(d.documentRef), { headers: auth, cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
      for (const ox of (old?.results ?? old?.data ?? [])) await fetch(STRAPI_URL + "/content-manager/collection-types/" + EM + "/" + (ox.documentId ?? ox.id), { method: "DELETE", headers: auth }).catch(() => {});
    } catch {}
    try {
      await fetch(STRAPI_URL + "/content-manager/collection-types/" + EM, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ documentRef: d.documentRef, contentType: d.contentType, title: d.title, text: d.text, vector: d.vector, tenantKey: o.tenant || "" }) });
      n++;
    } catch {}
  }
  return n;
}
async function strapiQuery(vec: number[], o: Opts): Promise<VecHit[]> {
  // Strapi's admin-mfa middleware gates content-manager routes behind MFA
  // unless this header is present (see strapi-cms/src/middlewares/admin-mfa.ts).
  // Without it every call below 401s — upsert silently drops every doc,
  // query silently returns zero hits.
  const auth = { Authorization: "Bearer " + o.token, ...(STRAPI_INTERNAL_SECRET ? { "X-Internal-Secret": STRAPI_INTERNAL_SECRET } : {}) };
  const tf = o.tenant ? "&filters[tenantKey][$eq]=" + encodeURIComponent(o.tenant) : "";
  const r = await fetch(STRAPI_URL + "/content-manager/collection-types/" + EM + "?pageSize=500" + tf, { headers: auth, cache: "no-store" });
  const rows: any[] = r.ok ? ((await r.json()).results ?? []) : [];
  return rows
    .map((x) => ({ title: x.title, text: x.text, url: x.url || "", contentType: x.contentType, score: Array.isArray(x.vector) ? cosine(vec, x.vector) : -1 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, o.k || 5)
    .map((x) => ({ ...x, score: round(x.score) }));
}

// ── pgvector backend (production) — dynamic, only when selected ──────────────
async function pgClient() {
  const mod: any = await import(/* webpackIgnore: true */ "pg" as string);
  const Client = mod.Client || mod.default?.Client;
  const c = new Client({ connectionString: process.env.PGVECTOR_URL });
  await c.connect();
  return c;
}
const vlit = (v: number[]) => "[" + v.join(",") + "]";
async function pgUpsert(docs: VecUpsert[], o: Opts) {
  if (!docs.length) return 0;
  const c = await pgClient();
  try {
    await c.query("CREATE EXTENSION IF NOT EXISTS vector");
    await c.query("CREATE TABLE IF NOT EXISTS webx_embeddings (id bigserial primary key, document_ref text, content_type text, title text, text text, url text, tenant_key text, embedding vector(" + docs[0].vector.length + "))");
    await c.query("CREATE INDEX IF NOT EXISTS webx_emb_cos ON webx_embeddings USING ivfflat (embedding vector_cosine_ops)").catch(() => {});
    let n = 0;
    for (const d of docs) {
      await c.query("DELETE FROM webx_embeddings WHERE document_ref=$1 AND tenant_key=$2", [d.documentRef, o.tenant || ""]);
      await c.query("INSERT INTO webx_embeddings (document_ref, content_type, title, text, url, tenant_key, embedding) VALUES ($1,$2,$3,$4,$5,$6,$7)", [d.documentRef, d.contentType, d.title, d.text, d.url || "", o.tenant || "", vlit(d.vector)]);
      n++;
    }
    return n;
  } finally { await c.end().catch(() => {}); }
}
async function pgQuery(vec: number[], o: Opts): Promise<VecHit[]> {
  const c = await pgClient();
  try {
    const args: any[] = [vlit(vec)];
    let where = "";
    if (o.tenant) { where = " WHERE tenant_key=$2"; args.push(o.tenant); }
    const res = await c.query("SELECT title, text, url, content_type, 1 - (embedding <=> $1) AS score FROM webx_embeddings" + where + " ORDER BY embedding <=> $1 LIMIT " + (o.k || 5), args);
    return res.rows.map((r: any) => ({ title: r.title, text: r.text, url: r.url, contentType: r.content_type, score: round(Number(r.score)) }));
  } finally { await c.end().catch(() => {}); }
}

// ── public API ──────────────────────────────────────────────────────────────
export async function vectorUpsert(docs: VecUpsert[], o: Opts): Promise<number> {
  return vectorBackend() === "pgvector" ? pgUpsert(docs, o) : strapiUpsert(docs, o);
}
export async function vectorQuery(vec: number[], o: Opts): Promise<VecHit[]> {
  return vectorBackend() === "pgvector" ? pgQuery(vec, o) : strapiQuery(vec, o);
}
