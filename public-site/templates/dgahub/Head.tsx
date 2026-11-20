// Stylesheets for the dgahub template, loaded by app/dgahub/layout.tsx and
// app/en/dgahub/layout.tsx only, so they never leak into other templates.
// IBM Plex Sans Thai is self-hosted (public/fonts, shared with ORST).
export default function DgahubHead() {
  return (
    <>
      <link rel="preload" href="/fonts/ibm+plex+sans+thai-400-thai.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <link rel="stylesheet" href="/fonts/fonts.css" />
      <link rel="stylesheet" href="/assets/dgahub/site.css" />
    </>
  );
}
