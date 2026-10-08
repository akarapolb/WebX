// Site-wide theme settings for the WordPress-engine tenants (ORST,
// RoyalSociety) — the Customizer-style layer (colours, fonts, corner radius)
// that used to be hard-coded in each tenant's tokens.css.
//
// Stored on the tenant as `brand.theme` (a plain JSON blob inside the
// existing `brand` field, so no schema change) and edited from WebX Studio's
// Branding → Theme tab. Everything here turns that blob into a <style> block
// that overrides the tenant's own custom properties.
//
// This file is the security boundary: `brand.theme` is writable by any tenant
// admin and is emitted as raw CSS, so nothing from it reaches the stylesheet
// without passing sanitizeTheme() first — colours must be hex, fonts must be
// a key in FONT_STACKS (never a free-form family string), radius a clamped
// number. Anything else is dropped, not escaped.
//
// The Studio's ThemeSettings.tsx keeps its own copy of the option lists
// (the two packages share no code); keep FONT_KEYS and the limits in sync.

export type ThemeColors = { primary?: string; accent?: string; ground?: string; ink?: string };
export type ThemeFonts = { display?: string; body?: string };
export type Theme = { colors?: ThemeColors; fonts?: ThemeFonts; radius?: number };

/** Only fonts that actually ship with the site (public/fonts/fonts.css is
 * self-hosted on purpose — no Google CDN request, see scripts/fetch-fonts.mjs)
 * plus two system stacks. Adding a font means adding its files there first. */
export const FONT_STACKS: Record<string, string> = {
  "plex-sans": '"IBM Plex Sans Thai", "IBM Plex Sans", -apple-system, sans-serif',
  "noto-serif": '"Noto Serif Thai", "Noto Serif", serif',
  "system-sans": 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  "system-serif": 'Georgia, "Times New Roman", serif',
};

export const RADIUS_LIMITS = { min: 0, max: 40 };

/** Custom-property prefix each tenant's tokens.css uses. A tenant not listed
 * here has no theme support and gets no overrides. */
const PREFIX: Record<string, string> = { orst: "orst", royalsociety: "rs" };

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function hex(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!HEX.test(s)) return undefined;
  // Expand #abc → #aabbcc so color-mix() and the Studio's <input type=color>
  // both always see the long form.
  return (s.length === 4 ? "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3] : s).toLowerCase();
}

/** Reduce untrusted input to a Theme containing only known-safe values. */
export function sanitizeTheme(raw: unknown): Theme {
  const out: Theme = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, any>;

  const c = r.colors && typeof r.colors === "object" ? r.colors : {};
  const colors: ThemeColors = {};
  for (const k of ["primary", "accent", "ground", "ink"] as const) {
    const v = hex(c[k]);
    if (v) colors[k] = v;
  }
  if (Object.keys(colors).length) out.colors = colors;

  const f = r.fonts && typeof r.fonts === "object" ? r.fonts : {};
  const fonts: ThemeFonts = {};
  for (const k of ["display", "body"] as const) {
    if (typeof f[k] === "string" && Object.prototype.hasOwnProperty.call(FONT_STACKS, f[k])) fonts[k] = f[k];
  }
  if (Object.keys(fonts).length) out.fonts = fonts;

  if (typeof r.radius === "number" && Number.isFinite(r.radius)) {
    out.radius = Math.round(Math.min(RADIUS_LIMITS.max, Math.max(RADIUS_LIMITS.min, r.radius)));
  }
  return out;
}

/**
 * The override stylesheet for one tenant, or "" when there is nothing to
 * override (unknown tenant, or an empty/invalid theme).
 *
 * Emitted UNLAYERED on purpose: tokens.css declares everything inside
 * `@layer tokens`, and an unlayered rule beats any layered one regardless of
 * order or specificity, so this wins without touching those files.
 *
 * Colours are scoped to `:root:not([data-theme="dark"])` — dark mode has its
 * own hand-tuned palette (`:root[data-theme="dark"]` in tokens.css) which a
 * single light-mode brand colour must not flatten. Fonts and radius are
 * mode-independent, so those apply to both.
 */
export function themeToCss(tenant: string, raw: unknown): string {
  const p = PREFIX[tenant];
  if (!p) return "";
  const t = sanitizeTheme(raw);
  const all: string[] = [];
  const light: string[] = [];

  if (t.fonts?.display) all.push(`--${p}-font-display:${FONT_STACKS[t.fonts.display]}`);
  if (t.fonts?.body) all.push(`--${p}-font-body:${FONT_STACKS[t.fonts.body]}`);
  if (t.radius !== undefined) {
    all.push(`--${p}-radius-card:${t.radius}px`);
    all.push(`--${p}-radius-sm:${Math.round(t.radius * 0.55)}px`);
  }

  const c = t.colors;
  if (c?.primary) {
    light.push(`--${p}-primary:${c.primary}`);
    light.push(`--${p}-primary-strong:color-mix(in srgb,${c.primary} 72%,#000)`);
    light.push(`--${p}-primary-soft:color-mix(in srgb,${c.primary} 80%,#fff)`);
    if (p === "orst") {
      light.push(`--orst-gradient-primary:linear-gradient(155deg,color-mix(in srgb,${c.primary} 88%,#fff) 0%,${c.primary} 46%,color-mix(in srgb,${c.primary} 72%,#000) 100%)`);
    }
  }
  if (c?.accent) light.push(`--${p}-gold:${c.accent}`);
  if (c?.ground) light.push(`--${p}-ground:${c.ground}`);
  if (c?.ink) {
    light.push(`--${p}-ink:${c.ink}`);
    light.push(`--${p}-ink-soft:color-mix(in srgb,${c.ink} 78%,#fff)`);
  }

  const parts: string[] = [];
  if (all.length) parts.push(`:root{${all.join(";")}}`);
  if (light.length) parts.push(`:root:not([data-theme="dark"]){${light.join(";")}}`);
  return parts.join("\n");
}
