// Per-component styling from the Visual Builder — the colour/size/background
// sibling of boxes.ts's move/resize. Shared by every template's Blocks.tsx
// (the live site) and the Builder's preview harness, so what the editor shows
// and what visitors get come from one implementation. Pure and server-safe:
// no React, no "use client", no DOM.
//
// Storage, on the block itself:
//   b.styles = { [componentKey]: Style }
//
// Deliberately NOT per-device, unlike b.boxes. A move is a layout decision
// that genuinely differs between a 1280px and a 390px canvas; a brand colour
// is not, and making editors set one three times would mostly produce pages
// whose phone version silently kept the old colour. Sizes are the one real
// casualty — a heading sized for desktop is sized for mobile too — which the
// templates' own responsive CSS still handles for anything left unstyled.
//
// Components are the elements a renderer tags with `vc(b, key)` (see
// boxes.ts): top-level fields ("heading", "lead", "cta1Label"…) and
// individual list items ("items.2"). Buttons are tagged in their own right,
// so styling one needs no special case here.
//
// SECURITY: every value below is interpolated into a <style> element on a
// public page, so nothing is trusted. Values are matched against exact
// patterns or clamped to a range, and anything unrecognised is dropped
// rather than escaped — a stylesheet has no safe way to carry an arbitrary
// string, and a dropped declaration only costs the author their styling.

import { isComponentKey } from "./boxes";

export type Style = {
  /** Text colour. */
  color?: string;
  /** Background colour. */
  bg?: string;
  /** Background image URL (same-site path or http(s)). */
  bgImage?: string;
  /** How a background image fills the element. */
  bgFit?: "cover" | "contain";
  /** Font size, px. */
  fontSize?: number;
  /** Font weight, 100–900. */
  fontWeight?: number;
  /** Text alignment. */
  align?: "left" | "center" | "right";
  /** Corner radius, px. */
  radius?: number;
  /** Inner spacing, px. */
  padding?: number;
};

/** The style keys this module knows how to render, for the editor's own use. */
export const STYLE_KEYS = ["color", "bg", "bgImage", "bgFit", "fontSize", "fontWeight", "align", "radius", "padding"] as const;

// #rgb / #rgba / #rrggbb / #rrggbbaa — the only colour syntax accepted. The
// Builder's picker normalises everything it produces to one of these, so
// rejecting rgb()/hsl()/named colours costs nothing and keeps this a single
// unambiguous pattern rather than a parser.
const COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export const isSafeColor = (v: unknown): v is string => typeof v === "string" && COLOR_RE.test(v);

// A background image URL, allowed only as a site-relative path or an
// absolute http(s) URL. The character denylist is what actually does the
// security work: without it a value like `x.png");background:url("evil` (or
// anything carrying a quote, paren, backslash, semicolon or angle bracket)
// could close the url() and start a declaration — or a </style> — of its own.
const URL_CHARS_RE = /^[A-Za-z0-9\-._~:/?#\[\]@!$&*+,;=%]+$/;
export function isSafeImageUrl(v: unknown): v is string {
  if (typeof v !== "string" || !v || v.length > 2000) return false;
  if (/["'()\\<>\s]/.test(v)) return false;
  if (!URL_CHARS_RE.test(v)) return false;
  if (v.startsWith("//")) return false; // protocol-relative — scheme comes from the page, so it isn't one of the two below
  return v.startsWith("/") || /^https?:\/\/[^/]/.test(v);
}

const clamp = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

const FITS = ["cover", "contain"] as const;
const ALIGNS = ["left", "center", "right"] as const;

/** The CSS declarations one component's style produces ("" when none survive). */
export function styleDecls(s: Style | null | undefined): string {
  if (!s || typeof s !== "object") return "";
  const d: string[] = [];

  if (isSafeColor(s.color)) d.push(`color:${s.color}!important`);
  if (isSafeColor(s.bg)) d.push(`background-color:${s.bg}!important`);
  if (isSafeImageUrl(s.bgImage)) {
    // Quoted so a URL containing a comma or a keyword can't be read as extra
    // background layers; the denylist above already guarantees no quote of
    // its own can appear inside.
    d.push(`background-image:url("${s.bgImage}")!important`);
    d.push(`background-size:${oneOf(s.bgFit, FITS) || "cover"}!important`);
    d.push("background-position:center!important", "background-repeat:no-repeat!important");
  }

  const fs = clamp(s.fontSize, 8, 200);
  if (fs !== undefined) d.push(`font-size:${fs}px!important`, "line-height:1.25!important");

  const fw = clamp(s.fontWeight, 100, 900);
  // Only the nine real CSS weights — an in-between number is a typo, not a
  // finer gradation, and would round to a weight the font may not have.
  if (fw !== undefined && fw % 100 === 0) d.push(`font-weight:${fw}!important`);

  const al = oneOf(s.align, ALIGNS);
  if (al) d.push(`text-align:${al}!important`);

  const r = clamp(s.radius, 0, 999);
  if (r !== undefined) d.push(`border-radius:${r}px!important`);

  const p = clamp(s.padding, 0, 400);
  if (p !== undefined) d.push(`padding:${p}px!important`);

  return d.join(";");
}

/** True when this style would render nothing — used to drop empty entries. */
export const isEmptyStyle = (s: Style | null | undefined): boolean => !styleDecls(s);

/**
 * The block's per-component style overrides as one CSS string ("" when none).
 *
 * `scope` is the block's index on the page (`b.__vbi`), which `vc()` stamps
 * onto every tagged element — without it, two blocks sharing a component key
 * would style each other.
 */
export function stylesCss(b: any, scope: number): string {
  const all = b?.styles;
  if (!all || typeof all !== "object") return "";
  let css = "";
  for (const k of Object.keys(all)) {
    if (!isComponentKey(k)) continue;
    const decls = styleDecls(all[k]);
    if (decls) css += `[data-vb-s="${scope}"][data-vb-c="${k}"]{${decls}}`;
  }
  return css;
}
