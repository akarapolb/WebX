// Regenerates data/mui-icons.json — the catalogue the Visual Builder's icon
// picker searches.
//
//   npm i -D @mui/icons-material && node scripts/gen-mui-icons.mjs
//
// @mui/icons-material is ~19MB unpacked and is NOT a dependency of this app:
// it's installed only to run this script, and the committed JSON is what
// ships. Nothing here ever reaches the browser or the public site either —
// picking an icon copies that one icon's path data onto an Icon record, so a
// page only ever carries the handful of icons it actually uses.
//
// Only the default (filled) variant is taken. MUI also ships Outlined,
// Rounded, Sharp and TwoTone versions of nearly every icon, which would turn
// ~2,000 entries into ~10,000 near-duplicates for a picker nobody could scan.

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "..", "data", "mui-icons.json");

function findPackage() {
  for (const base of [resolve(here, "..", "node_modules"), resolve(here, "..", "..", "node_modules")]) {
    const p = join(base, "@mui", "icons-material");
    if (existsSync(p)) return p;
  }
  throw new Error("@mui/icons-material not found — install it first: npm i -D @mui/icons-material");
}

// The compiled module for one icon wraps its SVG children in jsx() calls:
//   jsx("path", { d: "M15.5 14h-.79..." })
// Multi-part icons emit several, and some carry fillRule/clipRule, which
// changes how overlapping subpaths render — dropping those would silently
// turn a few icons into solid blobs, so they're kept.
// Matched on the `"path", {` call shape rather than on `jsx(`, because the
// published CJS build emits the helper indirectly — `(0, _jsxRuntime.jsx)("path", {…})`.
const PATH_RE = /"path"\s*,\s*\{([^}]*)\}/g;
const ATTR = (body, name) => {
  const m = body.match(new RegExp(name + '\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));
  return m ? m[1] : null;
};

// A variant suffix, not an icon of its own.
const VARIANT_RE = /(Outlined|Rounded|Sharp|TwoTone)\.js$/;

function collect(dir) {
  const icons = [];
  let skippedNoPath = 0;
  let skippedNonPath = 0;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".js") || file.endsWith(".d.ts")) continue;
    if (VARIANT_RE.test(file)) continue;
    if (file === "index.js" || file.startsWith("utils")) continue;
    const name = file.slice(0, -3);
    const src = readFileSync(join(dir, file), "utf8");
    if (!src.includes("createSvgIcon")) continue;

    // An icon built from <circle>/<g>/<rect> rather than <path> can't be
    // reduced to path data — skipped rather than shipped half-drawn.
    const nonPath = /"(circle|rect|g|polygon|ellipse|line|polyline)"\s*,\s*\{/.test(src);

    const paths = [];
    for (const m of src.matchAll(PATH_RE)) {
      const d = ATTR(m[1], "d");
      if (!d) continue;
      const p = { d };
      const fillRule = ATTR(m[1], "fillRule");
      const clipRule = ATTR(m[1], "clipRule");
      const opacity = ATTR(m[1], "opacity");
      if (fillRule) p.fillRule = fillRule;
      if (clipRule) p.clipRule = clipRule;
      if (opacity) p.opacity = opacity;
      paths.push(p);
    }
    if (!paths.length) { skippedNoPath++; continue; }
    if (nonPath) { skippedNonPath++; continue; }
    icons.push({ name, paths });
  }
  icons.sort((a, b) => a.name.localeCompare(b.name));
  return { icons, skippedNoPath, skippedNonPath };
}

const pkg = findPackage();
const version = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")).version;
const { icons, skippedNoPath, skippedNonPath } = collect(pkg);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ source: "@mui/icons-material", version, viewBox: "0 0 24 24", icons }) + "\n");

console.log(`wrote ${OUT}`);
console.log(`  ${icons.length} icons from @mui/icons-material@${version}`);
console.log(`  skipped ${skippedNoPath} with no path data, ${skippedNonPath} using non-path shapes`);
