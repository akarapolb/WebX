import BreakingNewsBanner from "@/components/BreakingNewsBanner";

// RoyalSociety's own design (Phase 8) — separate stylesheet from both the
// gov-portal template and ORST's, scoped to this segment only (see
// app/(gov-portal)/layout.tsx and app/orst/layout.tsx for the same pattern).
//
// The 5 base stylesheets (tokens/base/layout/components/accessibility) load
// as direct parallel <link> tags, in the exact order
// public/assets/royalsociety/css/main.css's own header comment requires —
// NOT via that file's `@import` chain (TOR gap audit — PageSpeed/Core Web
// Vitals; a real Lighthouse run found this page's LCP at 2.88s, over the
// TOR's own 2.5s target, and main.css's own header comment already flagged
// exactly why: "@import ทำให้เบราว์เซอร์ต้องโหลดต่อกันเป็นทอด ๆ" — the
// browser can't even discover an @import's own sub-requests until it has
// already fetched AND parsed the importing file, serializing 5 requests
// that could otherwise run in parallel, unlike ORST's layout, which already
// loads its own equivalent stylesheets this same parallel way). main.css
// itself is unchanged and kept for reference/any other consumer, but no
// longer used here.
//
// pages/home.css and pages/about.css (the only two page-specific overrides
// that exist) used to be loaded by HomePage.tsx/AboutPage.tsx themselves —
// now that every page is just an ordered `blocks` array (Visual Builder for
// WordPress tenants), any block using either stylesheet's classes (home-hero/
// trust-strip/recommended-carousel/... or about-hero/intro-feature/timeline/
// mission-grid/org-structure/...) can in principle appear on any route, so
// both load globally here instead of per-page.
export default function RoyalSocietyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Self-hosted fonts (TOR gap audit — PageSpeed/Core Web Vitals) — see
          app/orst/layout.tsx's identical comment. */}
      <link rel="preload" href="/fonts/ibm+plex+sans+thai-400-thai.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <link rel="stylesheet" href="/fonts/fonts.css" />
      <link rel="stylesheet" href="/assets/royalsociety/css/01-tokens.css" />
      <link rel="stylesheet" href="/assets/royalsociety/css/02-base.css" />
      <link rel="stylesheet" href="/assets/royalsociety/css/03-layout.css" />
      <link rel="stylesheet" href="/assets/royalsociety/css/04-components.css" />
      <link rel="stylesheet" href="/assets/royalsociety/css/05-accessibility.css" />
      <link rel="stylesheet" href="/assets/royalsociety/css/pages/home.css" />
      <link rel="stylesheet" href="/assets/royalsociety/css/pages/about.css" />
      <BreakingNewsBanner tenant="royalsociety" />
      {children}
    </>
  );
}
