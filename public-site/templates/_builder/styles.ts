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

/** What a component looks like while the pointer is over it, it has focus, or it is being pressed.
 * Only the properties that make sense to change at that moment — a hover that moved the layout would make the
 * element jump out from under the pointer. */
export type StateStyle = {
  color?: string;
  iconColor?: string;
  bg?: string;
  borderColor?: string;
  shadow?: "none" | "sm" | "md" | "lg" | "xl";
  opacity?: number;
};
/** The interaction states a style can carry, in the order they are emitted (later wins a tie). */
export const STATES = ["hover", "focus", "active"] as const;
export type StateName = (typeof STATES)[number];

export type Style = {
  /** Text colour — applied to the component AND the text inside it. */
  color?: string;
  /** Icon colour. Overrides `color` for the SVG icons inside the component. */
  iconColor?: string;
  /** Background colour. */
  bg?: string;
  /** Background image URL (same-site path or http(s)). */
  bgImage?: string;
  /** How a background image fills the element. */
  bgFit?: "cover" | "contain" | "auto";
  /** Background image tiling. */
  bgRepeat?: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
  /** Where a background image sits — one of the nine anchor points. */
  bgPosition?: "left top" | "center top" | "right top" | "left center" | "center" | "right center" | "left bottom" | "center bottom" | "right bottom";
  /** "fixed" keeps the image still while the page scrolls past it. */
  bgAttachment?: "scroll" | "fixed";
  /** A colour laid over the background image (usually translucent) so text on it stays readable. */
  bgOverlay?: string;
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
  /** Unit of the per-side spacing values below (and only those). Default px. */
  unit?: "px" | "rem" | "em" | "%";
  paddingTop?: number; paddingRight?: number; paddingBottom?: number; paddingLeft?: number;
  marginTop?: number; marginRight?: number; marginBottom?: number; marginLeft?: number;
  /** Border width, px. 0 removes the border. */
  borderWidth?: number;
  borderStyle?: "solid" | "dashed" | "dotted" | "double";
  borderColor?: string;
  /** A fixed drop-shadow preset. */
  shadow?: "none" | "sm" | "md" | "lg" | "xl";
  /** Opacity, percent (0 = invisible). */
  opacity?: number;
  /** While the pointer is over the component (mouse and trackpad only). */
  hover?: StateStyle;
  /** While the component, or something inside it, has keyboard focus. */
  focus?: StateStyle;
  /** While the component is being pressed. */
  active?: StateStyle;
};

/** The style keys this module knows how to render, for the editor's own use. */
export const STYLE_KEYS = [
  "color", "iconColor", "bg", "bgImage", "bgFit", "bgRepeat", "bgPosition", "bgAttachment", "bgOverlay",
  "fontSize", "fontWeight", "align", "radius", "padding", "unit",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginRight", "marginBottom", "marginLeft",
  "borderWidth", "borderStyle", "borderColor", "shadow", "opacity",
  "hover", "focus", "active",
] as const;

// #rgb / #rgba / #rrggbb / #rrggbbaa — the only colour syntax accepted. The
// Builder's picker normalises everything it produces to one of these, so
// rejecting rgb()/hsl()/named colours costs nothing and keeps this a single
// unambiguous pattern rather than a parser.
const COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export const isSafeColor = (v: unknown): v is string => typeof v === "string" && COLOR_RE.test(v);

// Theme colour tokens: a colour field may name a theme colour ("@primary") instead
// of a hex, so changing the theme recolours every component that points at it.
// Only these exact names are accepted; each becomes var(--wx-c-<name>), which the
// tenant's stylesheet (core four) and the theme CSS (c1–c8, the custom palette)
// define. Never a free-form variable name.
export const COLOR_TOKENS = ["primary", "accent", "ground", "ink", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] as const;
const TOKEN_RE = /^@(?:primary|accent|ground|ink|c[1-8])$/;
export const isColorToken = (v: unknown): v is string => typeof v === "string" && TOKEN_RE.test(v);
/** The CSS for a colour value — a hex as it is, a token as its variable — or undefined when neither. */
export function colorCss(v: unknown): string | undefined {
  if (isSafeColor(v)) return v;
  if (isColorToken(v)) return `var(--wx-c-${v.slice(1)})`;
  return undefined;
}

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

