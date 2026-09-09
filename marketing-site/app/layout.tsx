import "./globals.css";

// Static export: only this root layout may render <html>, and it can't vary
// per page. Thai is the default; a pre-paint script flips `lang` to "en" on
// /en routes so screen readers and hyphenation get the right language
// before first paint (same approach public-site uses for its /en tree).
const LANG_BOOT = "(function(){var p=location.pathname;if(p==='/en'||p==='/en/'||p.indexOf('/en/')===0){document.documentElement.lang='en'}})();";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/fonts/fonts.css" />
        <link rel="preload" as="font" type="font/woff2" href="/fonts/ibm+plex+sans+thai-700-thai.woff2" crossOrigin="" />
        <link rel="preload" as="font" type="font/woff2" href="/fonts/ibm+plex+sans+thai-400-latin.woff2" crossOrigin="" />
        <script dangerouslySetInnerHTML={{ __html: LANG_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
