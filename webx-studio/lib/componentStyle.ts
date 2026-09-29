// The shape of `b.styles[componentKey]` — the Visual Builder's per-component
// colour/size/background overrides.
//
// Kept in sync by hand with public-site/templates/_builder/styles.ts, which
// owns the rendering AND the validation: this package never builds CSS, so it
// only needs the field names and the ranges its inputs should offer. The two
// packages don't import each other (same arrangement as blockPreview/blocks.tsx
// and public-site's BlockRenderer), so a field added there has to be added
// here too or the editor simply won't offer it.
//
// Not per-device, unlike b.boxes — see that module's own note on why.

export type ComponentStyle = {
  /** Text colour, #rrggbb or #rrggbbaa. */
  color?: string;
  /** Background colour, #rrggbb or #rrggbbaa. */
  bg?: string;
  /** Background image URL — a same-site path or an absolute http(s) URL. */
  bgImage?: string;
  /** How a background image fills the element. */
  bgFit?: "cover" | "contain";
  fontSize?: number;
  fontWeight?: number;
  align?: "left" | "center" | "right";
  radius?: number;
  padding?: number;
};

/** Input bounds, mirroring the clamps styles.ts applies when rendering. */
export const STYLE_LIMITS = {
  fontSize: { min: 8, max: 200 },
  radius: { min: 0, max: 999 },
  padding: { min: 0, max: 400 },
} as const;

/** The nine real CSS weights, minus the ones no UI font ships. */
export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800] as const;

/** True when a style object would render nothing, so it can be dropped. */
export function isBlankStyle(s: ComponentStyle | undefined | null): boolean {
  if (!s) return true;
  return !Object.keys(s).some((k) => {
    const v = (s as any)[k];
    return v !== undefined && v !== null && v !== "";
  });
}
