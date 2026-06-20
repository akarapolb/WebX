"use client";
import { useEffect } from "react";

// Silently renews the admin session before the short Strapi access token
// expires, so logged-in users aren't bounced to the login screen while working.
export default function SessionKeeper() {
  useEffect(() => {
    let alive = true;
    const ping = () => { if (alive && document.visibilityState !== "hidden") fetch("/api/auth/refresh", { method: "POST" }).catch(() => {}); };
    ping(); // refresh on load so the token is fresh for this session
    const id = setInterval(ping, 10 * 60 * 1000); // and every 10 min (well under the access-token TTL)
    return () => { alive = false; clearInterval(id); };
  }, []);
  return null;
}
