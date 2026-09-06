import OrstIconSprite from "@/templates/orst/OrstIconSprite";
import BreakingNewsBanner from "@/components/BreakingNewsBanner";

// ORST's own design (Phase 11 full visual redesign) — separate stylesheet +
// icon sprite from the gov-portal template, scoped to this segment only
// (see app/(gov-portal)/layout.tsx for the same pattern).
//
// Load order: tokens -> base -> blocks -> components -> pages/*. Each layer
// is free to override an earlier one on shared classes (components.css
// narrows .header-inner's max-width past base.css's .container default;
// pages/*.css narrow .section/.content-card per page). The three pages/*.css
// files are loaded here (globally, for every /orst/* route) rather than
// per-page: they're small, page-scoped by class name already (e.g.
// .knowledge-hero only exists in KnowledgePage.tsx's markup), and loading
// them globally is what the previous phase's layout comment described but
// the actual <link> tags never did — this fixes that gap. (Found while
// redesigning: HomePage/ContactPage/KnowledgePage's own file comments claim
// their classes come straight from these stylesheets, but nothing linked
// them, so none of that page-specific CSS was ever applied. See task report.)
export default function OrstLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Self-hosted fonts (TOR gap audit — PageSpeed/Core Web Vitals; see
          scripts/fetch-fonts.mjs's own comment) — was a render-blocking
          cross-origin request to Google's own CDN on every page load,
          now a same-origin static file. Preloading the one weight/subset
          every page actually renders text in immediately (400 Thai) avoids
          a flash of invisible/fallback text on first paint. */}
      <link rel="preload" href="/fonts/ibm+plex+sans+thai-400-thai.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <link rel="stylesheet" href="/fonts/fonts.css" />
      <link rel="stylesheet" href="/assets/orst/css/tokens.css" />
      <link rel="stylesheet" href="/assets/orst/css/base.css" />
      <link rel="stylesheet" href="/assets/orst/css/blocks.css" />
      <link rel="stylesheet" href="/assets/orst/css/components.css" />
      <link rel="stylesheet" href="/assets/orst/css/pages/home.css" />
      <link rel="stylesheet" href="/assets/orst/css/pages/contact.css" />
      <link rel="stylesheet" href="/assets/orst/css/pages/knowledge.css" />
      <OrstIconSprite />
      <BreakingNewsBanner tenant="orst" />
      {children}
    </>
  );
}
