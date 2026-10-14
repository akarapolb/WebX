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
  color?: string;
  iconColor?: string;
  bg?: string;
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
  fontSize?: number;
  fontWeight?: number;
  align?: "left" | "center" | "right";
  radius?: number;
  /** Inner spacing on all sides, px (the original single value; the per-side ones below override it). */
  padding?: number;
  /** Unit of the per-side spacing values only. */
  unit?: SpaceUnit;
  paddingTop?: number; paddingRight?: number; paddingBottom?: number; paddingLeft?: number;
  marginTop?: number; marginRight?: number; marginBottom?: number; marginLeft?: number;
  borderWidth?: number;
  borderStyle?: "solid" | "dashed" | "dotted" | "double";
  borderColor?: string;
  shadow?: "none" | "sm" | "md" | "lg" | "xl";
  /** Percent. */
  opacity?: number;
  hover?: StateStyle;
  focus?: StateStyle;
  active?: StateStyle;
  /** Overrides from 1023px down; mobile follows them unless it sets its own. */
  tablet?: DeviceStyle;
  /** Overrides from 639px down. */
  mobile?: DeviceStyle;
};
/** What a tablet or phone override can hold: the same properties, minus states and further overrides. */
export type DeviceStyle = Omit<ComponentStyle, "hover" | "focus" | "active" | "tablet" | "mobile">;
export const DEVICES = ["tablet", "mobile"] as const;
export type DeviceName = (typeof DEVICES)[number];

/** Input bounds, mirroring the clamps styles.ts applies when rendering. */
export const STYLE_LIMITS = {
  fontSize: { min: 8, max: 200 },
  radius: { min: 0, max: 999 },
  padding: { min: 0, max: 400 },
  borderWidth: { min: 0, max: 20 },
  opacity: { min: 0, max: 100 },
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
