import Header from "@/templates/orst/Header";
import Footer from "@/templates/orst/Footer";
import Blocks from "@/templates/orst/Blocks";
import homeData from "@/templates/orst/content/home.json";
import { getWpPage, getTenant, getNavItems, getCustomIcons } from "@/lib/cms";
import { resolveSources } from "@/lib/blockSource";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const [wpPage, tenant] = await Promise.all([getWpPage("orst", "home"), getTenant("orst")]);
  return pageMetadata({
    tenant: "orst", tenantData: tenant, path: "/orst",
    title: wpPage?.title, description: wpPage?.excerpt, imageUrl: wpPage?.imageUrl,
    fallbackTitle: "หน้าแรก",
  });
}

// ORST's homepage — full decomposition into blocks (see Blocks.tsx's
// home-hero/media-tabs/news-tabs/service-hub/logo-marquee, added
// specifically for this page, plus reused feature-list/card-grid/faq).
// Same pattern as app/orst/[page]/page.tsx: prefer WordPress-authored
// blocks (the Visual Builder's own write path — see wordpress/mu-plugins/
// acf-fields.php's group_page_layout), falling back to the repo JSON for
// one release after the seed migration. HomePage.tsx/HomeInteractive.tsx's
// MediaTabs/NewsEventsTabs/ScrollButton are reused unchanged inside
// Blocks.tsx's new block components — nothing here needs a hero/faqs prop
// anymore now that both are ordinary blocks (home-hero, and faq bound to
// the same live wp:faq source dictionary's own faq block already uses).
export default async function Page() {
  const wpPage = await getWpPage("orst", "home");
  if (!wpPage?.blocks?.length) {
    console.warn("[orst/home] no WordPress-authored blocks — falling back to static content/home.json");
  }
  let blocks = wpPage?.blocks?.length ? wpPage.blocks : (homeData as any).blocks;
  blocks = await resolveSources(blocks, "orst");

  const [tenant, navItems] = await Promise.all([getTenant("orst"), getNavItems("orst")]);
  const customIcons = await getCustomIcons("orst");
  return (
    <>
      <a className="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
      <Header active="home" navItems={navItems} />
      <main id="main-content">
        <div id="app-content">
          <Blocks blocks={blocks} customIcons={customIcons} />
        </div>
      </main>
      <Footer tenant={tenant} />
    </>
  );
}
