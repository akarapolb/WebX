import Header from "@/templates/orst/Header";
import Footer from "@/templates/orst/Footer";
import PreviewBridge from "@/templates/_builder/PreviewBridge";
import { getTenant, getNavItems } from "@/lib/cms";

// The Visual Builder's preview harness for ORST — see PreviewBridge.tsx for
// the protocol and rationale. Sits under app/orst/layout.tsx, so it
// inherits ORST's real CSS chain and icon sprite in production load order;
// that's the entire reason this route exists instead of porting Blocks.tsx
// into webx-studio.
//
// Not a real page: never linked from ORST's own nav, excluded from the
// sitemap (see app/orst/[page]/page.tsx's generateStaticParams, which does
// not include "preview"), and marked noindex below. Reserve the "preview"
// slug — no ORST content page may use it (app/orst/[page]/page.tsx's
// generateStaticParams enumerating a page named "preview" would collide
// with this route).
export const metadata = { robots: { index: false, follow: false } };

export default async function OrstBuilderPreview() {
  const [tenant, navItems] = await Promise.all([getTenant("orst"), getNavItems("orst")]);
  return (
    <>
      <Header active="" navItems={navItems} />
      <main id="main-content">
        <div id="app-content">
          <PreviewBridge />
        </div>
      </main>
      <Footer tenant={tenant} />
    </>
  );
}
