// RAG indexer: chunk published tenant content → embed (LLM-agnostic) → store
// vectors via the pluggable vector store (in-app cosine or pgvector).
//
// Tenant scoping: see app/api/ai/search/route.ts's header comment — this
// route had the same bug (client-supplied `tenant` trusted outright), and
// it's actually worse here since it's a WRITE: any authenticated editor of
// ANY tenant could tag their own content as another tenant's, poisoning that
// tenant's search results. Fixed the same way: derive tenant from the
// caller's own session instead of trusting the body.
import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/strapi";
import { embed, llmConfigured } from "@/lib/llm";
import { STRAPI_URL, STRAPI_INTERNAL_SECRET } from "@/lib/config";
import { vectorUpsert, vectorBackend, type VecUpsert } from "@/lib/vectorstore";
import { requireUser, resolveMyTenant } from "@/lib/cms/governance";
import { CmsError } from "@/lib/cms/types";

const INDEXABLE = ["api::article.article", "api::service.service", "api::faq.faq", "api::landing.landing", "api::blog.blog"];
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!llmConfigured()) return NextResponse.json({ error: "LLM not configured" }, { status: 503 });
  const { tenant: requestedTenant, contentType } = await req.json().catch(() => ({} as any));
  let tenant: string;
  try {
    await requireUser();
    const eff = await resolveMyTenant();
    // Same rule as ai/search: a scoped caller can only ever index their own
    // tenant's content — the body's tenant is ignored, not trusted. An
    // unscoped (super-admin) caller must name one explicitly.
    if (eff) tenant = eff.key;
    else if (typeof requestedTenant === "string" && requestedTenant) tenant = requestedTenant;
    else return NextResponse.json({ error: "tenant required" }, { status: 400 });
  } catch (e: any) {
    if (e instanceof CmsError) return NextResponse.json({ error: e.message }, { status: e.status || 401 });
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const types: string[] = contentType ? [contentType] : INDEXABLE;
  const tf = tenant ? "&filters[tenant][key][$eq]=" + encodeURIComponent(tenant) : "";
  // Strapi's admin-mfa middleware gates content-manager routes behind MFA
  // unless this header is present (see strapi-cms/src/middlewares/admin-mfa.ts) —
  // same exemption governance.ts's authHeaders() already applies to every
  // other server-to-server call. Without it every fetch below 401s and the
  // `if (!r.ok) continue` below silently drops it, so indexing always found
  // 0 docs with no error.
  const auth = { Authorization: "Bearer " + token, ...(STRAPI_INTERNAL_SECRET ? { "X-Internal-Secret": STRAPI_INTERNAL_SECRET } : {}) };

  const docs: { documentRef: string; contentType: string; title: string; text: string }[] = [];
  for (const uid of types) {
    try {
      const r = await fetch(STRAPI_URL + "/content-manager/collection-types/" + uid + "?page=1&pageSize=100&status=published" + tf, { headers: auth, cache: "no-store" });
      if (!r.ok) continue;
      const j = await r.json();
      for (const e of (j.results ?? j.data ?? [])) {
        const title = e.title || e.name || e.subject || e.question || "";
        const body = [e.excerpt, e.body, e.content, e.answer, e.description, e.summary].filter((x: any) => typeof x === "string").join("\n");
        const text = (title + "\n" + stripHtml(body)).slice(0, 1500);
        if (text.trim()) docs.push({ documentRef: String(e.documentId ?? e.id), contentType: uid, title, text });
      }
    } catch {}
  }
  if (!docs.length) return NextResponse.json({ ok: true, indexed: 0, backend: vectorBackend() });

  // embed in batches, then hand the whole set to the store (one pgvector tx)
  const toUpsert: VecUpsert[] = [];
  for (let i = 0; i < docs.length; i += 32) {
    const batch = docs.slice(i, i + 32);
    let vectors: number[][] = [];
    try { vectors = await embed(batch.map((d) => d.text)); } catch { break; }
    for (let k = 0; k < batch.length; k++) { const v = vectors[k]; if (v) toUpsert.push({ ...batch[k], vector: v }); }
  }
  const indexed = await vectorUpsert(toUpsert, { token, tenant });
  return NextResponse.json({ ok: true, indexed, backend: vectorBackend() });
}
