import Header from "@/templates/royalsociety/Header";
import Footer from "@/templates/royalsociety/Footer";
import PreviewBridgeRoyalSociety from "@/templates/_builder/PreviewBridgeRoyalSociety";
import { getTenant, getThemeGoogleFamilies } from "@/lib/cms";
import { googleFontsPreviewHref } from "@/lib/theme";

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
  const [tenant, families] = await Promise.all([getTenant("royalsociety"), getThemeGoogleFamilies("royalsociety")]);
  const fontsHref = googleFontsPreviewHref(families);
  return (
    <>
      {/* The editor's preview loads a picked Google font straight from Google (see googleFontsPreviewHref). */}
      {fontsHref && <link rel="stylesheet" href={fontsHref} />}
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
