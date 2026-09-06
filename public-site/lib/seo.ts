// Real per-page Open Graph / Twitter Card metadata (TOR gap audit — every
// page on both tenants shared one static `<title>WebX public site</title>`
// from the root layout, no description, no OG tags at all; a shared link
// pasted into LINE/Facebook/Twitter had nothing real to show). Server-only
// (used from generateMetadata, never sent to the client bundle).
import type { Metadata } from "next";
import type { Tenant } from "./cms";

// Build-time base URL for resolving relative OG/canonical URLs — same
// plain-env-var convention as STRAPI_URL/WORDPRESS_URL (lib/cms.ts), just
// not inlined into the client bundle since metadataBase is server-only.
//
// orst and royalsociety are two genuinely different real-world domains
// (www.orst.go.th / www.royalsociety.go.th), not one site with two paths —
// so a single global SITE_URL would resolve BOTH tenants' relative OG/
// hreflang/RSS-alternate URLs against whichever one domain happens to be
// configured, leaking that domain into the other tenant's meta tags. Each
// tenant gets its own optional env var; PUBLIC_SITE_URL stays as a shared
// fallback (fine for a single-domain staging setup) and the dev default.
export const SITE_URL = (process.env.PUBLIC_SITE_URL || "http://localhost:3100").replace(/\/$/, "");
const TENANT_SITE_URL: Record<string, string | undefined> = {
  orst: process.env.PUBLIC_SITE_URL_ORST,
  royalsociety: process.env.PUBLIC_SITE_URL_ROYALSOCIETY,
};
export function siteUrlFor(tenant: string): string {
  return (TENANT_SITE_URL[tenant] || SITE_URL).replace(/\/$/, "");
}

const TENANT_LOCALE: Record<string, string> = { orst: "th_TH", royalsociety: "th_TH" };
const OG_LOCALE: Record<"th" | "en", string> = { th: "th_TH", en: "en_US" };

// Bilingual EN (TOR gap) — a page's TH/EN counterpart path, when one exists.
// Only home/about/contact/services are bilingual on orst/royalsociety (see
// the /en/ routes' own comments) — `hreflangPath` is omitted otherwise, so a
// Thai-only page emits no alternate-language tag at all rather than a
// broken one.
const BILINGUAL_SLUGS = new Set(["home", "about", "contact", "services"]);
function counterpartPath(tenant: string, path: string, locale: "th" | "en"): string | undefined {
  const slug = path === `/${tenant}` || path === `/en/${tenant}` ? "home" : path.replace(new RegExp(`^/(en/)?${tenant}/`), "");
  if (!BILINGUAL_SLUGS.has(slug)) return undefined;
  if (locale === "th") return slug === "home" ? `/en/${tenant}` : `/en/${tenant}/${slug}`;
  return slug === "home" ? `/${tenant}` : `/${tenant}/${slug}`;
}

export function pageMetadata(opts: {
  tenant: string;
  tenantData: Tenant | null;
  path: string; // e.g. "/orst" or "/orst/about" or "/en/orst/about"
  /** Real WP title/excerpt/imageUrl when available (getWpPage/getWpEntries) */
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  /** Human fallback title when `title` is empty/placeholder (e.g. the real
   * nav label for this page, from getNavItems — always present, never
   * needs its own authoring). */
  fallbackTitle: string;
  /** Bilingual EN (TOR gap) — defaults to "th" for every existing caller. */
  locale?: "th" | "en";
}): Metadata {
  const locale = opts.locale || "th";
  const orgName = opts.tenantData?.brand?.orgName?.[locale] || opts.tenantData?.brand?.orgName?.th || opts.tenantData?.name || "";
  const title = (opts.title || "").trim() || opts.fallbackTitle;
  const fullTitle = orgName ? `${title} | ${orgName}` : title;
  const description = (opts.description || "").trim() || (orgName ? `${opts.fallbackTitle} — ${orgName}` : opts.fallbackTitle);
  const image = opts.imageUrl || opts.tenantData?.brand?.logoUrl || null;
  const altPath = counterpartPath(opts.tenant, opts.path, locale);
  const base = siteUrlFor(opts.tenant);

  return {
    title: fullTitle,
    description,
    alternates: {
      // RSS feed discovery (TOR gap audit — no feed existed at all, see
      // lib/rss.ts) — every page on a tenant points at that tenant's one feed.
      // Absolute (not resolved against the shared root layout's metadataBase,
      // which can't vary per tenant) so this stays correct for whichever
      // tenant is rendering, once each has its own real domain configured.
      types: { "application/rss+xml": `${base}/${opts.tenant}/feed.xml` },
      // Bilingual EN (TOR gap) — a real hreflang pair only where a genuine
      // translated counterpart exists; omitted entirely otherwise.
      languages: altPath ? { [locale === "th" ? "en" : "th"]: `${base}${altPath}` } : undefined,
    },
    openGraph: {
      title: fullTitle,
      description,
      url: `${base}${opts.path}`,
      siteName: orgName,
      locale: locale === "en" ? OG_LOCALE.en : (TENANT_LOCALE[opts.tenant] || "th_TH"),
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: fullTitle,
      description,
      images: image ? [image] : undefined,
    },
  };
}
