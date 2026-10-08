import { listTenants, getTenant, getNavItems, listPageSlugs } from "@/lib/cms";
import { siteUrlFor, publicPath } from "@/lib/seo";

// llms.txt (https://llmstxt.org) — a plain-text site map written for AI
// assistants, generated at build time from the same tenant/nav data the
// HTML pages are built from. marketing-site's compliance checklist listed
// this alongside RSS/sitemap/robots as something the platform produces;
// a full-codebase review (2026-09-12) found nothing actually generated it.
// This makes the claim true rather than deleting it: static export, one
// file, every active tenant's public site described in order.
export const dynamic = "force-static";

export async function GET() {
  const tenants = await listTenants();
  const sections: string[] = [];
  for (const t of tenants) {
    const tenant = await getTenant(t.key);
    const base = siteUrlFor(t.key);
    const orgName = tenant.brand?.orgName?.th || tenant.name;
    const orgNameEn = tenant.brand?.orgName?.en;
    const nav = await getNavItems(t.key);
    const homePath = t.key === "dga" ? "/" : publicPath(t.key, `/${t.key}`);
    const lines = [`## ${orgName}${orgNameEn ? ` (${orgNameEn})` : ""}`, ``, `- [หน้าแรก / Home](${base}${homePath})`];
    for (const n of nav) {
      if (!n.url || n.url === "#") continue;
      const url = /^https?:\/\//.test(n.url) ? n.url : `${base}${n.url.startsWith("/") ? "" : "/"}${n.url.startsWith("/") ? publicPath(t.key, n.url) : n.url}`;
      lines.push(`- [${n.label}](${url})`);
    }
    // Strapi-engine tenants also expose builder pages the nav may not link.
    if ((t.engine || "strapi") === "strapi") {
      const slugs = await listPageSlugs(t.key);
      for (const slug of slugs) {
        if (slug === "home-blocks") continue;
        lines.push(`- [${slug}](${base}${t.key === "dga" ? "" : publicPath(t.key, `/${t.key}`).replace(/\/$/, "")}/${slug})`);
      }
    }
    lines.push(`- [RSS](${base}${publicPath(t.key, `/${t.key}/feed.xml`)})`);
    sections.push(lines.join("\n"));
  }

  const body = [
    `# WebX public sites`,
    ``,
    `> Public websites of Thai government agencies and organizations, published by WebX — a multi-tenant CMS. Content is Thai-first with English counterparts where available. Each section below is one organization's site.`,
    ``,
    ...sections,
    ``,
  ].join("\n\n").replace(/\n{3,}/g, "\n\n");

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