const FITS = ["cover", "contain", "auto"] as const;
const REPEATS = ["no-repeat", "repeat", "repeat-x", "repeat-y"] as const;
const POSITIONS = ["left top", "center top", "right top", "left center", "center", "right center", "left bottom", "center bottom", "right bottom"] as const;
const ATTACHMENTS = ["scroll", "fixed"] as const;
const BORDER_STYLES = ["solid", "dashed", "dotted", "double"] as const;
const UNITS = ["px", "rem", "em", "%"] as const;
/** Fixed presets — a shadow is never taken from the stored value, only chosen by name. */
const SHADOWS = {
  none: "none",
  sm: "0 1px 3px rgba(0,0,0,.18)",
  md: "0 6px 16px rgba(0,0,0,.20)",
  lg: "0 14px 32px rgba(0,0,0,.25)",
  xl: "0 28px 60px rgba(0,0,0,.32)",
} as const;
type Unit = (typeof UNITS)[number];
// Allowed range per unit. Margins may be negative (pull an element up under its neighbour).
const SPACE_RANGE: Record<"padding" | "margin", Record<Unit, [number, number]>> = {
  padding: { px: [0, 400], rem: [0, 40], em: [0, 40], "%": [0, 50] },
  margin: { px: [-200, 400], rem: [-20, 40], em: [-20, 40], "%": [-50, 100] },
};
/** One spacing value as CSS ("1.5rem"), or undefined when it is not a finite number. */
function space(v: unknown, kind: "padding" | "margin", unit: Unit): string | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  const [lo, hi] = SPACE_RANGE[kind][unit];
  return `${Math.round(Math.min(hi, Math.max(lo, v)) * 100) / 100}${unit}`;
}
/** Like clamp, but null, "" and non-numbers mean "not set" rather than 0. */
const clampSet = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? clamp(v, lo, hi) : undefined;
const ALIGNS = ["left", "center", "right"] as const;

