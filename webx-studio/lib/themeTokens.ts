// The theme colours a component can point at ("@primary", "@c1" …), with the value
// each one has right now — so the Visual Builder's colour pickers can offer them as
// chips and show what they currently look like.
//
// The public site resolves a token through a CSS variable (see
// public-site/templates/_builder/styles.ts, colorCss), so Studio never needs the
// value to render a page; it only needs it to draw the chip. A chip whose value
// cannot be read (workspace without a theme, offline) still works — it just shows
// the tenant's default colour.
import { THEME_DEFAULTS, PALETTE_IDS, type PaletteEntry } from "./theme";

export type ThemeToken = {
  /** What is stored in the style: "@primary", "@c2" … */
  token: string;
  /** Short label for the chip. */
  label: string;
  /** Current colour, #rrggbb, or "" when unknown. */
  value: string;
  /** True for the four built-in tokens, false for custom palette entries. */
  core: boolean;
};

const CORE: { key: "primary" | "accent" | "ground" | "ink"; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "accent", label: "Accent" },
  { key: "ground", label: "Background" },
  { key: "ink", label: "Text" },
];

/** Pure: the token list for one tenant's saved theme (any shape — it is re-checked here). */
export function themeTokens(tenantKey: string, theme: unknown): ThemeToken[] {
  const d = THEME_DEFAULTS[tenantKey];
  const colors = (theme as any)?.colors ?? {};
  const hexOk = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
  const out: ThemeToken[] = CORE.map((c) => ({
    token: "@" + c.key,
    label: c.label,
    value: hexOk(colors[c.key]) ? colors[c.key].toLowerCase() : d?.colors[c.key] ?? "",
    core: true,
  }));
  const palette: PaletteEntry[] = Array.isArray((theme as any)?.palette) ? (theme as any).palette : [];
  for (const e of palette) {
    if (!e || !PALETTE_IDS.includes(e.id as any) || !hexOk(e.value)) continue;
    out.push({ token: "@" + e.id, label: (e.name || e.id.toUpperCase()).slice(0, 24), value: e.value.toLowerCase(), core: false });
  }
  return out;
}

/** The label and colour behind a stored token, or null when it is not one ("#abcdef", empty …). */
export function tokenInfo(tokens: ThemeToken[], stored: string | undefined): ThemeToken | null {
  if (!stored || !stored.startsWith("@")) return null;
  return tokens.find((t) => t.token === stored) ?? { token: stored, label: stored.slice(1), value: "", core: false };
}
