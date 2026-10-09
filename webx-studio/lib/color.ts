// Colour parsing/conversion for the Visual Builder's picker.
//
// Kept out of the component so the maths is unit-testable on its own, and so
// the one canonical output shape lives in one place: every colour this module
// produces is `#rrggbb` (or `#rrggbbaa` when it isn't fully opaque), which is
// exactly what public-site/templates/_builder/styles.ts is willing to render.
// Anything the picker cannot parse is rejected rather than guessed at.

export type Rgba = { r: number; g: number; b: number; a: number }; // 0-255, a 0-1
export type Hsva = { h: number; s: number; v: number; a: number }; // h 0-360, s/v 0-1, a 0-1

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const hex2 = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");

/**
 * Parse `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. Returns null for anything
 * else — including the `rgb()`/named-colour forms a browser would accept, so
 * that a value read back out of the picker is always one we can re-render.
 */
export function parseHex(input: string | null | undefined): Rgba | null {
  if (typeof input !== "string") return null;
  const s = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]+$/.test(s)) return null;
  const x = (i: number, len: number) => parseInt(len === 1 ? s[i] + s[i] : s.slice(i * 2, i * 2 + 2), 16);
  if (s.length === 3 || s.length === 4) {
    return { r: x(0, 1), g: x(1, 1), b: x(2, 1), a: s.length === 4 ? x(3, 1) / 255 : 1 };
  }
  if (s.length === 6 || s.length === 8) {
    return { r: x(0, 2), g: x(1, 2), b: x(2, 2), a: s.length === 8 ? x(3, 2) / 255 : 1 };
  }
  return null;
}

/** `#rrggbb`, or `#rrggbbaa` when not fully opaque. Always lower case. */
export function toHex({ r, g, b, a }: Rgba): string {
  const base = "#" + hex2(r) + hex2(g) + hex2(b);
  const alpha = clamp(a, 0, 1);
  // Rounding first means 0.999 → "ff" → the short form, rather than an
  // "#…fe" that looks transparent in the field but isn't visibly so.
  return Math.round(alpha * 255) === 255 ? base : base + hex2(alpha * 255);
}

export function rgbToHsv({ r, g, b, a }: Rgba): Hsva {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max, a };
}

export function hsvToRgb({ h, s, v, a }: Hsva): Rgba {
  const H = ((h % 360) + 360) % 360, S = clamp(s, 0, 1), V = clamp(v, 0, 1);
  const c = V * S, x = c * (1 - Math.abs(((H / 60) % 2) - 1)), m = V - c;
  const i = Math.floor(H / 60);
  const [r1, g1, b1] = i === 0 ? [c, x, 0] : i === 1 ? [x, c, 0] : i === 2 ? [0, c, x]
    : i === 3 ? [0, x, c] : i === 4 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255), a };
}

/** A CSS colour for swatches/previews — always fully specified, never a var(). */
export const cssOf = (c: Rgba) => `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${clamp(c.a, 0, 1)})`;

/**
 * Every distinct colour already used on this page, newest-looking first, for
 * the picker's "on this page" row. Takes the raw block array so it can see
 * both styled components and any colour a block's own fields carry.
 *
 * Deduplicates case-insensitively and caps the list — a long page would
 * otherwise produce a swatch wall nobody scans.
 */
export function pageColors(blocks: any[], limit = 24): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (v: unknown) => {
    const c = parseHex(typeof v === "string" ? v : "");
    if (!c) return;
    const hex = toHex(c);
    if (seen.has(hex) || out.length >= limit) return;
    seen.add(hex);
    out.push(hex);
  };
  for (const b of Array.isArray(blocks) ? blocks : []) {
    const styles = b?.styles;
    if (styles && typeof styles === "object") {
      for (const k of Object.keys(styles)) {
        push(styles[k]?.color);
        push(styles[k]?.bg);
        push(styles[k]?.iconColor);
        push(styles[k]?.borderColor);
        push(styles[k]?.bgOverlay);
      }
    }
  }
  return out;
}
