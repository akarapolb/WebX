// RAG search: embed query → cosine top-k over the vector index → grounded, cited answer.
import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/strapi";
import { embed, generate, llmConfigured } from "@/lib/llm";
import { STRAPI_URL } from "@/lib/config";

function cosine(a: number[], b: number[]) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / ((Math.sqrt(na) * Math.sqrt(nb)) || 1);
}

export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!llmConfigured()) return NextResponse.json({ error: "LLM not configured" }, { status: 503 });
  const { query, tenant } = await req.json().catch(() => ({} as any));
  if (!query || typeof query !== "string") return NextResponse.json({ error: "query required" }, { status: 400 });
  const auth = { Authorization: "Bearer " + token };
  try {
    const [qv] = await embed([query]);
    const tf = tenant ? "&filters[tenantKey][$eq]=" + encodeURIComponent(tenant) : "";
    const r = await fetch(STRAPI_URL + "/content-manager/collection-types/api::doc-embedding.doc-embedding?pageSize=500" + tf, { headers: auth, cache: "no-store" });
    const rows = r.ok ? ((await r.json()).results ?? []) : [];
    const top = rows
      .map((x: any) => ({ ...x, score: Array.isArray(x.vector) ? cosine(qv, x.vector) : -1 }))
      .sort((a: any, b: any) => b.score - a.score).slice(0, 5);
    if (!top.length) return NextResponse.json({ ok: true, answer: "", citations: [] });
    const ctx = top.map((s: any, i: number) => "[" + (i + 1) + "] " + s.title + "\n" + s.text).join("\n\n");
    const answer = await generate({
      system: "Answer using ONLY the numbered sources. Cite inline as [1], [2]. If the answer isn't in the sources, say you don't have that information. Reply in the user's language.",
      prompt: "Sources:\n" + ctx + "\n\nQuestion: " + query, maxTokens: 600,
    });
    return NextResponse.json({ ok: true, answer, citations: top.map((s: any) => ({ title: s.title, url: s.url || "", contentType: s.contentType, score: Math.round(s.score * 100) / 100 })) });
  } catch (e: any) {
    return NextResponse.json({ error: "AI error: " + (e?.message || "?") }, { status: 502 });
  }
}
