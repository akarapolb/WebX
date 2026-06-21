// RAG indexer: chunk published tenant content → embed (LLM-agnostic) → store vectors.
import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/strapi";
import { embed, llmConfigured } from "@/lib/llm";
import { STRAPI_URL } from "@/lib/config";

const INDEXABLE = ["api::article.article", "api::service.service", "api::faq.faq", "api::landing.landing", "api::blog.blog"];
const EM = "api::doc-embedding.doc-embedding";
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!llmConfigured()) return NextResponse.json({ error: "LLM not configured" }, { status: 503 });
  const { tenant, contentType } = await req.json().catch(() => ({} as any));
  const types: string[] = contentType ? [contentType] : INDEXABLE;
  const tf = tenant ? "&filters[tenant][key][$eq]=" + encodeURIComponent(tenant) : "";
  const auth = { Authorization: "Bearer " + token };

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
  if (!docs.length) return NextResponse.json({ ok: true, indexed: 0 });

  let indexed = 0;
  for (let i = 0; i < docs.length; i += 32) {
    const batch = docs.slice(i, i + 32);
    let vectors: number[][] = [];
    try { vectors = await embed(batch.map((d) => d.text)); } catch { break; }
    for (let k = 0; k < batch.length; k++) {
      const d = batch[k], v = vectors[k]; if (!v) continue;
      try {
        const old = await fetch(STRAPI_URL + "/content-manager/collection-types/" + EM + "?pageSize=50&filters[documentRef][$eq]=" + encodeURIComponent(d.documentRef), { headers: auth, cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
        for (const o of (old?.results ?? old?.data ?? [])) await fetch(STRAPI_URL + "/content-manager/collection-types/" + EM + "/" + (o.documentId ?? o.id), { method: "DELETE", headers: auth }).catch(() => {});
      } catch {}
      try {
        await fetch(STRAPI_URL + "/content-manager/collection-types/" + EM, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ documentRef: d.documentRef, contentType: d.contentType, title: d.title, text: d.text, vector: v, tenantKey: tenant || "" }) });
        indexed++;
      } catch {}
    }
  }
  return NextResponse.json({ ok: true, indexed });
}
