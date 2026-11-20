// Turns the tenant's brand colour (Studio → Branding → primaryColor) into the
// dgahub template's accent variables, keeping WCAG 2.1 AA contrast whatever
// colour an editor picks: the accent is darkened until white text on it
// reaches 4.5:1, and a lighter variant is derived for the dark hero/footer.
type RGB = [number, number, number];

function parse(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}
const toHex = (c: RGB) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
function lum([r, g, b]: RGB) {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as RGB;

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const HERO: RGB = [0x12, 0x16, 0x1f];

/** CSS custom properties for the accent, or null to keep the template's own orange. */
export function accentVars(primary?: string): Record<string, string> | null {
  const c = primary ? parse(primary) : null;
  // The template's own orange has a hand-tuned palette in site.css; keep it.
  if (!c || toHex(c) === "#c2410c") return null;
  let accent = c;
  for (let i = 0; i < 20 && contrast(accent, WHITE) < 4.5; i++) accent = mix(accent, BLACK, 0.08);
  let onDark = c;
  for (let i = 0; i < 20 && contrast(onDark, HERO) < 7; i++) onDark = mix(onDark, WHITE, 0.1);
  // Own names, mapped onto the template's variables in site.css, so light and
  // dark mode each pick the readable variant.
  return {
    "--brand-accent": toHex(accent),
    "--brand-accent-light": toHex(onDark),
    "--brand-soft": toHex(mix(c, WHITE, 0.9)),
    "--brand-soft-dark": toHex(mix(c, HERO, 0.82)),
  };
}
