import Header from "@/templates/royalsociety/Header";
import Footer from "@/templates/royalsociety/Footer";
import PreviewBridgeRoyalSociety from "@/templates/_builder/PreviewBridgeRoyalSociety";
import { getTenant } from "@/lib/cms";

// The Visual Builder's preview harness for RoyalSociety — see
// app/orst/preview/page.tsx (the sibling this mirrors) and PreviewBridge.tsx
// for the protocol and rationale.
//
// Not a real page: never linked from RoyalSociety's own nav, excluded from
// the sitemap (see app/royalsociety/[page]/page.tsx's generateStaticParams,
// which does not include "preview"), and marked noindex below. Reserve the
// "preview" slug — no RoyalSociety content page may use it.
export const metadata = { robots: { index: false, follow: false } };

export default async function RoyalSocietyBuilderPreview() {
  const tenant = await getTenant("royalsociety");
  return (
    <>
      <Header active="" />
      <main id="main-content">
        <div id="app-content">
          <PreviewBridgeRoyalSociety />
        </div>
      </main>
      <Footer tenant={tenant} />
    </>
  );
}
