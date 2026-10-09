// Site-wide theme settings for the WordPress-engine tenants (ORST,
// RoyalSociety) — the Customizer-style layer (colours, fonts, type scale, corner radius)
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
/** Typography beyond the font families. ORST only for now — RoyalSociety's
 * stylesheet has no equivalent tokens, so these are ignored for it. */
export type ThemeType = {
  /** Page text size, percent of the browser's own size (the root font-size). */
  size?: number;
  /** Line-height of body text (unitless). */
  leading?: number;
  /** Weight of body text. */
  weight?: number;
  /** Weight of h1–h3. */
  headingWeight?: number;
  /** Multiplier on the three display sizes (h1/h2/h3). */
  headingScale?: number;
};
/** A named colour the admin added to the site palette. Components can point at it
 * ("@c1") instead of a hex, so changing the colour here recolours all of them. */
export type PaletteEntry = { id: string; name: string; value: string };
export const PALETTE_MAX = 8;
export type Theme = { colors?: ThemeColors; fonts?: ThemeFonts; radius?: number; type?: ThemeType; palette?: PaletteEntry[] };

/** Only fonts that actually ship with the site (public/fonts/fonts.css is
 * self-hosted on purpose — no Google CDN request, see scripts/fetch-fonts.mjs)
 * plus two system stacks. Adding a font means adding its files there first. */
export const FONT_STACKS: Record<string, string> = {
  "plex-sans": '"IBM Plex Sans Thai", "IBM Plex Sans", -apple-system, sans-serif',
  "noto-serif": '"Noto Serif Thai", "Noto Serif", serif',
  "system-sans": 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  "system-serif": 'Georgia, "Times New Roman", serif',
};

/** A font value is a key of FONT_STACKS, or "google:<Family>" for any Google
 * font. The latter is self-hosted at BUILD time (scripts/google-fonts.mjs), never
 * loaded from Google by a visitor's browser. The family is written into CSS, so
 * it is held to a strict pattern — letters, digits and spaces, nothing that could
 * end a quoted string. Keep in sync with scripts/google-fonts.mjs. */
export const GOOGLE_PREFIX = "google:";
export const FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{0,40}$/;
export function googleFamilyOf(key: unknown): string | null {
  if (typeof key !== "string" || !key.startsWith(GOOGLE_PREFIX)) return null;
  const family = key.slice(GOOGLE_PREFIX.length);
  return FAMILY_RE.test(family) ? family : null;
}

export const RADIUS_LIMITS = { min: 0, max: 40 };

/** Clamped, stepped ranges for the type controls. Thai stacks vowel and tone
 * marks above and below the line, so body leading never goes below 1.4 (the
 * display tokens keep their own, tighter-but-safe leading — see tokens.css). */
export const TYPE_LIMITS = {
  size: { min: 90, max: 125, step: 5 },
  leading: { min: 1.4, max: 2.0, step: 0.05 },
  headingScale: { min: 0.85, max: 1.25, step: 0.05 },
};
/** Weights both shipped families have files for (Plex 300–700, Noto Serif 500–800). */
export const BODY_WEIGHTS = [300, 400, 500];
export const HEADING_WEIGHTS = [500, 600, 700];

/** The three display sizes from tokens.css (--orst-display-xl/lg/md). Restated
 * here because a multiplier needs the base value; keep in sync with that file. */
const DISPLAY_BASE = {
  xl: "clamp(2.4rem, 1.6rem + 3.4vw, 4.2rem)",
  lg: "clamp(1.85rem, 1.4rem + 1.9vw, 2.85rem)",
  md: "clamp(1.2rem, 1.06rem + .66vw, 1.55rem)",
};

