"use client";
import { useEffect } from "react";

// Silently renews the admin session before the short Strapi access token
// expires, so logged-in users aren't bounced to the login screen while working.
export default function SessionKeeper() {
  useEffect(() => {
    let alive = true;
    const ping = () => { if (alive) fetch("/api/auth/refresh", { method: "POST" }).catch(() => {}); };
    ping(); // refresh on load
    const id = setInterval(() => { if (document.visibilityState === "visible") ping(); }, 10 * 60 * 1000); // every 10 min
    const onVis = () => { if (document.visibilityState === "visible") ping(); }; // and when the tab is re-focused
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return null;
}
