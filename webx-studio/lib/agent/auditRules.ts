// Deterministic content-quality rules — extracted from
// app/api/ai/audit/route.ts (unchanged logic) so the agent's own
// `audit_entry` tool can run the identical checks against ONE entry it
// already has in hand via governed.get, instead of re-implementing them or
// re-fetching through that route's own bulk, tenant-wide, Strapi-direct scan
// (which bypasses governance.ts entirely — see that route's own comments).
export type AuditFinding = { dimension: string; severity: "high" | "med" | "low"; message: string; fix?: string };

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
// <img> tags with no alt attribute at all — alt="" (decorative) is fine and
// deliberately not flagged, only a missing attribute is a real WCAG gap.
const IMG_NO_ALT = /<img(?![^>]*\balt\s*=)[^>]*>/gi;

/** Thai national ID — 13 digits, not already part of a longer digit run
 * (phone/reference numbers etc.) — same pattern the bulk audit route uses,
 * reused here so a single-entry audit flags the identical PDPA risk. */
export const THAI_ID_RE = /(?<!\d)\d{13}(?!\d)/;

export function auditEntry(e: {
  title?: string; body?: string; bodyHtml?: string; meta?: string; updatedAt?: string;
}): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const title = (e.title || "").trim();
  const body = stripHtml(e.body || e.bodyHtml || "");
  const bodyHtml = e.bodyHtml || e.body || "";

  if (!title) findings.push({ dimension: "SEO/AEO", severity: "high", message: "Missing title" });
  if (!e.meta) findings.push({ dimension: "SEO/AEO", severity: "med", message: "No meta description / excerpt — weak for search & answer engines" });
  if (body.length < 200) findings.push({ dimension: "Quality", severity: "low", message: `Thin content (${body.length} chars)` });
  if (e.updatedAt) {
    const days = Math.round((Date.now() - new Date(e.updatedAt).getTime()) / 864e5);
    if (days > 365) findings.push({ dimension: "Freshness", severity: "low", message: `Stale — last updated ${days} days ago` });
  }
  if (THAI_ID_RE.test(body)) findings.push({ dimension: "PDPA", severity: "high", message: "Possible 13-digit national ID in content" });
  const missingAlt = bodyHtml.match(IMG_NO_ALT)?.length || 0;
  if (missingAlt > 0) findings.push({ dimension: "WCAG", severity: "med", message: `${missingAlt} image(s) missing alt text`, fix: "add_alt_text" });

  const rank = { high: 0, med: 1, low: 2 } as const;
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
