import OrstIconSprite from "@/templates/orst/OrstIconSprite";
import BreakingNewsBanner from "@/components/BreakingNewsBanner";

// Bilingual EN (TOR gap) — the English counterpart of app/orst/layout.tsx.
// A separate route tree (app/en/orst) doesn't inherit app/orst/layout.tsx
// (Next.js layouts only nest along their own folder path), so this
// duplicates that file's CSS/icon-sprite/banner wiring verbatim rather than
// sharing it — matching this codebase's own established preference for
// per-tenant duplication over cross-cutting abstraction (see that file's
// own header comment).
export default function EnOrstLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Self-hosted fonts — see app/orst/layout.tsx's identical comment. */}
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
