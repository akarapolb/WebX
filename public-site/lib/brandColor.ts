// Same hex/shade/rgba math as assets/tenant.js's brand-color logic, ported
// to run once at build time instead of on every client-side page load.
// Shared by HomePage.tsx and PageRenderer.tsx — every tenant page injects
// the same three CSS custom properties from the tenant's own brand color.
function hex(c: string): [number, number, number] {
  let h = c.replace("#", "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function shade(c: string, pct: number): string {
  const [r, g, b] = hex(c);
  const f = (x: number) => Math.max(0, Math.min(255, Math.round((x * (100 + pct)) / 100)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function rgba(c: string, a: number): string {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}

export function brandCssVars(primary: string): string {
  return `:root{--c-primary:${primary};--c-primary-700:${shade(primary, -22)};--c-primary-50:${rgba(primary, 0.1)}}`;
}
