"use client";
// WebX site kit — reports what visitors search to the CMS's search analytics
// (strapi-cms/src/api/search-stat), so editors see popular and zero-result
// searches in Studio → Analytics. Anonymous by design: only the query, the
// language and the number of results are sent; the CMS stores counts, never
// who searched. Off when the site has no public CMS (lib/publicCms.ts) or the
// browser asks not to be tracked. Each query is reported once per page view.
import { useCallback, useRef } from "react";
// The control plane's own route when PUBLIC_CONTROL_URL is set (webx-control's search_stats.rs), the CMS's otherwise: same
// path, same body.
import { PUBLIC_RUNTIME as PUBLIC_CMS } from "@/lib/publicCms";

export function useSearchReporter(tenant: string, locale: "th" | "en") {
  const sent = useRef(new Set<string>());
  return useCallback((q: string, results: number) => {
    if (!PUBLIC_CMS || !q) return;
    try { if (navigator.doNotTrack === "1" || (window as any).globalPrivacyControl === true) return; } catch {}
    const key = q.toLowerCase();
    if (sent.current.has(key)) return;
    sent.current.add(key);
    fetch(`${PUBLIC_CMS}/api/search-stats/log?tenant=${encodeURIComponent(tenant)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: q.slice(0, 100), locale, results }),
      keepalive: true,
    }).catch(() => { /* analytics must never disturb the search page */ });
  }, [tenant, locale]);
}
