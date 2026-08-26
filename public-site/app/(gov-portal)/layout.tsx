// Phase 8 — the gov-portal design's CSS, scoped to this route group (DGA at
// "/" plus every other gov-portal-template tenant at "/[tenant]") instead of
// the app-wide root layout, so it doesn't leak into ORST/RoyalSociety's own
// pages. A route group's parentheses don't appear in the URL.
export default function GovPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&family=Ubuntu:wght@300;400;500;700&display=swap" />
      <link rel="stylesheet" href="/assets/design-system.css" />
      <link rel="stylesheet" href="/assets/templates.css" />
      <link rel="stylesheet" href="/assets/home.css" />
      {children}
    </>
  );
}
