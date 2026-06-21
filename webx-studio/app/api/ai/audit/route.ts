// Read-only content-audit agent: deterministic rule checks (always) + optional
// LLM insights (when configured). Safe by design — it reports, never writes.
import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/strapi";
import { structured, llmConfigured } from "@/lib/llm";
import { STRAPI_URL } from "@/lib/config";

const TYPES = ["api::article.article", "api::service.service", "api::faq.faq", "api::landing.landing", "api::blog.blog"];
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
type Finding = { docId: string; contentType: string; title: string; dimension: string; severity: "high" | "med" | "low"; message: string };

export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { tenant, contentType } = await req.json().catch(() => ({} as any));
  const types: string[] = contentType ? [contentType] : TYPES;
  const tf = tenant ? "&filters[tenant][key][$eq]=" + encodeURIComponent(tenant) : "";
  const auth = { Authorization: "Bearer " + token };
  const now = Date.now();

  const entries: { docId: string; uid: string; title: string; body: string; meta: string; updatedAt: string }[] = [];
  for (const uid of types) {
    try {
      const r = await fetch(STRAPI_URL + "/content-manager/collection-types/" + uid + "?page=1&pageSize=100&status=published" + tf, { headers: auth, cache: "no-store" });
      if (!r.ok) continue;
      const j = await r.json();
      for (const e of (j.results ?? j.data ?? [])) {
        const title = e.title || e.name || e.subject || e.question || "";
        const body = stripHtml([e.body, e.content, e.answer, e.description].filter((x: any) => typeof x === "string").join("\n"));
        const meta = [e.seoDescription, e.excerpt, e.description, e.metaDescription].filter((x: any) => typeof x === "string" && x.trim())[0] || "";
        entries.push({ docId: String(e.documentId ?? e.id), uid, title, body, meta, updatedAt: e.updatedAt || "" });
      }
    } catch {}
  }

  const findings: Finding[] = [];
  for (const e of entries) {
    const base = { docId: e.docId, contentType: e.uid, title: e.title || "(untitled)" };
    if (!e.meta) findings.push({ ...base, dimension: "SEO/AEO", severity: "med", message: "No meta description / excerpt — weak for search & answer engines" });
    if (e.body.length < 200) findings.push({ ...base, dimension: "Quality", severity: "low", message: "Thin content (" + e.body.length + " chars)" });
    if (e.updatedAt) { const days = Math.round((now - new Date(e.updatedAt).getTime()) / 864e5); if (days > 365) findings.push({ ...base, dimension: "Freshness", severity: "low", message: "Stale — last updated " + days + " days ago" }); }
    if (/(?<!\d)\d{13}(?!\d)/.test(e.body)) findings.push({ ...base, dimension: "PDPA", severity: "high", message: "Possible 13-digit national ID in content" });
    if (!e.title.trim()) findings.push({ ...base, dimension: "SEO/AEO", severity: "high", message: "Missing title" });
  }

  // LLM enrichment (qualitative: clarity, tone, accessibility wording, GEO-readiness)
  let aiUsed = false;
  if (llmConfigured() && entries.length) {
    try {
      const sample = entries.slice(0, 15).map((e, i) => "#" + i + " [" + e.uid.replace(/^api::/, "").replace(/\..*$/, "") + "] " + e.title + " :: " + e.body.slice(0, 400));
      const out = await structured<{ findings: { i: number; dimension: string; severity: string; message: string }[] }>({
        system: "You audit Thai government website content. For each item flag real issues only, in: Clarity, Tone, Accessibility, GEO/AEO, PDPA. Be specific and concise. Reply with findings referencing the item index.",
        prompt: "Audit these content items and return findings:\n" + sample.join("\n"),
        schema: { type: "object", additionalProperties: false, required: ["findings"], properties: { findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["i", "dimension", "severity", "message"], properties: { i: { type: "integer" }, dimension: { type: "string" }, severity: { type: "string", enum: ["high", "med", "low"] }, message: { type: "string" } } } } } },
      });
      for (const f of (out?.findings || [])) { const e = entries[f.i]; if (e) findings.push({ docId: e.docId, contentType: e.uid, title: e.title || "(untitled)", dimension: "AI · " + f.dimension, severity: (["high", "med", "low"].includes(f.severity) ? f.severity : "low") as any, message: f.message }); }
      aiUsed = true;
    } catch {}
  }

  const rank = { high: 0, med: 1, low: 2 } as any;
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return NextResponse.json({ ok: true, scanned: entries.length, findings, aiUsed, aiConfigured: llmConfigured() });
}
