"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type Tenant = { key: string; name: string; plan?: string; brand?: { primaryColor?: string; color?: string } };
type Engine = "strapi" | "wordpress";
type Ctx = { tenants: Tenant[]; currentKey: string; setCurrentKey: (k: string) => void; current: Tenant | null; engine: Engine };

const TenantCtx = createContext<Ctx>({ tenants: [], currentKey: "", setCurrentKey: () => {}, current: null, engine: "strapi" });
const ACCENTS = [["#6E8BFF", "#A36BFF"], ["#8B5CF6", "#EC4899"], ["#14B8A6", "#0EA5E9"], ["#EE5020", "#D63B12"]];

export function TenantProvider({ tenants, engine = "strapi", children }: { tenants: Tenant[]; engine?: Engine; children: React.ReactNode }) {
  const [currentKey, setCurrentKeyState] = useState(tenants[0]?.key ?? "");
  const current = tenants.find((t) => t.key === currentKey) ?? tenants[0] ?? null;

  // restore selection across navigations
  useEffect(() => {
    try { const s = localStorage.getItem("webx_tenant"); if (s && tenants.some((t) => t.key === s)) setCurrentKeyState(s); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setCurrentKey = (k: string) => { setCurrentKeyState(k); try { localStorage.setItem("webx_tenant", k); } catch {} };

  useEffect(() => {
    const i = Math.max(0, tenants.findIndex((t) => t.key === currentKey));
    const brand = current?.brand?.primaryColor || current?.brand?.color;
    const [pa, pa2] = ACCENTS[i % ACCENTS.length];
    const a = brand || pa, a2 = pa2;
    const r = document.documentElement;
    r.style.setProperty("--accent", a);
    r.style.setProperty("--accent2", a2);
    r.style.setProperty("--accent-soft", (a.length === 7 ? a : pa) + "29");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  return <TenantCtx.Provider value={{ tenants, currentKey, setCurrentKey, current, engine }}>{children}</TenantCtx.Provider>;
}

export const useTenant = () => useContext(TenantCtx);
