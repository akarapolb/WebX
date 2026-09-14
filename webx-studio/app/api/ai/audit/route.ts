// Read-only content-audit agent: deterministic rule checks (always) + optional
// LLM insights (when configured). Safe by design — it reports, never writes.
import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/strapi";
import { structured, llmConfigured } from "@/lib/llm";
import { STRAPI_URL, STRAPI_INTERNAL_SECRET } from "@/lib/config";

const TYPES = ["api::article.article", "api::service.service", "api::faq.faq", "api::landing.landing", "api::blog.blog"];
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
// <img> tags with no alt attribute at all — alt="" (decorative) is fine and
// deliberately not flagged, only a missing attribute is a real WCAG gap.
const IMG_NO_ALT = /<img(?![^>]*\balt\s*=)[^>]*>/gi;
type Finding = { docId: string; contentType: string; title: string; dimension: string; severity: "high" | "med" | "low"; message: string };

// WCAG 2.1 relative-luminance + contrast-ratio formulas (sRGB).
function relLuminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(hexA: string, hexB: string): number | null {
  const la = relLuminance(hexA), lb = relLuminance(hexB);
  if (la == null || lb == null) return null;
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

export async function POST(req: NextRequest) {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { tenant, contentType } = await req.json().catch(() => ({} as any));
  const types: string[] = contentType ? [contentType] : TYPES;
  const tf = tenant ? "&filters[tenant][key][$eq]=" + encodeURIComponent(tenant) : "";
  const auth = { Authorization: "Bearer " + token, ...(STRAPI_INTERNAL_SECRET ? { "X-Internal-Secret": STRAPI_INTERNAL_SECRET } : {}) };
  const now = Date.now();

  const entries: { docId: string; uid: string; title: string; body: string; bodyHtml: string; meta: string; updatedAt: string }[] = [];
  for (const uid of types) {
    try {
      const r = await fetch(STRAPI_URL + "/content-manager/collection-types/" + uid + "?page=1&pageSize=100&status=published" + tf, { headers: auth, cache: "no-store" });
      if (!r.ok) continue;
      const j = await r.json();
      for (const e of (j.results ?? j.data ?? [])) {
        const title = e.title || e.name || e.subject || e.question || "";
        const bodyHtml = [e.body, e.content, e.answer, e.description].filter((x: any) => typeof x === "string").join("\n");
        const body = stripHtml(bodyHtml);
        const meta = [e.seoDescription, e.excerpt, e.description, e.metaDescription].filter((x: any) => typeof x === "string" && x.trim())[0] || "";
        entries.push({ docId: String(e.documentId ?? e.id), uid, title, body, bodyHtml, meta, updatedAt: e.updatedAt || "" });
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
    const missingAlt = e.bodyHtml.match(IMG_NO_ALT)?.length || 0;
    if (missingAlt > 0) findings.push({ ...base, dimension: "WCAG", severity: "med", message: missingAlt + " image(s) missing alt text" });
  }

  // Brand color contrast (WCAG 2.1 SC 1.4.11 non-text contrast, 3:1 — the
  // accent is used as a button/badge background with white text, a UI
  // component rather than a paragraph of small text, so the 3:1 bar applies
  // rather than the stricter 4.5:1 for body copy).
  let brandContrast: { ratio: number; ok: boolean } | null = null;
  if (tenant) {
    try {
      const r = await fetch(STRAPI_URL + "/content-manager/collection-types/api::tenant.tenant?filters[key][$eq]=" + encodeURIComponent(tenant) + "&pageSize=1", { headers: auth, cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        const hex = (j.results ?? j.data ?? [])[0]?.brand?.primaryColor;
        if (hex) {
          const ratio = contrastRatio(hex, "#ffffff");
          if (ratio != null) {
            brandContrast = { ratio: Math.round(ratio * 100) / 100, ok: ratio >= 3 };
            if (!brandContrast.ok) {
              findings.push({
                docId: "brand-color", contentType: "branding", title: "Brand accent color",
                dimension: "WCAG", severity: "med",
                message: `Accent color contrast too low (${brandContrast.ratio}:1 against white, needs 3:1)`,
              });
            }
          }
        }
      }
    } catch {}
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
        cache: true,
      });
      for (const f of (out?.findings || [])) { const e = entries[f.i]; if (e) findings.push({ docId: e.docId, contentType: e.uid, title: e.title || "(untitled)", dimension: "AI · " + f.dimension, severity: (["high", "med", "low"].includes(f.severity) ? f.severity : "low") as any, message: f.message }); }
      aiUsed = true;
    } catch {}
  }

  const rank = { high: 0, med: 1, low: 2 } as any;
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return NextResponse.json({ ok: true, scanned: entries.length, findings, aiUsed, aiConfigured: llmConfigured(), brandContrast });
}
