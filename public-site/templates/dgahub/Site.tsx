// dgahub template — one page of the Thailand Digital Government Hub. Everything
// shown comes from WebX for tenant "dgahub": the page's blocks, the menu, the
// footer columns, news, FAQ and datasets. Routes: app/dgahub (Thai) and
// app/en/dgahub (English).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenant, getPage, getNavItems, getHomeData, getDatasets, listPageSlugs, type Locale } from "@/lib/cms";
import { localizeHref, otherLocaleHref } from "@/lib/i18n";
import Header from "./Header";
import Footer from "./Footer";
import Blocks from "./Blocks";
import { accentVars } from "./theme";

export const TENANT = "dgahub";
export const HOME_SLUG = "home-blocks";

const base = (locale: Locale) => (locale === "en" ? "/en/" : "/") + TENANT;
const pathOf = (locale: Locale, slug?: string) => base(locale) + (slug && slug !== HOME_SLUG ? "/" + slug : "");

export async function slugs(locale: Locale) {
  return (await listPageSlugs(TENANT, locale)).filter((s) => s !== HOME_SLUG).map((slug) => ({ slug }));
}

export async function siteMetadata(locale: Locale, slug?: string): Promise<Metadata> {
  const [page, home, tenant] = await Promise.all([
    getPage(TENANT, slug || HOME_SLUG, locale), getPage(TENANT, HOME_SLUG, locale), getTenant(TENANT),
  ]);
  const siteName = String(home?.title || tenant?.name || TENANT);
  const isHome = !slug || slug === HOME_SLUG;
  const th = pathOf("th", slug), en = pathOf("en", slug);
  return {
    title: isHome ? siteName : `${page?.title || slug} · ${siteName}`,
    description: page?.seoDescription || undefined,
    alternates: { canonical: locale === "en" ? en : th, languages: { th, en } },
    openGraph: { siteName, locale: locale === "en" ? "en_GB" : "th_TH", type: "website" },
  };
}

export default async function Site({ locale, slug }: { locale: Locale; slug?: string }) {
  const isHome = !slug || slug === HOME_SLUG;
  const [tenant, page, home, nav, data, datasets] = await Promise.all([
    getTenant(TENANT),
    getPage(TENANT, slug || HOME_SLUG, locale),
    isHome ? Promise.resolve(null) : getPage(TENANT, HOME_SLUG, locale),
    getNavItems(TENANT, locale),
    getHomeData(TENANT, "strapi", locale),
    getDatasets(TENANT, locale),
  ]);
  if (!page?.blocks?.length) notFound();

  const path = pathOf(locale, slug);
  const L = (v?: { th?: string; en?: string }) => (v ? v[locale] || v.th || "" : "");
  const siteName = String((isHome ? page : home)?.title || tenant?.name || TENANT);
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
      <Header locale={locale} siteName={siteName} owner={owner} home={base(locale)} links={links} otherHref={otherLocaleHref(path, locale)} />
      <div className="prototype-note" role="note">
        {en ? "Prototype for review: content and figures are not final." : "ต้นแบบเพื่อการพิจารณา เนื้อหาและตัวเลขยังไม่ใช่ฉบับจริง"}
      </div>
      <main id="main-content" tabIndex={-1}>
        <Blocks blocks={page.blocks} isHome={isHome} locale={locale} tenant={TENANT} home={base(locale)}
          datasets={datasets} articles={data.articles} faqs={data.faqs} />
      </main>
      <Footer tenant={tenant || { key: TENANT, name: TENANT }} locale={locale} updated={updated} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org).replace(/</g, "\\u003c") }} />
    </div>
  );
}
