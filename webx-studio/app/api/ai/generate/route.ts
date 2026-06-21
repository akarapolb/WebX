// BFF AI endpoint — auth-gated, server-side keys, provider-agnostic via lib/llm.
import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/strapi";
import { generate, structured, llmConfigured } from "@/lib/llm";

export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!llmConfigured()) return NextResponse.json({ error: "LLM not configured" }, { status: 503 });
  const { prompt, system, model, schema } = await req.json().catch(() => ({}));
  if (!prompt || typeof prompt !== "string") return NextResponse.json({ error: "prompt required" }, { status: 400 });
  try {
    if (schema) return NextResponse.json({ ok: true, data: await structured({ prompt, system, schema, model }) });
    return NextResponse.json({ ok: true, text: await generate({ prompt, system, model }) });
  } catch (e: any) {
    return NextResponse.json({ error: "AI error: " + (e?.message || "unknown") }, { status: 502 });
  }
}
