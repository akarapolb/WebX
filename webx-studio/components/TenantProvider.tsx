"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type Tenant = { key: string; name: string; plan?: string; brand?: { primaryColor?: string; color?: string } };
type Engine = "strapi" | "wordpress";
type Ctx = { tenants: Tenant[]; currentKey: string; setCurrentKey: (k: string) => void; current: Tenant | null; engine: Engine };

const TenantCtx = createContext<Ctx>({ tenants: [], currentKey: "", setCurrentKey: () => {}, current: null, engine: "strapi" });

export function TenantProvider({ tenants, engine = "strapi", children }: { tenants: Tenant[]; engine?: Engine; children: React.ReactNode }) {
  const [currentKey, setCurrentKeyState] = useState(tenants[0]?.key ?? "");
  const current = tenants.find((t) => t.key === currentKey) ?? tenants[0] ?? null;

  // restore selection across navigations
  useEffect(() => {
    try { const s = localStorage.getItem("webx_tenant"); if (s && tenants.some((t) => t.key === s)) setCurrentKeyState(s); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setCurrentKey = (k: string) => { setCurrentKeyState(k); try { localStorage.setItem("webx_tenant", k); } catch {} };

  // WebX Studio keeps one identity for every tenant — an admin managing
  // several sites should never see the tool itself change colour when
  // switching workspaces (the tenant's own brand colour only appears in the
  // Branding page's public-site preview, scoped to --psite-accent there).

  return <TenantCtx.Provider value={{ tenants, currentKey, setCurrentKey, current, engine }}>{children}</TenantCtx.Provider>;
}

export const useTenant = () => useContext(TenantCtx);
