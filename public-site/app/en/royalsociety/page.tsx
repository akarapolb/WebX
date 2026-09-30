import Header from "@/templates/royalsociety/Header";
import Footer from "@/templates/royalsociety/Footer";
import Blocks from "@/templates/royalsociety/Blocks";
import homeDataEn from "@/templates/royalsociety/content/en/home.json";
import { getWpPage, getTenant, getNavItems, getCustomIcons } from "@/lib/cms";
import { resolveSources } from "@/lib/blockSource";
import { pageMetadata } from "@/lib/seo";

// Bilingual EN (TOR gap) — English counterpart of app/royalsociety/page.tsx.
// Same "WP-authored blocks_en wins over static JSON" precedent as
// app/en/orst/page.tsx.
export async function generateMetadata() {
  const tenant = await getTenant("royalsociety");
  return pageMetadata({
    tenant: "royalsociety", tenantData: tenant, path: "/en/royalsociety", locale: "en",
    title: (homeDataEn as any).title, fallbackTitle: "Home",
  });
}

export default async function Page() {
  const wpPage = await getWpPage("royalsociety", "home");
  let blocks = wpPage?.blocksEn?.length ? wpPage.blocksEn : (homeDataEn as any).blocks;
  blocks = await resolveSources(blocks, "royalsociety", "en");

  const [tenant, navItems] = await Promise.all([getTenant("royalsociety"), getNavItems("royalsociety", "en")]);
  const customIcons = await getCustomIcons("royalsociety");
  return (
    <>
      <Header active="home" navItems={navItems} locale="en" />
      <main id="main-content">
        <div id="app-content">
          <Blocks blocks={blocks} locale="en" customIcons={customIcons} />
        </div>
      </main>
      <Footer tenant={tenant} locale="en" />
    </>
  );
}
