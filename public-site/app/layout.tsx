import type { Metadata } from "next";
import IconSprite from "@/components/IconSprite";
import CookieConsent from "@/components/CookieConsent";
import ScrollReveal from "@/components/ScrollReveal";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "WebX public site",
  // Lets every page's generateMetadata (lib/seo.ts's pageMetadata) hand back
  // relative OG/canonical URLs and still resolve to real absolute ones.
  metadataBase: new URL(SITE_URL),
};

// Theme bootstrap — same localStorage-read-before-paint pattern as the
// original index.html, so there's no flash of the wrong theme. No tenant
// cloak needed anymore: each tenant's HTML is generated separately at build
// time, so there's nothing to re-brand after load.
//
// Bilingual EN (TOR gap) — this is also where <html lang> gets corrected for
// an /en/ route. Next's own i18n router needs per-request rendering, which
// `output: "export"` can't do (a fully static export has no request to
// inspect), and only ONE layout in the whole app may render <html>/<body> —
// nested route-group layouts can't redeclare it. So there's no way to pick
// the right `lang` at build time per static page; this runs synchronously
// in <head>, before paint, exactly like the theme read above, so there's no
// perceptible flash for a real visitor — the one honest gap is a crawler
// that doesn't execute JS at all, which would still see the source-order
// default (lang="th") baked into the static HTML. Google's own crawler does
// execute JS, so this is a defensible trade-off, not a silent one.
const THEME_BOOT = `(function(){try{
  var t = localStorage.getItem('dga-theme') || (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  document.documentElement.setAttribute('data-theme', t);
  if (location.pathname.indexOf('/en/') === 0 || location.pathname === '/en') {
    document.documentElement.setAttribute('lang', 'en');
    var sk = document.querySelector('.webx-skip-link');
    if (sk) sk.textContent = 'Skip to main content';
  }
}catch(e){}})();`;

// Scroll-reveal bootstrap — runs synchronously in <head>, before paint, same
// as the theme boot above. All it does is add one class, and only when
// motion is actually wanted; the safety guarantee (content is never
// invisible without it) lives in the CSS + ScrollReveal.tsx, not here.
const REVEAL_BOOT = `(function(){try{
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('js-reveal');
  }
}catch(e){}})();`;

// Phase 8 — this used to also load the gov-portal design's 3 CSS files
// (design-system/templates/home) globally, which was fine when every tenant
// shared one template. Now that ORST/RoyalSociety bring their own distinct
// designs, loading gov-portal's CSS here would leak into their pages too —
// each template's own route group/segment layout loads its own stylesheet
// instead (see app/(gov-portal)/layout.tsx, app/orst/layout.tsx,
// app/royalsociety/layout.tsx). Only truly global, template-agnostic bits
// stay here.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: REVEAL_BOOT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <IconSprite />
        {/* Shared across every tenant, so it can't depend on any one
           tenant's own CSS being loaded — a scoped <style> tag instead of a
           .skip-link class. Previously targeted #main, which doesn't exist
           anywhere; every tenant's actual content wrapper uses
           id="main-content" (ORST/RoyalSociety/gov-portal all agree on
           that), so this silently did nothing on every page, not just the
           one tenant (RoyalSociety) whose CSS happened to leave it visibly
           unstyled instead of just inert. Plain CSS :focus, not an
           onFocus/onBlur handler — this file is a Server Component and a
           handler would force it (and everything under it) client-side. */}
        <style>{`
          .webx-skip-link{position:absolute!important;left:8px!important;top:-48px!important;z-index:2147483647!important;
            background:#111!important;color:#fff!important;padding:10px 16px!important;border-radius:6px!important;
            font-size:14px!important;font-weight:600!important;text-decoration:none!important;transition:top .15s ease!important}
          .webx-skip-link:focus{top:8px!important}
        `}</style>
        <a href="#main-content" className="webx-skip-link">ข้ามไปยังเนื้อหาหลัก</a>
        {children}
        <CookieConsent />
        <ScrollReveal />
      </body>
    </html>
  );
}
