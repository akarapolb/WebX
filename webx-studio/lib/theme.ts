// Studio side of the site-wide theme (Branding → Theme tab). The public site
// turns `brand.theme` into CSS in public-site/lib/theme.ts, which is the
// authority on what is allowed — it re-validates everything, so the helpers
// here only keep the editor honest. The two packages share no code, so the
// font keys and limits are mirrored; keep them in sync with that file.
import { parseHex } from "./color";

/** Typography beyond the font families (ORST only for now). */
export type ThemeType = {
  /** Page text size, percent of the browser's own size. */
  size?: number;
  /** Line-height of body text. */
  leading?: number;
  /** Weight of body text. */
  weight?: number;
  /** Weight of h1–h3. */
  headingWeight?: number;
  /** Multiplier on the h1/h2/h3 sizes. */
  headingScale?: number;
};

/** A named colour in the site palette. Components can point at it ("@c1") instead
 * of a hex, so changing it here recolours all of them. Ids are fixed (c1–c8) and
 * never renumbered. */
export type PaletteEntry = { id: string; name: string; value: string };
export const PALETTE_MAX = 8;
export const PALETTE_IDS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] as const;
/** The first id not already in use, or null when all eight are taken. */
export const nextPaletteId = (palette: PaletteEntry[]): string | null => PALETTE_IDS.find((id) => !palette.some((e) => e.id === id)) ?? null;

export type Theme = {
  colors?: { primary?: string; accent?: string; ground?: string; ink?: string };
  fonts?: { display?: string; body?: string };
  radius?: number;
  type?: ThemeType;
  palette?: PaletteEntry[];
};

export const COLOR_KEYS = ["primary", "accent", "ground", "ink"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export const FONT_OPTIONS: { key: string; label: string; stack: string }[] = [
  { key: "plex-sans", label: "IBM Plex Sans Thai", stack: '"IBM Plex Sans Thai", "IBM Plex Sans", -apple-system, sans-serif' },
  { key: "noto-serif", label: "Noto Serif Thai", stack: '"Noto Serif Thai", "Noto Serif", serif' },
  { key: "system-sans", label: "System sans-serif", stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { key: "system-serif", label: "System serif (Georgia)", stack: 'Georgia, "Times New Roman", serif' },
];

export const RADIUS_LIMITS = { min: 0, max: 40 };

// Mirrored from public-site/lib/theme.ts, which clamps and re-validates every
// value; these only keep the sliders inside the same range.
export const TYPE_LIMITS = {
  size: { min: 90, max: 125, step: 5 },
  leading: { min: 1.4, max: 2.0, step: 0.05 },
  headingScale: { min: 0.85, max: 1.25, step: 0.05 },
};
export const BODY_WEIGHTS = [300, 400, 500];
export const HEADING_WEIGHTS = [500, 600, 700];
export const TYPE_DEFAULTS: Required<ThemeType> = { size: 100, leading: 1.65, weight: 400, headingWeight: 600, headingScale: 1 };

/** What each tenant's own tokens.css ships with — the "reset" target and the
 * value shown for a field the admin has not overridden. */
type ThemeDefaults = { colors: Required<NonNullable<Theme["colors"]>>; fonts: Required<NonNullable<Theme["fonts"]>>; radius: number; type?: Required<ThemeType> };
export const THEME_DEFAULTS: Record<string, ThemeDefaults> = {
  orst: {
    colors: { primary: "#073b34", accent: "#b98d3e", ground: "#fbf7ef", ink: "#1c211f" },
    fonts: { display: "noto-serif", body: "plex-sans" },
    radius: 22,
    type: TYPE_DEFAULTS,
  },
  royalsociety: {
    colors: { primary: "#06473f", accent: "#b99143", ground: "#fbf7ef", ink: "#16201d" },
    fonts: { display: "noto-serif", body: "plex-sans" },
    radius: 6,
  },
};

/** Tenants whose public template reads brand.theme. Any other workspace's
 * site ignores it, so the tab says so instead of saving a no-op. */
/** Only ORST's stylesheet has the tokens the type controls drive. */
export const typeSupported = (tenantKey: string) => !!THEME_DEFAULTS[tenantKey]?.type;
export const themeSupported = (tenantKey: string) => Object.prototype.hasOwnProperty.call(THEME_DEFAULTS, tenantKey);

function luminance(hex: string): number | null {
  const c = parseHex(hex);
  if (!c) return null;
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/** WCAG 2.x contrast ratio between two colours, or null if either is not a colour. */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a), lb = luminance(b);
  if (la == null || lb == null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA for normal text. */
export const AA = 4.5;

/** Theme with every value the admin left alone removed, so saving does not
 * freeze today's defaults into the tenant (a later change to tokens.css would
 * then never reach it). */
export function compactTheme(tenantKey: string, t: Theme): Theme {
  const d = THEME_DEFAULTS[tenantKey];
  const out: Theme = {};
  const colors: NonNullable<Theme["colors"]> = {};
  for (const k of COLOR_KEYS) {
    const v = t.colors?.[k]?.toLowerCase();
    if (v && (!d || v !== d.colors[k].toLowerCase())) colors[k] = v;
  }
  if (Object.keys(colors).length) out.colors = colors;
  const fonts: NonNullable<Theme["fonts"]> = {};
  for (const k of ["display", "body"] as const) {
    const v = t.fonts?.[k];
    if (v && (!d || v !== d.fonts[k])) fonts[k] = v;
  }
  if (Object.keys(fonts).length) out.fonts = fonts;
  if (typeof t.radius === "number" && (!d || t.radius !== d.radius)) out.radius = t.radius;
  if (d?.type) {
    const type: ThemeType = {};
    for (const k of ["size", "leading", "weight", "headingWeight", "headingScale"] as const) {
      const v = t.type?.[k];
      if (typeof v === "number" && v !== d.type[k]) type[k] = v;
    }
    if (Object.keys(type).length) out.type = type;
  }
  // The palette has no default: whatever is there is the admin's own.
  if (d && t.palette?.length) {
    out.palette = t.palette
      .filter((e) => PALETTE_IDS.includes(e.id as any) && parseHex(e.value))
      .slice(0, PALETTE_MAX)
      .map((e) => ({ id: e.id, name: (e.name || "").trim().slice(0, 24) || e.id.toUpperCase(), value: e.value.toLowerCase() }));
    if (!out.palette.length) delete out.palette;
  }
  return out;
}
