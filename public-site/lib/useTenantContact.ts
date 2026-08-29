"use client";
// Client-side counterpart to getTenant() in lib/cms.ts (a server-only, build-
// time fetch) — for a page that has to be a Client Component for other
// reasons (see ContactPage.tsx's own comment on why), this is how it reaches
// the same /api/tenants/resolve data Footer.tsx already renders correctly.
//
// This exists because ContactPage.tsx used to hardcode its own separate copy
// of the address/phone/email as JSX literals, independently of Footer.tsx's
// real CMS-sourced ones — the two silently drifted apart (a real citizen-
// facing bug: two different official addresses on the same page). Routing
// both through the same fetch is what keeps them from ever disagreeing again.
import { useEffect, useState } from "react";

const STRAPI = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");

export type TenantContact = { phone?: string; email?: string; address?: { th?: string; en?: string } };

export function useTenantContact(tenantKey: string): TenantContact | null {
  const [contact, setContact] = useState<TenantContact | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${STRAPI}/api/tenants/resolve?tenant=${encodeURIComponent(tenantKey)}&locale=th`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setContact(j?.data?.contact ?? null); })
      .catch(() => { /* left null — callers fall back to their own default copy */ });
    return () => { cancelled = true; };
  }, [tenantKey]);
  return contact;
}
