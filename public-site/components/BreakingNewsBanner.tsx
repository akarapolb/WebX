"use client";
// Breaking-news fast-publish path (TOR requirement) — public-site is a full
// static export (output:"export"), so ordinary content publishing goes
// through webx-studio's debounced rebuild (20s debounce, then a full
// `next build`, capped at 5 minutes — see lib/publicSiteBuild.ts). That's
// much too slow for an urgent public notice.
//
// This banner is the one piece of the public site that is NEVER baked into
// the static build: it's fetched live, straight from the browser, on an
// interval — the exact same pattern PollBlock.tsx already uses for live vote
// counts (a direct client-side fetch to Strapi's public REST API, not the
// server-side build-time `get()` helper in lib/cms.ts). An editor flips
// "active" in Strapi (a normal instant Strapi publish, not a site rebuild)
// and every open tab picks it up within one poll interval — seconds, not
// minutes — with zero rebuild involved at all.
import { useEffect, useState } from "react";

const STRAPI = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");
const POLL_MS = 30_000;

type Alert = { id: number; message: string; severity: "info" | "warning" | "critical"; url?: string; linkLabel?: string };

export default function BreakingNewsBanner({ tenant }: { tenant: string }) {
  const [alert, setAlert] = useState<Alert | null>(null);
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch(`${STRAPI}/api/breaking-news-alerts?tenant=${encodeURIComponent(tenant)}&filters[active][$eq]=true&sort=updatedAt:desc&pagination[pageSize]=1`);
        if (!r.ok) return;
        const j = await r.json();
        const row = j?.data?.[0];
        if (cancelled) return;
        setAlert(row ? { id: row.id, message: row.message, severity: row.severity || "warning", url: row.url || undefined, linkLabel: row.linkLabel || "อ่านเพิ่มเติม" } : null);
      } catch {
        // A failed poll just means the banner doesn't update this cycle —
        // never take down the whole page over a live-check failing.
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    try { setDismissedMessage(sessionStorage.getItem("webx-breaking-dismissed")); } catch {}
    return () => { cancelled = true; clearInterval(id); };
  }, [tenant]);

  if (!alert || alert.message === dismissedMessage) return null;

  function dismiss() {
    try { sessionStorage.setItem("webx-breaking-dismissed", alert!.message); } catch {}
    setDismissedMessage(alert!.message);
  }

  return (
    <div className={"wx-breaking wx-breaking--" + alert.severity} role="alert">
      <div className="wx-breaking-inner">
        <span className="wx-breaking-badge">ประกาศด่วน</span>
        <p className="wx-breaking-message">{alert.message}</p>
        {alert.url ? (
          <a className="wx-breaking-link" href={alert.url}>{alert.linkLabel}</a>
        ) : null}
        <button type="button" className="wx-breaking-close" onClick={dismiss} aria-label="ปิดประกาศ">×</button>
      </div>
    </div>
  );
}
