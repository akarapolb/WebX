// AI Translate -> Review: translate an entry's localized text fields with the
// provider-agnostic LLM, then file the result as a *translation review* on the
// Reviews board. It never writes the entry directly — a human approves and
// Applies it (safe agentic write-op, human-in-the-loop).
import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/strapi";
import { structured, llmConfigured } from "@/lib/llm";
import { STRAPI_URL, STRAPI_INTERNAL_SECRET } from "@/lib/config";

// localized text fields we attempt to translate, in display order
const CAND = ["title", "name", "subject", "question", "categoryLabel", "excerpt", "summary", "description", "answer", "body", "content"];
const langName = (c: string) => (c.toLowerCase().startsWith("en") ? "English" : "Thai");

export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!llmConfigured()) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const { uid, docId, locale, targetLocale } = await req.json().catch(() => ({} as any));
  if (!uid || !docId || !targetLocale) return NextResponse.json({ error: "uid, docId, targetLocale required" }, { status: 400 });
  const auth = { Authorization: "Bearer " + token, ...(STRAPI_INTERNAL_SECRET ? { "X-Internal-Secret": STRAPI_INTERNAL_SECRET } : {}) };

  // 1. load the source entry
  const src = locale ? "?locale=" + encodeURIComponent(locale) : "";
  const r = await fetch(STRAPI_URL + "/content-manager/collection-types/" + uid + "/" + docId + src, { headers: auth, cache: "no-store" });
  if (!r.ok) return NextResponse.json({ error: "Could not load source entry (HTTP " + r.status + ")" }, { status: 502 });
  const j = await r.json(); const e = j.data ?? j;

  const source: Record<string, string> = {};
  for (const k of CAND) { const v = e[k]; if (typeof v === "string" && v.trim()) source[k] = v; }
  if (!Object.keys(source).length) return NextResponse.json({ error: "No translatable text fields on this entry" }, { status: 422 });

  // 2. translate (structured: same keys, translated values; HTML preserved)
  let translated: Record<string, string> = {};
  try {
    const out = await structured<{ fields: Record<string, string> }>({
      system: "You are a professional translator for Thai government (DGA / สพร.) web content. Translate each field value into " + langName(targetLocale) + ", preserving meaning, a formal public-sector tone, and any HTML tags exactly. Do NOT translate proper nouns or acronyms (DGA, สพร., PDPA, ThaID). Return the same JSON keys with translated values only.",
      prompt: "Translate these fields to " + langName(targetLocale) + ":\n" + JSON.stringify(source),
      schema: { type: "object", additionalProperties: false, required: ["fields"], properties: { fields: { type: "object", additionalProperties: { type: "string" } } } },
      cache: true,
    });
    translated = out?.fields || {};
  } catch {
    return NextResponse.json({ error: "Translation failed" }, { status: 502 });
  }
  const fields: Record<string, string> = {};
  for (const k of Object.keys(source)) if (typeof translated[k] === "string" && translated[k].trim()) fields[k] = translated[k];
  if (!Object.keys(fields).length) return NextResponse.json({ error: "Translator returned nothing usable" }, { status: 502 });

  // 3. file a translation review (human approves + applies)
  const title = "[" + String(targetLocale).toUpperCase() + "] " + (source.title || source.name || docId.slice(0, 8));
  const body = {
    documentRef: docId, contentType: uid, title, stage: "in_review", kind: "translation",
    requestedBy: "AI translate", note: "AI draft translation -> " + targetLocale + ". Review, then Apply to write the " + targetLocale + " locale.",
    payload: { targetLocale, sourceLocale: locale || "", fields },
    history: [{ to: "in_review", by: "AI translate", at: new Date().toISOString() }],
  };
  const cr = await fetch(STRAPI_URL + "/content-manager/collection-types/api::review.review", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!cr.ok) return NextResponse.json({ error: "Could not create review (HTTP " + cr.status + ")" }, { status: 502 });
  const cj = await cr.json().catch(() => ({} as any)); const rv = cj.data ?? cj;
  return NextResponse.json({ ok: true, targetLocale, fields, reviewId: rv?.documentId ?? rv?.id });
}
