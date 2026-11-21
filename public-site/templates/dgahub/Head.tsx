// Stylesheets for the dgahub template, loaded by app/dgahub/layout.tsx and
// app/en/dgahub/layout.tsx only, so they never leak into other templates.
// IBM Plex Sans Thai is self-hosted (public/fonts, shared with ORST).
// Light/dark: WebX site-kit theme boot (lib/site/theme.ts) with the hub's own
// storage key; Header's switch writes it.
import { themeBootScript } from "@/lib/site/theme";

export const THEME_KEY = "dh-theme";
const THEME_SCRIPT = themeBootScript(THEME_KEY);

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
