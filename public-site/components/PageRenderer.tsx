import Header from "./Header";
import Footer from "./Footer";
import BlockRenderer from "./blocks/BlockRenderer";
import { brandCssVars } from "@/lib/brandColor";
import type { NavItem, Tenant } from "@/lib/cms";

// Renders any block-driven sub-page (app/(gov-portal)/[tenant]/[slug]/page.tsx)
// — the same Header/main/Footer wrapper HomePage.tsx uses for its own
// block-driven branch, reused rather than duplicated. `homeData` is threaded
// through unchanged so live-query blocks (news-panel, awards, etc.) work
// identically to how they work on the homepage.
export default function PageRenderer({ tenant, tenantKey, blocks, homeData, navItems }: { tenant: Tenant; tenantKey: string; blocks: any[]; homeData: any; navItems?: NavItem[] }) {
  const orgName = tenant.brand?.orgName?.th || tenant.name;
  const primary = tenant.brand?.primaryColor;

  return (
    <>
      {primary && <style dangerouslySetInnerHTML={{ __html: brandCssVars(primary) }} />}
      <Header tenant={tenant} logoAlt={orgName} navItems={navItems} />
      <main id="main">
        <BlockRenderer blocks={blocks} tenant={tenantKey} homeData={homeData} />
      </main>
      <Footer tenant={tenant} />
    </>
  );
}
