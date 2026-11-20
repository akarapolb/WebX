import Header from "./Header";
import Footer from "./Footer";
import Hero from "./Hero";
import Stats from "./Stats";
import Services from "./Services";
import Highlights from "./Highlights";
import NewsPanels from "./NewsPanels";
import VideoChannel from "./VideoChannel";
import Awards from "./Awards";
import Faqs from "./Faqs";
import Featured from "./Featured";
import BlockRenderer from "./blocks/BlockRenderer";
import { getHomeData, getNavItems, getPage, getTenant } from "@/lib/cms";
import { brandCssVars } from "@/lib/brandColor";
import { homeHref, t, type Locale } from "@/lib/i18n";

// One designated slug per tenant renders AT the homepage route instead of
// as a sub-page under [tenant]/[slug] — see that route for the rest of a
// tenant's pages.
const BLOCK_PAGE_SLUG = "home-blocks";

// Shared by app/page.tsx (the default "dga" tenant, served at /) and
// app/[tenant]/page.tsx (every other tenant, one static page each at build
// time — see generateStaticParams there). This is the actual proof: the
// same CMS-driven sections cms.js renders client-side today, rendered here
// server-side/at-build-time instead, with real per-tenant data baked in.
/** <title>, description and TH/EN alternates for a tenant homepage (from its home-blocks page, else the tenant name). */
export async function homeMetadata(tenantKey: string, locale: Locale = "th") {
  const tenant = await getTenant(tenantKey);
  const page = tenant.engine !== "wordpress" ? await getPage(tenantKey, BLOCK_PAGE_SLUG, locale) : null;
  return {
    title: page?.title || tenant.brand?.orgName?.[locale] || tenant.name,
    description: page?.seoDescription || undefined,
    alternates: { canonical: homeHref(tenantKey, locale), languages: { th: homeHref(tenantKey, "th"), en: homeHref(tenantKey, "en") } },
  };
}

export default async function HomePage({ tenantKey, locale = "th" }: { tenantKey: string; locale?: Locale }) {
  // Sequential, not Promise.all: getHomeData needs to know the tenant's own
  // engine (Phase 6) before it knows which backend to fetch content from.
  // Build-time static generation, not a user-facing request — fine to pay
  // the extra round trip here. getTenant() throws rather than returning
  // null on a Strapi outage (2026-09-12 audit fix) — this used to silently
  // fall back to a hardcoded DGA-branded tenant record, which could render
  // a completely different agency's site under DGA's own name/logo/colors
  // during a transient outage, with the build still reporting success.
  const tenantData = await getTenant(tenantKey);
  const data = await getHomeData(tenantKey, tenantData.engine, locale);
  // Strapi-only for now (page.page has no WordPress equivalent) — a
  // wordpress-engine tenant just never matches and falls through below.
  const page = tenantData.engine !== "wordpress" ? await getPage(tenantKey, BLOCK_PAGE_SLUG, locale) : null;
  const navItems = await getNavItems(tenantKey, locale);
  const tenant = tenantData;
  const orgName = tenant.brand?.orgName?.[locale] || tenant.brand?.orgName?.th || tenant.name;
  const primary = tenant.brand?.primaryColor;

  return (
    <>
      {primary && <style dangerouslySetInnerHTML={{ __html: brandCssVars(primary) }} />}
      <Header tenant={tenant} logoAlt={orgName + " — " + t("home", locale)} navItems={navItems} locale={locale} path={homeHref(tenantKey, locale)} />
      {page?.blocks?.length ? (
        // <main> carries no layout-relevant CSS for this template (verified),
        // so nesting the full stack here — where the legacy path splits
        // Highlights (inside <main>) from Stats-through-Featured (outside
        // it) — renders identically while keeping this branch a single call.
        <main id="main">
          <BlockRenderer blocks={page.blocks} tenant={tenantKey} homeData={data} locale={locale} />
        </main>
      ) : (
        <>
          <main id="main">
            <Hero home={data.home} />
            <Services items={data.services} />
            <Highlights items={data.banners} />
          </main>
          <Stats />
          <NewsPanels articles={data.articles} />
          <VideoChannel items={data.videos} />
          <Awards items={data.awards} />
          <Faqs items={data.faqs} />
          <Featured home={data.home} />
        </>
      )}
      <Footer tenant={tenant} locale={locale} />
    </>
  );
}
