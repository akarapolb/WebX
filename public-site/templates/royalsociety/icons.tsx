// Shared inline-SVG icon set for the RoyalSociety tenant — used by
// Header.tsx (topbar/search/mobile-drawer), HomePage.tsx (trust strip) and
// AboutPage.tsx (mission cards).
//
// Deliberately NOT a <symbol>/<use> sprite. The app-wide root layout
// (app/layout.tsx) already renders its own global icon sprite
// (components/IconSprite.tsx, shared by every tenant) which happens to
// define several of the SAME short ids this tenant also wants — i-search,
// i-menu, i-x, i-book, i-shield — but as plain filled shapes with no
// fill="none"/stroke, a different visual language than this tenant's
// line-icon style. Since SVG `<use href="#id">` (like `getElementById`)
// resolves to the FIRST element in the document with that id, and the
// global sprite renders before this tenant's <Header>, a same-id `<use>`
// here would silently pick up the global sprite's shape instead of this
// tenant's own artwork (visually: a solid dark blob instead of an outlined
// icon — this is exactly what happened before this file existed, verified
// via a live DOM check during the Phase-11 responsive audit). Rendering
// each icon's path data directly, with no id and no <use>, sidesteps that
// collision entirely — including for any id the global sprite adds later.
//
// RS_ICON_IDS doubles as the "icon id namespace" WordPress mission-item
// content stores in acf.icon (values like "i-book"/"i-shield"/"i-service"/
// "i-people") — see AboutPage.tsx's missionIconId(), which resolves a
// WordPress-supplied string against this exact set.
import type { ReactNode } from "react";

export type RsIconId =
  | "i-search"
  | "i-chevron"
  | "i-access"
  | "i-x"
  | "i-book"
  | "i-shield"
  | "i-service"
  | "i-people"
  | "i-sun"
  | "i-moon";

const PATHS: Record<RsIconId, ReactNode> = {
  "i-search": (
    <>
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M16.5 16.5 21 21" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </>
  ),
  "i-chevron": (
    <path d="M6 7.5 10 11.5 14 7.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  ),
  "i-access": (
    <>
      <circle cx="12" cy="4" r="2" fill="currentColor" stroke="none" />
      <path d="M4 8h16M12 8v12M8 21l4-8 4 8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  "i-x": <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />,
  "i-book": (
    <>
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4Z" fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M5 4v19" fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M9 8h6M9 12h5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </>
  ),
  "i-shield": (
    <>
      <path d="M12 3l7 3v5.5c0 4.2-2.9 8.1-7 9.5-4.1-1.4-7-5.3-7-9.5V6l7-3Z" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      <path d="m8.8 12 2.2 2.2 4.2-4.4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  "i-service": (
    <>
      <rect x="5" y="4" width="14" height="17" rx="1.5" fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M9 4h6v3H9z" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      <path d="m9 13.2 2.1 2.1L15.5 11" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  "i-people": (
    <>
      <circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M3.5 20c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 6.1M17.2 14.4c2 .7 3.4 2.5 3.4 4.8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </>
  ),
  // Dark-mode toggle (Header.tsx) — same outline stroke style as the rest.
  "i-sun": (
    <>
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M12 2.5v2.6M12 18.9v2.6M4.5 12H7M17 12h2.5M6.3 6.3l1.8 1.8M15.9 15.9l1.8 1.8M6.3 17.7l1.8-1.8M15.9 8.1l1.8-1.8" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </>
  ),
  "i-moon": (
    <path d="M20.5 14.8A8.5 8.5 0 0 1 9.2 3.5a8.5 8.5 0 1 0 11.3 11.3Z" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
  ),
};

export const RS_ICON_IDS: readonly RsIconId[] = Object.keys(PATHS) as RsIconId[];

export function RsIcon({ id, className = "icon" }: { id: RsIconId; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[id]}
    </svg>
  );
}
