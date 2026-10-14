// The shape of `b.styles[componentKey]` — the Visual Builder's per-component
// colour / spacing / background / border / effect overrides.
//
// Kept in sync by hand with public-site/templates/_builder/styles.ts, which
// owns the rendering AND the validation: this package never builds CSS, so it
// only needs the field names and the ranges its inputs should offer. The two
// packages don't import each other (same arrangement as blockPreview/blocks.tsx
// and public-site's BlockRenderer), so a field added there has to be added
// here too or the editor simply won't offer it.
//
// Not per-device, unlike b.boxes — see that module's own note on why.

export type SpaceUnit = "px" | "rem" | "em" | "%";
export type BgPosition = "left top" | "center top" | "right top" | "left center" | "center" | "right center" | "left bottom" | "center bottom" | "right bottom";

/** What a component looks like while hovered, focused or pressed — colour, shadow and opacity only. */
export type StateStyle = {
  /** Transform for this state (a hover lift or zoom); a part left out keeps the main style's. */
  scale?: number; rotate?: number; moveX?: number; moveY?: number;
  color?: string;
  iconColor?: string;
  bg?: string;
  /** Gradient colours for this state; the type and angle come from the main style. */
  gradFrom?: string;
  gradTo?: string;
  borderColor?: string;
  shadow?: "none" | "sm" | "md" | "lg" | "xl";
  opacity?: number;
};
export const STATES = ["hover", "focus", "active"] as const;
export type StateName = (typeof STATES)[number];

export type ComponentStyle = {
  /** Text colour: #rrggbb(aa), or a theme token ("@primary", "@c1"). Reaches the text inside the component too. */
  color?: string;
  /** Icon colour. Wins over `color` for the SVG icons inside the component. */
  iconColor?: string;
  /** Background colour: #rrggbb(aa) or a theme token. */
  bg?: string;
  /** Background image URL — a same-site path or an absolute http(s) URL. */
  bgImage?: string;
  /** How a background image fills the element. */
  bgFit?: "cover" | "contain" | "auto";
  bgRepeat?: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
  bgPosition?: BgPosition;
  bgAttachment?: "scroll" | "fixed";
  /** A colour over the background image so text on it stays readable. */
  bgOverlay?: string;
  /** Gradient background colours (hex or theme token); with only one, the other end fades to transparent. */
  gradFrom?: string;
  gradTo?: string;
  /** Linear direction in degrees: 0 up, 90 right, 180 down (the default). */
  gradAngle?: number;
  gradType?: "linear" | "radial";
  fontSize?: number;
  fontWeight?: number;
  align?: "left" | "center" | "right";
  /** The theme's heading font, its body font, or a monospace stack. */
  fontFamily?: "heading" | "body" | "mono";
  /** Multiple of the font size (0.8–3). */
  lineHeight?: number;
  /** In em (-0.1–0.5). */
  letterSpacing?: number;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  textDecoration?: "none" | "underline" | "line-through";
  fontStyle?: "normal" | "italic";
  radius?: number;
  /** Inner spacing on all sides, px (the original single value; the per-side ones below override it). */
  padding?: number;
  /** Unit of the per-side spacing values only. */
  unit?: SpaceUnit;
  paddingTop?: number; paddingRight?: number; paddingBottom?: number; paddingLeft?: number;
  marginTop?: number; marginRight?: number; marginBottom?: number; marginLeft?: number;
  /** A number and a unit written together ("50%", "320px"); width and height also take "auto", the maximums "none". */
  width?: string; height?: string;
  minWidth?: string; minHeight?: string;
  maxWidth?: string; maxHeight?: string;
  display?: "block" | "flex" | "grid" | "inline-block" | "none";
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";
  justifyContent?: "start" | "center" | "end" | "between" | "around" | "evenly";
  alignItems?: "start" | "center" | "end" | "stretch" | "baseline";
  flexWrap?: "nowrap" | "wrap";
  gap?: string;
  gridColumns?: number;
  position?: "static" | "relative";
  zIndex?: number;
  overflow?: "visible" | "hidden" | "auto";
  borderWidth?: number;
  borderStyle?: "solid" | "dashed" | "dotted" | "double";
  borderColor?: string;
  shadow?: "none" | "sm" | "md" | "lg" | "xl";
  /** A custom shadow; it wins over the preset above. Unset parts default to 0 / 4 / 12 / 0 / 25% black. */
  shadowX?: number; shadowY?: number; shadowBlur?: number; shadowSpread?: number;
  shadowColor?: string;
  shadowInset?: boolean;
  /** Percent. */
  opacity?: number;
  /** Scale, percent; rotation, degrees; move, px. */
  scale?: number; rotate?: number; moveX?: number; moveY?: number;
  /** How long a hover/focus/pressed change fades, ms, and its easing. */
  transitionMs?: number;
  easing?: "ease" | "linear" | "ease-in" | "ease-out" | "ease-in-out";
  /** Entrance animation, its length and delay (ms). */
  animation?: "fade" | "slide-up" | "slide-down" | "slide-left" | "slide-right" | "zoom";
  animMs?: number; animDelayMs?: number;
  hover?: StateStyle;
  focus?: StateStyle;
  active?: StateStyle;
  /** Overrides from 1023px down; mobile follows them unless it sets its own. */
  tablet?: DeviceStyle;
  /** Overrides from 639px down. */
  mobile?: DeviceStyle;
  /** Overrides while the visitor is in dark mode, at every width. */
  dark?: DeviceStyle;
};
/** What a tablet, phone or dark-mode override can hold: the same properties, minus states and further overrides. */
export type DeviceStyle = Omit<ComponentStyle, "hover" | "focus" | "active" | "tablet" | "mobile" | "dark">;
export const DEVICES = ["tablet", "mobile"] as const;
export type DeviceName = (typeof DEVICES)[number];

