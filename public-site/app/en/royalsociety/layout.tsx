import BreakingNewsBanner from "@/components/BreakingNewsBanner";

// Bilingual EN (TOR gap) — the English counterpart of
// app/royalsociety/layout.tsx. A separate route tree (app/en/royalsociety)
// doesn't inherit that file (Next.js layouts only nest along their own
// folder path), so this duplicates its CSS/banner wiring verbatim rather
// than sharing it — see that file's own header comment for why duplication
// is the established pattern here.
export default function EnRoyalSocietyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Self-hosted fonts — see app/orst/layout.tsx's identical comment. */}
      <link rel="preload" href="/fonts/ibm+plex+sans+thai-400-thai.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <link rel="stylesheet" href="/fonts/fonts.css" />
      {/* Parallel <link> tags instead of main.css's @import chain — see
          app/royalsociety/layout.tsx's identical comment. */}
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
