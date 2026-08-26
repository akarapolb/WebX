// RoyalSociety's own design (Phase 8) — separate stylesheet from both the
// gov-portal template and ORST's, scoped to this segment only (see
// app/(gov-portal)/layout.tsx and app/orst/layout.tsx for the same pattern).
// main.css itself @imports 01-tokens.css through 05-accessibility.css in the
// order the source requires — see public/assets/royalsociety/css/main.css's
// own header comment. Page-specific overrides (home.css, about.css) are
// loaded by the individual page components that need them, not here.
export default function RoyalSocietyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700;800&family=Noto+Serif+Thai:wght@500;600;700;800&display=swap" />
      <link rel="stylesheet" href="/assets/royalsociety/css/main.css" />
      {children}
    </>
  );
}