/** The CSS declarations one component's style produces ("" when none survive). */
export function styleDecls(s: Style | null | undefined): string {
  if (!s || typeof s !== "object") return "";
  const d: string[] = [];

  const col = colorCss(s.color);
  if (col) d.push(`color:${col}!important`);
  const bgc = colorCss(s.bg);
  if (bgc) d.push(`background-color:${bgc}!important`);
  if (isSafeImageUrl(s.bgImage)) {
    // Quoted so a URL containing a comma or a keyword can't be read as extra
    // background layers; the denylist above already guarantees no quote of
    // its own can appear inside.
    const img = `url("${s.bgImage}")`;
    // An overlay is a one-colour gradient stacked above the image. The single
    // size/position/repeat values below repeat across both layers, so they need
    // no pairing.
    const ov = colorCss(s.bgOverlay);
    d.push(`background-image:${ov ? `linear-gradient(${ov},${ov}),${img}` : img}!important`);
    d.push(`background-size:${oneOf(s.bgFit, FITS) || "cover"}!important`);
    d.push(`background-position:${oneOf(s.bgPosition, POSITIONS) || "center"}!important`);
    d.push(`background-repeat:${oneOf(s.bgRepeat, REPEATS) || "no-repeat"}!important`);
    const att = oneOf(s.bgAttachment, ATTACHMENTS);
    if (att) d.push(`background-attachment:${att}!important`);
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

  // Per-side spacing, after the all-sides shorthand so a side overrides it.
  const unit = oneOf(s.unit, UNITS) || "px";
  const sides: [string, unknown, "padding" | "margin"][] = [
    ["padding-top", s.paddingTop, "padding"], ["padding-right", s.paddingRight, "padding"],
    ["padding-bottom", s.paddingBottom, "padding"], ["padding-left", s.paddingLeft, "padding"],
    ["margin-top", s.marginTop, "margin"], ["margin-right", s.marginRight, "margin"],
    ["margin-bottom", s.marginBottom, "margin"], ["margin-left", s.marginLeft, "margin"],
  ];
  for (const [prop, v, kind] of sides) {
    const css = space(v, kind, unit);
    if (css !== undefined) d.push(`${prop}:${css}!important`);
  }

  const bw = clampSet(s.borderWidth, 0, 20);
  if (bw !== undefined) {
    d.push(`border-style:${bw === 0 ? "none" : oneOf(s.borderStyle, BORDER_STYLES) || "solid"}!important`);
    d.push(`border-width:${bw}px!important`);
    const bc = colorCss(s.borderColor);
    if (bc && bw > 0) d.push(`border-color:${bc}!important`);
  }

  const sh = oneOf(s.shadow, Object.keys(SHADOWS) as (keyof typeof SHADOWS)[]);
  if (sh) d.push(`box-shadow:${SHADOWS[sh]}!important`);

  const op = clampSet(s.opacity, 0, 100);
  if (op !== undefined) d.push(`opacity:${op / 100}!important`);

  return d.join(";");
}

/** Declarations for one interaction state (empty when none survive). Colours, shadow and opacity only. */
function stateDecls(s: StateStyle | null | undefined): string {
  if (!s || typeof s !== "object" || Array.isArray(s)) return "";
  const d: string[] = [];
  const col = colorCss(s.color);
  if (col) d.push(`color:${col}!important`);
  const bgc = colorCss(s.bg);
  if (bgc) d.push(`background-color:${bgc}!important`);
  const bc = colorCss(s.borderColor);
  if (bc) d.push(`border-color:${bc}!important`);
  const sh = oneOf(s.shadow, Object.keys(SHADOWS) as (keyof typeof SHADOWS)[]);
  if (sh) d.push(`box-shadow:${SHADOWS[sh]}!important`);
  const op = clampSet(s.opacity, 0, 100);
  if (op !== undefined) d.push(`opacity:${op / 100}!important`);
  return d.join(";");
}

// Elements inside a component that carry no tag of their own, and not icons.
const INNER_TEXT = ":not([data-vb-c]):not(svg):not(svg *)";

/**
 * The rules that carry a colour into a component's text and icons, for any
 * selector `sel` (a plain component or one of its states).
 *
 * Colour has to reach the text INSIDE a component, not just the element that
 * carries the tag. A card is tagged as one unit ("items.0") but its title, body
 * and icon are children with colour rules of their own, and a rule on a child
 * beats a value inherited from its parent — so setting the card's colour used
 * to change nothing at all. Text tagged directly (a heading) always worked,
 * which is why only some components failed.
 *
 * Elements that carry their own tag are skipped so they keep whatever was set
 * on them specifically, and SVGs are skipped so the icon colour can own them.
 */
function colourReach(sel: string, color: unknown, icon: unknown): string {
  let css = "";
  const textColor = colorCss(color);
  if (textColor) {
    css += `${sel} ${INNER_TEXT}{color:${textColor}!important}`;
    // An icon follows the text colour unless it has been given its own.
    css += `${sel} svg,${sel} svg *{color:${textColor}!important}`;
  }
  // The selector repeats itself on purpose: two attribute pairs put this above
  // the text-colour rules, so an icon colour wins over the colour of the text it
  // sits in regardless of which rule is emitted first.
  const iconColor = colorCss(icon);
  if (iconColor) {
    const twice = sel + sel;
    css += `${twice} svg,${twice} svg *{color:${iconColor}!important}`;
  }
  return css;
}

// The pseudo-class each state listens to. Focus is two separate rules, not one
// selector list: a browser that doesn't know :focus-visible would drop the whole
// list, taking :focus-within with it.
const STATE_PSEUDO: Record<StateName, string[]> = {
  hover: [":hover"],
  focus: [":focus-visible", ":focus-within"],
  active: [":active"],
};
const TRANSITION_PROPS = "color .18s ease,background-color .18s ease,border-color .18s ease,box-shadow .18s ease,opacity .18s ease";

/** Every rule one component's style produces, for the selector `sel`. */
function styleCss(sel: string, st: Style | null | undefined): string {
  if (!st || typeof st !== "object") return "";
  let css = "";
  const decls = styleDecls(st);
  if (decls) css += `${sel}{${decls}}`;
  css += colourReach(sel, st.color, st.iconColor);

  // Interaction states. They come after the base rules and add a pseudo-class
  // (more specific), so they win while they apply without any ordering tricks.
  let stated = false, statedColour = false;
  for (const name of STATES) {
    const stateStyle = (st as any)[name];
    const sd = stateDecls(stateStyle);
    const reach = (sx: string) => colourReach(sx, stateStyle?.color, stateStyle?.iconColor);
    if (!sd && !reach(sel)) continue;
    stated = true;
    if (colorCss(stateStyle?.color) || colorCss(stateStyle?.iconColor)) statedColour = true;
    for (const pseudo of STATE_PSEUDO[name]) {
      const rule = (sd ? `${sel}${pseudo}{${sd}}` : "") + reach(sel + pseudo);
      // Hover is for a pointer. On a touch screen it would stay stuck on after a
      // tap, so it only applies where hovering is real.
      css += name === "hover" ? `@media (hover:hover){${rule}}` : rule;
    }
  }
  // Fade between states — but not for anyone who asked their system to cut motion.
  if (stated) {
    let t = `${sel}{transition:${TRANSITION_PROPS}}`;
    // Text inside the component is its own element, so it needs its own transition.
    if (statedColour) t += `${sel} ${INNER_TEXT},${sel} svg,${sel} svg *{transition:color .18s ease}`;
    css += `@media (prefers-reduced-motion:no-preference){${t}}`;
  }
  return css;
}

/** True when this style would render nothing — used to drop empty entries. */
export const isEmptyStyle = (s: Style | null | undefined): boolean => styleCss("x", s) === "";

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
  // Shorter keys first. A component that contains another ("items" holds
  // "items.0"; "panel" holds "panelHeading") is almost always the shorter
  // name, and where two rules tie on specificity the later one wins — so the
  // inner component's own colour beats the outer one's.
  const keys = Object.keys(all).filter(isComponentKey).sort((a, b) => a.length - b.length || a.localeCompare(b));
  for (const k of keys) css += styleCss(`[data-vb-s="${scope}"][data-vb-c="${k}"]`, all[k]);
  return css;
}
