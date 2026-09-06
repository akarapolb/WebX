"use client";
// Real PDPA consent collection, wired to the backend that already existed
// but had nothing feeding it: webx-studio's ConsentLog.tsx audit table has
// been reading api::consent-log.consent-log rows since it was built, but no
// component anywhere in the actual running public site ever wrote one — the
// only place a consent banner existed was on a separate static procurement
// demo, not this app. consent-log is tenant-scoped like any other SCOPED
// content type (see strapi-cms/src/index.ts), so posting with ?tenant=<key>
// is all a write needs; the Public role already has create permission on it
// (strapi-cms/src/seed/seed.ts's ensurePublicPermissions).
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "webx_consent";
const STRAPI = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");

/** Every template segment's own tenant, mirrored from the app/ route
 * structure (app/orst, app/royalsociety, app/(gov-portal)/[tenant] with "/"
 * itself serving dga) — there's no shared per-request tenant context here
 * since this is a static export with no server component tree to read one
 * from, so the banner (a client component) derives it from the URL like any
 * other client-side code in this app already has to. */
function tenantFromPath(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0];
  if (!seg) return "dga";
  if (seg === "orst" || seg === "royalsociety") return seg;
  return seg; // gov-portal's own [tenant] segment (pea, nbtc, ...)
}

type Consent = { necessary: true; analytics: boolean; marketing: boolean };

async function logConsent(tenant: string, action: string, categories: Consent) {
  try {
    await fetch(`${STRAPI}/api/consent-logs?tenant=${encodeURIComponent(tenant)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          consentId: crypto.randomUUID(),
          action,
          categories,
          language: document.documentElement.lang || "th",
          path: window.location.pathname,
          userAgent: navigator.userAgent,
        },
      }),
    });
  } catch {
    // A logging failure must never block the visitor from using the site —
    // the choice is still saved locally either way (see save() below).
  }
}

export default function CookieConsent() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(!localStorage.getItem(STORAGE_KEY));
    } catch {
      setVisible(true); // no localStorage access (e.g. privacy mode) — still ask, just won't remember
    }
  }, []);

  function save(action: string, categories: Consent) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ action, categories, at: new Date().toISOString() }));
    } catch { /* see logConsent's own comment — non-fatal either way */ }
    void logConsent(tenantFromPath(pathname || "/"), action, categories);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="การใช้คุกกี้"
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9999,
        background: "#14171f", color: "#f2f3f6",
        borderTop: "1px solid rgba(255,255,255,0.12)",
        padding: "16px 20px",
        display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", justifyContent: "space-between",
        fontFamily: "'IBM Plex Sans Thai', 'Noto Sans Thai', system-ui, sans-serif",
        fontSize: 14, lineHeight: 1.55,
        boxShadow: "0 -4px 20px rgba(0,0,0,0.25)",
      }}
    >
      {/* `color` is repeated here rather than left to inherit from the
          banner above: ORST's base.css carries a global `p { color:
          var(--orst-ink-soft) }`, and an explicit declaration on the element
          always beats an inherited one no matter how specific the ancestor
          rule is — so this notice rendered dark-grey on the near-black
          banner at 2.36:1. Caught by a real Lighthouse audit. */}
      <p style={{ margin: 0, flex: "1 1 380px", maxWidth: 680, color: "#f2f3f6" }}>
        เว็บไซต์นี้ใช้คุกกี้เพื่อพัฒนาประสบการณ์การใช้งานและวิเคราะห์การเข้าชม
        คุณสามารถเลือกยอมรับทั้งหมดหรือเฉพาะคุกกี้ที่จำเป็นได้ (
        <a href="/privacy" style={{ color: "#9fd3ff", textDecoration: "underline" }}>นโยบายความเป็นส่วนตัว</a>
        )
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => save("reject", { necessary: true, analytics: false, marketing: false })}
          style={{
            background: "transparent", color: "#f2f3f6", border: "1px solid rgba(255,255,255,0.35)",
            borderRadius: 8, padding: "9px 16px", fontSize: 13.5, cursor: "pointer",
          }}
        >
          เฉพาะที่จำเป็น
        </button>
        <button
          onClick={() => save("accept_all", { necessary: true, analytics: true, marketing: true })}
          style={{
            // TOR gap audit (accessibility/WCAG) — a real Lighthouse audit
            // found white-on-#2f7dff at 3.81:1, under WCAG AA's 4.5:1 floor;
            // darkened to a still-clearly-blue #0f56c4 (6.67:1).
            background: "#0f56c4", color: "#fff", border: "none",
            borderRadius: 8, padding: "9px 18px", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
          }}
        >
          ยอมรับทั้งหมด
        </button>
      </div>
    </div>
  );
}