const stepTo = (v: number, { min, max, step }: { min: number; max: number; step: number }) => {
  const clamped = Math.min(max, Math.max(min, v));
  // Round to the step, then to 2 decimals to drop floating-point noise (1.4500000000000002).
  return Math.round((Math.round(clamped / step) * step) * 100) / 100;
};

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
    if (typeof f[k] === "string" && (Object.prototype.hasOwnProperty.call(FONT_STACKS, f[k]) || googleFamilyOf(f[k]))) fonts[k] = f[k];
  }
  if (Object.keys(fonts).length) out.fonts = fonts;

  if (typeof r.radius === "number" && Number.isFinite(r.radius)) {
    out.radius = Math.round(Math.min(RADIUS_LIMITS.max, Math.max(RADIUS_LIMITS.min, r.radius)));
  }

  const ty = r.type && typeof r.type === "object" ? r.type : {};
  const type: ThemeType = {};
  if (typeof ty.size === "number" && Number.isFinite(ty.size)) type.size = stepTo(ty.size, TYPE_LIMITS.size);
  if (typeof ty.leading === "number" && Number.isFinite(ty.leading)) type.leading = stepTo(ty.leading, TYPE_LIMITS.leading);
  if (typeof ty.headingScale === "number" && Number.isFinite(ty.headingScale)) type.headingScale = stepTo(ty.headingScale, TYPE_LIMITS.headingScale);
  if (BODY_WEIGHTS.includes(ty.weight)) type.weight = ty.weight;
  if (HEADING_WEIGHTS.includes(ty.headingWeight)) type.headingWeight = ty.headingWeight;
  if (Object.keys(type).length) out.type = type;

  // The custom palette: up to eight entries, each with a fixed id c1–c8 (never
  // renumbered, so a component that points at "@c3" keeps pointing at the same
  // colour when another entry is removed). The name is shown only in Studio and
  // never reaches the stylesheet; the value must be a hex.
  if (Array.isArray(r.palette)) {
    const seen = new Set<string>();
    const palette: PaletteEntry[] = [];
    for (const e of r.palette.slice(0, PALETTE_MAX)) {
      if (!e || typeof e !== "object") continue;
      const id = typeof e.id === "string" && /^c[1-8]$/.test(e.id) ? e.id : null;
      const value = hex(e.value);
      if (!id || !value || seen.has(id)) continue;
      seen.add(id);
      // eslint-disable-next-line no-control-regex
      const name = typeof e.name === "string" ? e.name.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 24) : "";
      palette.push({ id, name: name || id.toUpperCase(), value });
    }
    if (palette.length) out.palette = palette;
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

  // A Google font keeps the bundled Thai-capable family as its fallback, so a
  // font with no Thai glyphs (most of them) still renders Thai text properly.
  const stackOf = (key: string, role: "display" | "body") => {
    const g = googleFamilyOf(key);
    return g ? `"${g}",${FONT_STACKS[role === "display" ? "noto-serif" : "plex-sans"]}` : FONT_STACKS[key];
  };
  if (t.fonts?.display) all.push(`--${p}-font-display:${stackOf(t.fonts.display, "display")}`);
  if (t.fonts?.body) all.push(`--${p}-font-body:${stackOf(t.fonts.body, "body")}`);
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

  // Type scale — ORST only (see ThemeType). The size rule is scoped away from
  // the accessibility toolbar's own "small"/"large" settings
  // (html[data-font-size]) so a visitor who asked for bigger text still gets
  // exactly that; the theme only changes the default.
  const ty = t.type;
  const typeRules: string[] = [];
  if (p === "orst" && ty) {
    if (ty.size !== undefined) {
      const scope = ':root:not([data-font-size="small"]):not([data-font-size="large"])';
      // body is 16px in base.css, which would ignore the root size, so tie it to rem here.
      typeRules.push(`${scope}{font-size:${ty.size}%}`);
      typeRules.push(`${scope} body{font-size:1rem}`);
    }
    const body: string[] = [];
    if (ty.leading !== undefined) body.push(`line-height:${ty.leading}`);
    if (ty.weight !== undefined) body.push(`font-weight:${ty.weight}`);
    if (body.length) typeRules.push(`body{${body.join(";")}}`);
    if (ty.headingWeight !== undefined) typeRules.push(`h1,h2,h3{font-weight:${ty.headingWeight}}`);
    if (ty.headingScale !== undefined) {
      for (const k of ["xl", "lg", "md"] as const) all.push(`--orst-display-${k}:calc(${DISPLAY_BASE[k]}*${ty.headingScale})`);
    }
  }

  // The custom palette is the same in light and dark: these are colours the admin
  // picked on purpose (the core four follow the mode through tokens.css).
  for (const e of t.palette ?? []) all.push(`--wx-c-${e.id}:${e.value}`);

  const parts: string[] = [];
  if (all.length) parts.push(`:root{${all.join(";")}}`);
  parts.push(...typeRules);
  if (light.length) parts.push(`:root:not([data-theme="dark"]){${light.join(";")}}`);
  return parts.join("\n");
}

/** The distinct Google families a tenant's saved theme asks for (after sanitising). */
export function themeGoogleFamilies(raw: unknown): string[] {
  const t = sanitizeTheme(raw);
  const out: string[] = [];
  for (const k of ["display", "body"] as const) {
    const g = googleFamilyOf(t.fonts?.[k]);
    if (g && !out.includes(g)) out.push(g);
  }
  return out;
}
