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
// counts. Originally polled Strapi directly; Phase 7 moved breaking-news
// storage natively into WordPress (wordpress/mu-plugins/
// public-forms-post-types.php's `breaking_news` CPT + its rest_breaking_news_query
// filter translating ?active=1 into the meta_query an ACF field needs). An
// editor flips "active" in wp-admin (a normal instant WordPress save, not a
// site rebuild) and every open tab picks it up within one poll interval —
// seconds, not minutes — with zero rebuild involved at all.
import { useEffect, useState } from "react";

const WORDPRESS = (process.env.NEXT_PUBLIC_WORDPRESS_URL || "http://localhost:8081/wp-json").replace(/\/$/, "");
const POLL_MS = 30_000;

type Alert = { id: number; message: string; severity: "info" | "warning" | "critical"; url?: string; linkLabel?: string };

let wtenantIdCache: { at: number; map: Map<string, number> } = { at: 0, map: new Map() };
async function wtenantId(tenant: string): Promise<number | null> {
  const now = Date.now();
  if (now - wtenantIdCache.at > 60_000 || wtenantIdCache.map.size === 0) {
    try {
      const r = await fetch(`${WORDPRESS}/wp/v2/wtenant?per_page=100`);
      const terms = r.ok ? await r.json() : [];
      const map = new Map<string, number>();
      (terms || []).forEach((t: any) => map.set(t.slug, t.id));
      wtenantIdCache = { at: now, map };
    } catch { /* keep the stale cache rather than erroring every caller */ }
  }
  return wtenantIdCache.map.get(tenant) ?? null;
}

export default function BreakingNewsBanner({ tenant }: { tenant: string }) {
  const [alert, setAlert] = useState<Alert | null>(null);
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const termId = await wtenantId(tenant);
        if (termId == null) return;
        const r = await fetch(`${WORDPRESS}/wp/v2/breaking-news?wtenant=${termId}&active=1&orderby=modified&order=desc&per_page=1&_fields=id,acf`);
        if (!r.ok) return;
        const rows = await r.json();
        const row = rows?.[0];
        if (cancelled) return;
        setAlert(row
          ? {
              id: row.id, message: row.acf?.message || "", severity: row.acf?.severity || "warning",
              url: row.acf?.url || undefined, linkLabel: row.acf?.link_label || "อ่านเพิ่มเติม",
            }
          : null);
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
