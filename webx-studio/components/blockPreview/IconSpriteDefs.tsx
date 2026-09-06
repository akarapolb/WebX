// Hand-ported copy of public-site/components/IconSprite.tsx's <defs> — same
// symbol ids, kept in sync by hand (matches this codebase's existing
// convention for VisualBuilder.tsx/BlockRenderer.tsx's duplicated
// interpolate()). Needed in the same document as the ported block markup in
// blocks.tsx, since <use href="#i-..."> only resolves within one document —
// this is why RealPreview.tsx portals both into the same iframe together.
export default function IconSpriteDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></symbol>
        <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></symbol>
        <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></symbol>
        <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></symbol>
        <symbol id="i-doc" viewBox="0 0 24 24"><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v4h4" /><path d="M9 13h6M9 17h6" /></symbol>
        <symbol id="i-data" viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></symbol>
        <symbol id="i-id" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M14 10h4M14 14h4M6 16c.5-1.5 1.7-2 3-2s2.5.5 3 2" /></symbol>
        <symbol id="i-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></symbol>
        <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></symbol>
        <symbol id="i-chat" viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 1 1 18 0z" /><path d="M8 11h8M8 14h5" /></symbol>
        <symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></symbol>
        <symbol id="i-moon" viewBox="0 0 24 24"><path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z" /></symbol>
        <symbol id="i-build" viewBox="0 0 24 24"><path d="M3 21h18M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></symbol>
        <symbol id="i-book" viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M19 17H6" /></symbol>
        <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z" /><path d="m9 12 2 2 4-4" /></symbol>
        <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></symbol>
        <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M16 5a3 3 0 0 1 0 6M17 20c0-2.5-1-4-2.5-4.6" /></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12 5 5 9-10" /></symbol>
        <symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M18.5 14l.9 2.4 2.6.9-2.6.9-.9 2.4-.9-2.4-2.6-.9 2.6-.9z" /></symbol>
        <symbol id="i-cal" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></symbol>
        <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></symbol>
        <symbol id="i-cards" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="14" width="8" height="6" rx="1.5" /><rect x="13" y="14" width="8" height="6" rx="1.5" /></symbol>
        <symbol id="i-list" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></symbol>
        <symbol id="i-trophy" viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" /></symbol>
      </defs>
    </svg>
  );
}

export function Icon({ id, size = "" }: { id: string; size?: "lg" | "" }) {
  return (
    <svg className={"icon" + (size ? " icon--" + size : "")} aria-hidden="true">
      <use href={"#" + id} />
    </svg>
  );
}
