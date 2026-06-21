// RAG search: embed query → top-k from the pluggable vector store → grounded,
// cited answer. Backend (in-app cosine vs pgvector) is config-driven.
import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/strapi";
import { embed, generate, llmConfigured } from "@/lib/llm";
import { vectorQuery, vectorBackend } from "@/lib/vectorstore";

export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!llmConfigured()) return NextResponse.json({ error: "LLM not configured" }, { status: 503 });
  const { query, tenant } = await req.json().catch(() => ({} as any));
  if (!query || typeof query !== "string") return NextResponse.json({ error: "query required" }, { status: 400 });
  try {
    const [qv] = await embed([query]);
    const top = await vectorQuery(qv, { token, tenant, k: 5 });
    if (!top.length) return NextResponse.json({ ok: true, answer: "", citations: [], backend: vectorBackend() });
    const ctx = top.map((s, i) => "[" + (i + 1) + "] " + s.title + "\n" + s.text).join("\n\n");
    const answer = await generate({
      system: "Answer using ONLY the numbered sources. Cite inline as [1], [2]. If the answer isn't in the sources, say you don't have that information. Reply in the user's language.",
      prompt: "Sources:\n" + ctx + "\n\nQuestion: " + query, maxTokens: 600,
    });
    return NextResponse.json({ ok: true, answer, citations: top.map((s) => ({ title: s.title, url: s.url || "", contentType: s.contentType, score: s.score })), backend: vectorBackend() });
  } catch (e: any) {
    return NextResponse.json({ error: "AI error: " + (e?.message || "?") }, { status: 502 });
  }
}
