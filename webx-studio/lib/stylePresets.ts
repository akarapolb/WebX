// Style presets: a component's whole style saved under a name so it can be applied to
// other components. Stored on the tenant (`brand.stylePresets`) next to the theme.
//
// A preset is a COPY, not a link: applying one writes its values into the component,
// so changing or deleting the preset later never changes pages that already used it.
//
// Nothing here is trusted by the public site: the style goes through the same
// validator (public-site/templates/_builder/styles.ts) whenever a page renders, so
// this module only has to keep the stored data well-formed and small.

import type { ComponentStyle } from "./componentStyle";

export type StylePreset = { id: string; name: string; style: ComponentStyle };

export const PRESET_MAX = 24;
export const PRESET_NAME_MAX = 40;
/** A style this large is not a style; the cap keeps the tenant row from ballooning. */
export const PRESET_STYLE_MAX_CHARS = 6000;

const ID_OK = (v: unknown): v is string => typeof v === "string" && /^p[a-z0-9]{3,12}$/.test(v);

/** Plain JSON only (strings, finite numbers, booleans, nested objects up to `depth`); anything else is dropped. */
function plain(v: unknown, depth: number): unknown {
  if (typeof v === "string") return v.length > 2000 ? undefined : v;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "boolean") return v;
  if (v && typeof v === "object" && !Array.isArray(v) && depth > 0) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      const x = plain((v as any)[k], depth - 1);
      if (x !== undefined && !(x && typeof x === "object" && !Object.keys(x as object).length)) out[k] = x;
    }
    return out;
  }
  return undefined;
}

/** A style reduced to plain data (no undefined, no empty nested objects), or null when nothing is left. */
export function cleanStyle(v: unknown): ComponentStyle | null {
  const out = plain(v, 3) as Record<string, unknown> | undefined;
  if (!out || !Object.keys(out).length) return null;
  return JSON.stringify(out).length > PRESET_STYLE_MAX_CHARS ? null : (out as ComponentStyle);
}

/** A preset name as typed: control characters and angle brackets removed, trimmed, capped. */
export function cleanName(v: unknown): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, PRESET_NAME_MAX);
}

/** The stored list, made well-formed: bad entries and duplicates dropped, capped. */
export function cleanPresets(raw: unknown): StylePreset[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: StylePreset[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const id = (p as any).id, name = cleanName((p as any).name), style = cleanStyle((p as any).style);
    if (!ID_OK(id) || seen.has(id) || !name || !style) continue;
    seen.add(id);
    out.push({ id, name, style });
    if (out.length >= PRESET_MAX) break;
  }
  return out;
}

/** An id no preset in `list` has. */
export function newPresetId(list: StylePreset[], rand: () => number = Math.random): string {
  const used = new Set(list.map((p) => p.id));
  for (;;) {
    const id = "p" + Math.floor(rand() * 36 ** 6).toString(36).padStart(6, "0");
    if (!used.has(id)) return id;
  }
}

/** The list with a new preset added, or null when the name is empty, the style has nothing in it, or the list is full. */
export function addPreset(list: StylePreset[], name: unknown, style: unknown, rand?: () => number): StylePreset[] | null {
  const n = cleanName(name), s = cleanStyle(style);
  if (!n || !s || list.length >= PRESET_MAX) return null;
  return [...list, { id: newPresetId(list, rand), name: n, style: s }];
}

export const removePreset = (list: StylePreset[], id: string): StylePreset[] => list.filter((p) => p.id !== id);

/** A fresh copy of a preset's style to write into a component, so editing the component never edits the preset. */
export const presetStyle = (p: StylePreset): ComponentStyle => JSON.parse(JSON.stringify(p.style));
