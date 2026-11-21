// dgahub template — one page of the Thailand Digital Government Hub. Everything
// shown comes from WebX for tenant "dgahub": the page's blocks, the menu, the
// footer columns, news, FAQ and datasets. Routes: app/dgahub (Thai) and
// app/en/dgahub (English). Search, open-data files, news, sitemap, 404, share
// image, dark mode and the offline note are WebX site-kit features
// (lib/site/*, components/site/*); this template only adds the design.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenant, getPage, getNavItems, getHomeData, getDatasets, listPageSlugs, type Locale } from "@/lib/cms";
import { defineSite } from "@/lib/site/config";
import { siteMetadata as kitMetadata } from "@/lib/site/metadata";
import { localizeHref, otherLocaleHref } from "@/lib/i18n";
import Header from "./Header";
import Footer from "./Footer";
import Blocks from "./Blocks";
import PreviewBridge from "./PreviewBridge";
import { accentVars } from "./theme";
import { jsonForScript } from "@/lib/sanitize";

/** The hub as a WebX site-kit site. Social-share image source:
 *  tools/webx/og-dgahub.html in DGA-WebPublic. */
export const site = defineSite({ tenant: "dgahub", homeSlug: "home-blocks", ogImage: "/assets/dgahub/og.png", icon: "/assets/dgahub/icon.svg" });

export const TENANT = site.tenant;
export const HOME_SLUG = site.homeSlug;
export const { base, pathOf, searchPath } = site;

/** Paths the template owns itself; a CMS page can't use these slugs. */
const RESERVED = new Set([HOME_SLUG, "preview", "search", "news", "data", "404"]);

export async function slugs(locale: Locale) {
  return (await listPageSlugs(TENANT, locale)).filter((s) => !RESERVED.has(s)).map((slug) => ({ slug }));
}

/** Draft preview for WebX Studio (PreviewBridge.tsx): the hub's real header,
 *  footer and styles around blocks Studio posts in. Not indexed, not linked. */
export async function Preview({ locale }: { locale: Locale }) {
  const [data, datasets] = await Promise.all([getHomeData(TENANT, site.engine, locale), getDatasets(TENANT, locale)]);
  return (
    <Shell locale={locale} path={base(locale) + "/preview"}>
      <PreviewBridge locale={locale} tenant={TENANT} home={base(locale)} datasets={datasets} articles={data.articles || []} faqs={data.faqs || []} />
    </Shell>
  );
}

export function siteMetadata(locale: Locale, slug?: string): Promise<Metadata> {
  return kitMetadata(site, locale, slug);
}

/** Header, prototype note, footer and brand colours around any page of the hub
 *  (CMS pages, search). `path` is the page's own path, used for the menu's
 *  current item and the TH/EN switch. */
export async function Shell({ locale, path, otherHref, children }: { locale: Locale; path: string; otherHref?: string; children: React.ReactNode }) {
  const [tenant, home, nav, datasets] = await Promise.all([
    getTenant(TENANT), getPage(TENANT, HOME_SLUG, locale), getNavItems(TENANT, locale), getDatasets(TENANT, locale),
  ]);
  const L = (v?: { th?: string; en?: string }) => (v ? v[locale] || v.th || "" : "");
  const siteName = String(home?.title || tenant?.name || TENANT);
  const owner = L(tenant?.brand?.orgName) || tenant?.name || "";
  const links = nav.map((n) => {
    const href = localizeHref(n.url, locale);
    return { label: n.label, href, newTab: n.openNewTab, current: href === path };
  });
  const updated = datasets.map((d) => d.updatedOn).filter(Boolean).sort().at(-1);
  const en = locale === "en";
  const org = {
    "@context": "https://schema.org", "@type": "GovernmentOrganization", name: owner,
    telephone: tenant?.contact?.phone, address: L(tenant?.contact?.address),
  };

  return (
    <div className="dgahub" style={accentVars(tenant?.brand?.primaryColor) as React.CSSProperties | undefined}>
      <Header locale={locale} siteName={siteName} owner={owner} home={base(locale)} links={links}
        otherHref={otherHref || otherLocaleHref(path, locale)} searchHref={searchPath(locale)} />
      <div className="prototype-note" role="note">
        {en ? "Prototype for review: content and figures are not final." : "ต้นแบบเพื่อการพิจารณา เนื้อหาและตัวเลขยังไม่ใช่ฉบับจริง"}
      </div>
      <main id="main-content" tabIndex={-1}>{children}</main>
      <Footer tenant={tenant || { key: TENANT, name: TENANT }} locale={locale} updated={updated} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(org) }} />
    </div>
  );
}

export default async function Site({ locale, slug }: { locale: Locale; slug?: string }) {
  const isHome = !slug || slug === HOME_SLUG;
  const [page, data, datasets] = await Promise.all([
    getPage(TENANT, slug || HOME_SLUG, locale),
    getHomeData(TENANT, site.engine, locale),
    getDatasets(TENANT, locale),
  ]);
  if (!page?.blocks?.length) notFound();
  return (
    <Shell locale={locale} path={pathOf(locale, slug)}>
      <Blocks blocks={page.blocks} isHome={isHome} locale={locale} tenant={TENANT} home={base(locale)}
        datasets={datasets} articles={data.articles} faqs={data.faqs} />
    </Shell>
  );
}
