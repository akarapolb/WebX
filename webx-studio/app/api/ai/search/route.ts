// RAG search: embed query → top-k from the pluggable vector store → grounded,
// cited answer. Backend (in-app cosine vs pgvector) is config-driven.
//
// Tenant scoping: unlike every /api/cms/** route, this one used to trust a
// client-supplied `tenant` body field outright and hand it straight to
// vectorQuery() — since api::doc-embedding.doc-embedding isn't in Strapi's
// SCOPED set either, that meant any authenticated editor of ANY tenant could
// read another tenant's indexed content by just naming it. Fixed by deriving
// the tenant from the caller's own session (resolveMyTenant()) the same way
// every governed.* call does, same as the earlier /api/cms/content-usage fix.
import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/strapi";
import { embed, generate, llmConfigured } from "@/lib/llm";
import { vectorQuery, vectorBackend } from "@/lib/vectorstore";
import { requireUser, resolveMyTenant } from "@/lib/cms/governance";
import { CmsError } from "@/lib/cms/types";

export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!llmConfigured()) return NextResponse.json({ error: "LLM not configured" }, { status: 503 });
  const { query, tenant: requestedTenant } = await req.json().catch(() => ({} as any));
  if (!query || typeof query !== "string") return NextResponse.json({ error: "query required" }, { status: 400 });
  let tenant: string;
  try {
    await requireUser();
    const eff = await resolveMyTenant();
    // A scoped caller can only ever search their own tenant — the request
    // body's tenant, if any, is ignored rather than trusted. An unscoped
    // (super-admin) caller has no home tenant, so must name one explicitly.
    if (eff) tenant = eff.key;
    else if (typeof requestedTenant === "string" && requestedTenant) tenant = requestedTenant;
    else return NextResponse.json({ error: "tenant required" }, { status: 400 });
  } catch (e: any) {
    if (e instanceof CmsError) return NextResponse.json({ error: e.message }, { status: e.status || 401 });
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  try {
    const [qv] = await embed([query]);
    const top = await vectorQuery(qv, { token, tenant, k: 5 });
    if (!top.length) return NextResponse.json({ ok: true, answer: "", citations: [], backend: vectorBackend() });
    const ctx = top.map((s, i) => "[" + (i + 1) + "] " + s.title + "\n" + s.text).join("\n\n");
    const answer = await generate({
      system: "Answer using ONLY the numbered sources. Cite inline as [1], [2]. If the answer isn't in the sources, say you don't have that information. Reply in the user's language.",
      prompt: "Sources:\n" + ctx + "\n\nQuestion: " + query, maxTokens: 600, cache: true,
    });
    return NextResponse.json({ ok: true, answer, citations: top.map((s) => ({ title: s.title, url: s.url || "", contentType: s.contentType, score: s.score })), backend: vectorBackend() });
  } catch (e: any) {
    return NextResponse.json({ error: "AI error: " + (e?.message || "?") }, { status: 502 });
  }
}
