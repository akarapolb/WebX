// Ported verbatim (same symbol ids/paths) from the ORST static site's own
// icon sprite — assets/js/components.js's `icons` string. Kept separate
// from components/IconSprite.tsx (the gov-portal template's sprite) since
// the two designs' icon sets are unrelated and some ids overlap with
// different artwork (e.g. "i-file", "i-shield", "i-people").
export default function OrstIconSprite() {
  return (
    <svg aria-hidden="true" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
      <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-4.2-4.2" /></symbol>
      <symbol id="i-book" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" /></symbol>
      <symbol id="i-eye" viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></symbol>
      <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></symbol>
      <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></symbol>
      <symbol id="i-user" viewBox="0 0 24 24"><path d="M20 21a8 8 0 1 0-16 0" /><circle cx="12" cy="7" r="4" /></symbol>
      <symbol id="i-access" viewBox="0 0 24 24"><circle cx="12" cy="4" r="2" /><path d="M4 8h16" /><path d="M12 6v16" /><path d="m8 22 4-10 4 10" /></symbol>
      <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-5" /></symbol>
      <symbol id="i-people" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></symbol>
      <symbol id="i-file" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /></symbol>
      <symbol id="i-video" viewBox="0 0 24 24"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></symbol>
      <symbol id="i-form" viewBox="0 0 24 24"><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></symbol>
      <symbol id="i-dictionary" viewBox="0 0 24 24"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v19H7.5A2.5 2.5 0 0 1 5 18.5z" /><path d="M5 18.5A2.5 2.5 0 0 1 7.5 16H20" /><path d="M9 6h6" /><path d="M9 10h8" /></symbol>
      <symbol id="i-database" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></symbol>
      <symbol id="i-journal" viewBox="0 0 24 24"><path d="M7 3h10a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M9 7h6" /><path d="M9 11h6" /><path d="M9 15h4" /></symbol>
      <symbol id="i-ebook" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6" /><path d="M9 11h6" /><path d="M9 15h3" /><path d="M12 19h.01" /></symbol>
      <symbol id="i-megaphone" viewBox="0 0 24 24"><path d="M3 11v2a2 2 0 0 0 2 2h3l7 4V5l-7 4H5a2 2 0 0 0-2 2z" /><path d="M19 9a4 4 0 0 1 0 6" /></symbol>
      <symbol id="i-chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></symbol>
      <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></symbol>
      <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14" /><path d="M5 12h14" /></symbol>
      <symbol id="i-map" viewBox="0 0 24 24"><path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" /><path d="M9 3v15" /><path d="M15 6v15" /></symbol>
      <symbol id="i-phone" viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></symbol>
      <symbol id="i-pen" viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></symbol>
      <symbol id="i-puzzle" viewBox="0 0 24 24"><path d="M19 13h-2v-2a2 2 0 1 0-4 0v2h-2V9h2V7a2 2 0 1 0-4 0v2H5v10h14Z" /></symbol>
      <symbol id="i-service" viewBox="0 0 24 24"><path d="M12 3l8 4v6c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V7z" /><path d="M9 12l2 2 4-5" /></symbol>
      {/* Referenced by the source's Knowledge/Contact pages but not defined
          in the source's own icon sprite either — added here to match, in
          the same 24x24 stroke style as the rest. */}
      <symbol id="i-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></symbol>
      <symbol id="i-list" viewBox="0 0 24 24"><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></symbol>
      <symbol id="i-mail" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" /></symbol>
      <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></symbol>
      <symbol id="i-send" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></symbol>
      <symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12 5 5 9-10" /></symbol>
      {/* Dark-mode toggle (Header.tsx) — same 24x24 stroke style as the rest. */}
      <symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></symbol>
      <symbol id="i-moon" viewBox="0 0 24 24"><path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z" /></symbol>
    </svg>
  );
}
