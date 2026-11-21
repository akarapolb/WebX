// Stylesheets for the dgahub template, loaded by app/dgahub/layout.tsx and
// app/en/dgahub/layout.tsx only, so they never leak into other templates.
// IBM Plex Sans Thai is self-hosted (public/fonts, shared with ORST).
// Light/dark: the visitor's saved choice (Header's switch), else the system
// setting. Runs before first paint so the page never flashes the wrong theme.
const THEME_SCRIPT = `try{var t=localStorage.getItem("dh-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function DgahubHead() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <link rel="preload" href="/fonts/ibm+plex+sans+thai-400-thai.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <link rel="stylesheet" href="/fonts/fonts.css" />
      <link rel="stylesheet" href="/assets/dgahub/site.css" />
    </>
  );
}
