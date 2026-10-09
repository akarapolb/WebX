"use client";
// React hook behind the Visual Builder's "theme colour" chips: the tenant's theme
// tokens (lib/themeTokens.ts) loaded once per workspace and shared between every
// colour row, instead of one request per picker.
import { useEffect, useState } from "react";
import { cms } from "@/lib/cms";
import { themeTokens, type ThemeToken } from "./themeTokens";
import { THEME_DEFAULTS } from "./theme";

const cache = new Map<string, Promise<ThemeToken[]>>();

function load(tenantKey: string): Promise<ThemeToken[]> {
  let p = cache.get(tenantKey);
  if (!p) {
    p = cms.entries.list<any>("api::tenant.tenant", { pageSize: 50 })
      .then(({ data }) => {
        const row = data.find((x: any) => x.key === tenantKey);
        return themeTokens(tenantKey, row?.brand?.theme);
      })
      // A failed read must not stick: the next mount tries again.
      .catch((e) => { cache.delete(tenantKey); throw e; });
    cache.set(tenantKey, p);
  }
  return p;
}

/** Forget a workspace's tokens — call after saving its theme so chips show the new colours. */
export function invalidateThemeTokens(tenantKey: string) { cache.delete(tenantKey); }

/**
 * The theme colours the current workspace offers. Empty for a workspace whose
 * public template has no theme (DGA, PEA …): there is nothing for a token to
 * resolve to there, so the picker shows no chips instead of dead ones.
 */
export function useThemeTokens(tenantKey: string | undefined): ThemeToken[] {
  const [tokens, setTokens] = useState<ThemeToken[]>([]);
  useEffect(() => {
    if (!tenantKey || !THEME_DEFAULTS[tenantKey]) { setTokens([]); return; }
    let live = true;
    load(tenantKey).then((t) => { if (live) setTokens(t); }).catch(() => { if (live) setTokens(themeTokens(tenantKey, undefined)); });
    return () => { live = false; };
  }, [tenantKey]);
  return tokens;
}
