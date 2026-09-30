import Header from "@/templates/orst/Header";
import Footer from "@/templates/orst/Footer";
import Blocks from "@/templates/orst/Blocks";
import homeDataEn from "@/templates/orst/content/en/home.json";
import { getWpPage, getTenant, getNavItems, getCustomIcons } from "@/lib/cms";
import { resolveSources } from "@/lib/blockSource";
import { pageMetadata } from "@/lib/seo";

// Bilingual EN (TOR gap) — English counterpart of app/orst/page.tsx.
// Prefers the WordPress-authored English layout (acf.blocks_en, seeded by
// wordpress/seed-en-content-blocks.mjs) over the static
// content/en/home.json this page was authored from — same "WP wins over
// static JSON" precedent as the Thai route, just for the "_en" field
// instead of "blocks". Falls back to the static file if the page hasn't
// been (re-)migrated in a given environment.
export async function generateMetadata() {
  const tenant = await getTenant("orst");
  return pageMetadata({
    tenant: "orst", tenantData: tenant, path: "/en/orst", locale: "en",
    title: (homeDataEn as any).title, description: (homeDataEn as any).description,
    fallbackTitle: "Home",
  });
}

export default async function Page() {
  const wpPage = await getWpPage("orst", "home");
  let blocks = wpPage?.blocksEn?.length ? wpPage.blocksEn : (homeDataEn as any).blocks;
  blocks = await resolveSources(blocks, "orst", "en");

  const [tenant, navItems] = await Promise.all([getTenant("orst"), getNavItems("orst", "en")]);
  const customIcons = await getCustomIcons("orst");
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
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
