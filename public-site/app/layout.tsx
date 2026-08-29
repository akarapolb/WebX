import type { Metadata } from "next";
import IconSprite from "@/components/IconSprite";
import CookieConsent from "@/components/CookieConsent";

export const metadata: Metadata = {
  title: "WebX public site",
};

// Theme bootstrap — same localStorage-read-before-paint pattern as the
// original index.html, so there's no flash of the wrong theme. No tenant
// cloak needed anymore: each tenant's HTML is generated separately at build
// time, so there's nothing to re-brand after load.
const THEME_BOOT = `(function(){try{
  var t = localStorage.getItem('dga-theme') || (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  document.documentElement.setAttribute('data-theme', t);
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
      </body>
    </html>
  );
}