/** Input bounds, mirroring the clamps styles.ts applies when rendering. */
export const STYLE_LIMITS = {
  fontSize: { min: 8, max: 200 },
  lineHeight: { min: 0.8, max: 3, step: 0.05 },
  letterSpacing: { min: -0.1, max: 0.5, step: 0.01 },
  radius: { min: 0, max: 999 },
  padding: { min: 0, max: 400 },
  borderWidth: { min: 0, max: 20 },
  opacity: { min: 0, max: 100 },
  scale: { min: 25, max: 300 },
  rotate: { min: -360, max: 360 },
  move: { min: -400, max: 400 },
  transitionMs: { min: 0, max: 2000 },
  animMs: { min: 100, max: 3000 },
  animDelayMs: { min: 0, max: 3000 },
  shadowOffset: { min: -100, max: 100 },
  shadowBlur: { min: 0, max: 200 },
  shadowSpread: { min: -100, max: 100 },
} as const;

export const SPACE_UNITS: readonly SpaceUnit[] = ["px", "rem", "em", "%"];
/** Per-side spacing range for each unit; margins may be negative. */
export const SPACE_LIMITS: Record<"padding" | "margin", Record<SpaceUnit, { min: number; max: number; step: number }>> = {
  padding: { px: { min: 0, max: 400, step: 1 }, rem: { min: 0, max: 40, step: 0.25 }, em: { min: 0, max: 40, step: 0.25 }, "%": { min: 0, max: 50, step: 1 } },
  margin: { px: { min: -200, max: 400, step: 1 }, rem: { min: -20, max: 40, step: 0.25 }, em: { min: -20, max: 40, step: 0.25 }, "%": { min: -50, max: 100, step: 1 } },
};

