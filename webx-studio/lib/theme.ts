// Studio side of the site-wide theme (Branding → Theme tab). The public site
// turns `brand.theme` into CSS in public-site/lib/theme.ts, which is the
// authority on what is allowed — it re-validates everything, so the helpers
// here only keep the editor honest. The two packages share no code, so the
// font keys and limits are mirrored; keep them in sync with that file.
import { parseHex } from "./color";

export type Theme = {
  colors?: { primary?: string; accent?: string; ground?: string; ink?: string };
  fonts?: { display?: string; body?: string };
  radius?: number;
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

/** What each tenant's own tokens.css ships with — the "reset" target and the
 * value shown for a field the admin has not overridden. */
export const THEME_DEFAULTS: Record<string, Required<{ colors: Required<NonNullable<Theme["colors"]>>; fonts: Required<NonNullable<Theme["fonts"]>>; radius: number }>> = {
  orst: {
    colors: { primary: "#073b34", accent: "#b98d3e", ground: "#fbf7ef", ink: "#1c211f" },
    fonts: { display: "noto-serif", body: "plex-sans" },
    radius: 22,
  },
  royalsociety: {
    colors: { primary: "#06473f", accent: "#b99143", ground: "#fbf7ef", ink: "#16201d" },
    fonts: { display: "noto-serif", body: "plex-sans" },
    radius: 6,
  },
};

/** Tenants whose public template reads brand.theme. Any other workspace's
 * site ignores it, so the tab says so instead of saving a no-op. */
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
  return out;
}
