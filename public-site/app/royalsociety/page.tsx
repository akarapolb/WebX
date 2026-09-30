import Header from "@/templates/royalsociety/Header";
import Footer from "@/templates/royalsociety/Footer";
import Blocks from "@/templates/royalsociety/Blocks";
import homeData from "@/templates/royalsociety/content/home.json";
import { getWpPage, getTenant, getNavItems, getCustomIcons } from "@/lib/cms";
import { resolveSources } from "@/lib/blockSource";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const [wpPage, tenant] = await Promise.all([getWpPage("royalsociety", "home"), getTenant("royalsociety")]);
  return pageMetadata({
    tenant: "royalsociety", tenantData: tenant, path: "/royalsociety",
    title: wpPage?.title, description: wpPage?.excerpt, imageUrl: wpPage?.imageUrl,
    fallbackTitle: "หน้าแรก",
  });
}

// RoyalSociety's homepage — full decomposition into blocks (Visual Builder
// for WordPress tenants, "RoyalSociety parity" phase), same pattern as
// app/orst/page.tsx: prefer WordPress-authored blocks over the static
// content/home.json this page was originally seeded from, falling back for
// one release after the seed migration (wordpress/seed-royalsociety-
// layout.mjs) in case an environment hasn't been migrated yet.
export default async function Page() {
  const wpPage = await getWpPage("royalsociety", "home");
  if (!wpPage?.blocks?.length) {
    console.warn("[royalsociety/home] no WordPress-authored blocks — falling back to static content/home.json");
  }
  let blocks = wpPage?.blocks?.length ? wpPage.blocks : (homeData as any).blocks;
  blocks = await resolveSources(blocks, "royalsociety");

  const [tenant, navItems] = await Promise.all([getTenant("royalsociety"), getNavItems("royalsociety")]);
  const customIcons = await getCustomIcons("royalsociety");
  return (
    <>
      {/* Real Lighthouse run (TOR gap audit — PageSpeed/Core Web Vitals)
          found this page's actual LCP element is the hero slider's first
          background image, scoring LCP=3.03s (over the TOR's own 2.5s
          threshold) before this — preloading it (this page specifically,
          not the shared layout, so /about /contact /etc. don't waste
          bandwidth preloading an image they never render) lets the browser
          fetch it before CSS/JS discovery would otherwise find it. */}
      <link rel="preload" href="/assets/royalsociety/images/BG-01.webp" as="image" type="image/webp" fetchPriority="high" />
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