export const BG_POSITIONS: readonly BgPosition[] = [
  "left top", "center top", "right top", "left center", "center", "right center", "left bottom", "center bottom", "right bottom",
];
export const BG_REPEATS = ["no-repeat", "repeat", "repeat-x", "repeat-y"] as const;
export const BG_FITS = ["cover", "contain", "auto"] as const;
export const BORDER_STYLES = ["solid", "dashed", "dotted", "double"] as const;
export const DIM_UNITS = ["px", "%", "rem", "em", "vw", "vh"] as const;
export type DimUnit = (typeof DIM_UNITS)[number];
/** Per-unit range a size is clamped to on the site. */
export const DIM_LIMITS: Record<DimUnit, { min: number; max: number; step: number }> = {
  px: { min: 0, max: 4000, step: 1 }, "%": { min: 0, max: 100, step: 1 }, rem: { min: 0, max: 250, step: 0.25 },
  em: { min: 0, max: 250, step: 0.25 }, vw: { min: 0, max: 100, step: 1 }, vh: { min: 0, max: 100, step: 1 },
};
export const SIZE_FIELDS = [
  { key: "width", keyword: "auto" }, { key: "height", keyword: "auto" },
  { key: "minWidth" }, { key: "minHeight" },
  { key: "maxWidth", keyword: "none" }, { key: "maxHeight", keyword: "none" },
] as const;
/** Splits "50%" into its number and unit; null when it is neither a size nor the field's keyword. */
export function splitDimension(v: unknown): { n: string; unit: DimUnit } | null {
  if (typeof v !== "string") return null;
  let i = 0;
  while (i < v.length && ((v[i] >= "0" && v[i] <= "9") || v[i] === ".")) i++;
  const unit = v.slice(i);
  if (!i || !(DIM_UNITS as readonly string[]).includes(unit)) return null;
  return { n: v.slice(0, i), unit: unit as DimUnit };
}
export const DISPLAYS = ["block", "flex", "grid", "inline-block", "none"] as const;
export const FLEX_DIRECTIONS = ["row", "column", "row-reverse", "column-reverse"] as const;
export const JUSTIFY = ["start", "center", "end", "between", "around", "evenly"] as const;
export const ALIGN_ITEMS = ["start", "center", "end", "stretch", "baseline"] as const;
export const OVERFLOWS = ["visible", "hidden", "auto"] as const;
export const LAYOUT_LIMITS = { gridColumns: { min: 1, max: 12 }, zIndex: { min: -10, max: 100 } } as const;
export const EASINGS = ["ease", "linear", "ease-in", "ease-out", "ease-in-out"] as const;
export const ANIMATIONS = ["fade", "slide-up", "slide-down", "slide-left", "slide-right", "zoom"] as const;
export const FONT_FAMILIES = ["heading", "body", "mono"] as const;
export const TEXT_TRANSFORMS = ["none", "uppercase", "lowercase", "capitalize"] as const;
export const GRAD_TYPES = ["linear", "radial"] as const;
export const GRAD_ANGLE = { min: 0, max: 360, step: 5, default: 180 } as const;
/** The parts of a custom shadow, in the order the panel lists them. */
export const SHADOW_FIELDS = ["shadowX", "shadowY", "shadowBlur", "shadowSpread", "shadowColor", "shadowInset"] as const;
export const SHADOWS = ["none", "sm", "md", "lg", "xl"] as const;

/** The nine real CSS weights, minus the ones no UI font ships. */
export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800] as const;

/** True when a style object would render nothing, so it can be dropped. */
export function isBlankStyle(s: ComponentStyle | StateStyle | undefined | null): boolean {
  if (!s) return true;
  return !Object.keys(s).some((k) => {
    const v = (s as any)[k];
    if (v && typeof v === "object") return !isBlankStyle(v); // a state with something set in it
    return v !== undefined && v !== null && v !== "";
  });
}

/** A stored colour is a theme token ("@primary") rather than a hex. */
export const isTokenValue = (v: unknown): v is string => typeof v === "string" && v.startsWith("@");
