"use client";
// The workspace's saved style presets (lib/stylePresets.ts), loaded once and shared by
// every open style panel. Saving merges into the tenant's current `brand` — read fresh
// just before the write — so it never overwrites a theme saved in the meantime.
import { useCallback, useEffect, useState } from "react";
import { cms } from "@/lib/cms";
import { addPreset, cleanPresets, removePreset, type StylePreset } from "./stylePresets";

const TENANT_UID = "api::tenant.tenant";

async function readRow(tenantKey: string): Promise<any | null> {
  const { data } = await cms.entries.list<any>(TENANT_UID, { pageSize: 50 });
  return data.find((x: any) => x.key === tenantKey) ?? null;
}

export type PresetApi = {
  presets: StylePreset[];
  busy: boolean;
  error: string | null;
  /** Saves `style` under `name`. Resolves false when it could not (empty, full, or the save failed). */
  add: (name: string, style: unknown) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
};

export function useStylePresets(tenantKey: string | undefined): PresetApi {
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantKey) { setPresets([]); return; }
    let live = true;
    readRow(tenantKey)
      .then((row) => { if (live) setPresets(cleanPresets(row?.brand?.stylePresets)); })
      .catch(() => { if (live) setPresets([]); });
    return () => { live = false; };
  }, [tenantKey]);

  // Reads the latest list, applies `change`, writes it back, and shows what was written.
  const write = useCallback(async (change: (list: StylePreset[]) => StylePreset[] | null): Promise<boolean> => {
    if (!tenantKey) return false;
    setBusy(true); setError(null);
    try {
      const row = await readRow(tenantKey);
      if (!row) throw new Error("workspace not found");
      const next = change(cleanPresets(row.brand?.stylePresets));
      if (!next) return false;
      await cms.entries.update(TENANT_UID, String(row.documentId ?? row.id), { brand: { ...(row.brand || {}), stylePresets: next } });
      setPresets(next);
      return true;
    } catch (e: any) {
      setError(e?.message || "save failed");
      return false;
    } finally { setBusy(false); }
  }, [tenantKey]);

  const add = useCallback((name: string, style: unknown) => write((list) => addPreset(list, name, style)), [write]);
  const remove = useCallback(async (id: string) => { await write((list) => removePreset(list, id)); }, [write]);
  return { presets, busy, error, add, remove };
}
