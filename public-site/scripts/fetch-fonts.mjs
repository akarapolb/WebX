/* ============================================================
   fetch-fonts.mjs — self-host the Thai web fonts (TOR gap audit —
   PageSpeed/Core Web Vitals: every page loaded IBM Plex Sans Thai/Noto
   Serif Thai from Google's own CDN via a render-blocking <link
   rel="stylesheet">, an extra cross-origin round trip PageSpeed penalizes
   directly, and this codebase's own CSS already flagged the gap against
   "TOR 4.1.6" without ever fixing it).

   One-off setup script, not a build step: downloads the real current WOFF2
   files for exactly the weights this project actually uses, for the "thai"
   and "latin" unicode-range subsets only (this site has no cyrillic/greek/
   vietnamese content, so those Google Fonts subsets would just be dead
   weight — every OTHER subset Google's own CSS response includes is
   deliberately dropped here, not merely "kept but unused"), and writes
   public/fonts/fonts.css with local @font-face rules pointing at them.
   Re-run by hand if the weight set ever needs to change; the output is
   committed to the repo like any other static asset, not fetched at
   request or build time.

   Usage: node scripts/fetch-fonts.mjs
   ============================================================ */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, '..', 'public', 'fonts');
mkdirSync(FONTS_DIR, { recursive: true });

// A real desktop Chrome UA — Google Fonts serves woff2 (smaller, modern)
// only to clients whose UA it recognizes as supporting it; curl/wget's own
// default UA gets served woff/ttf instead.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Union of every weight either tenant's layout currently requests (orst:
// 300-700 body / 500-700 display; royalsociety: 400-800 body / 500-800
// display) — self-hosting one shared superset is simpler than two separate
// asset sets for what's visually the same two font families.
const FAMILIES = [
  { name: 'IBM Plex Sans Thai', param: 'IBM+Plex+Sans+Thai', weights: [300, 400, 500, 600, 700, 800] },
  { name: 'Noto Serif Thai', param: 'Noto+Serif+Thai', weights: [500, 600, 700, 800] },
];
const KEEP_SUBSETS = new Set(['thai', 'latin']);

async function main() {
  const cssRules = [];
  for (const fam of FAMILIES) {
    const url = `https://fonts.googleapis.com/css2?family=${fam.param}:wght@${fam.weights.join(';')}&display=swap`;
    const css = await fetch(url, { headers: { 'User-Agent': UA } }).then((r) => r.text());
    // Google's response is a sequence of `/* subset */\n@font-face{...}`
    // blocks — split on the subset comments to filter by KEEP_SUBSETS.
    const blocks = css.split(/\/\*\s*([\w-]+)\s*\*\//).slice(1);
    for (let i = 0; i < blocks.length; i += 2) {
      const subset = blocks[i];
      const block = blocks[i + 1];
      if (!KEEP_SUBSETS.has(subset)) continue;
      const srcMatch = block.match(/src:\s*url\(([^)]+)\)\s*format\('woff2'\)/);
      const weightMatch = block.match(/font-weight:\s*(\d+)/);
      const styleMatch = block.match(/font-style:\s*(\w+)/);
      if (!srcMatch || !weightMatch) continue;
      const fontUrl = srcMatch[1];
      const weight = weightMatch[1];
      const style = styleMatch ? styleMatch[1] : 'normal';
      const filename = `${fam.param.toLowerCase()}-${weight}-${subset}.woff2`;
      const bytes = Buffer.from(await fetch(fontUrl).then((r) => r.arrayBuffer()));
      writeFileSync(path.join(FONTS_DIR, filename), bytes);
      console.log('saved', filename, `(${bytes.length} bytes)`);
      const unicodeMatch = block.match(/unicode-range:\s*([^;]+);/);
      cssRules.push(
        `@font-face {\n` +
        `  font-family: '${fam.name}';\n` +
        `  font-style: ${style};\n` +
        `  font-weight: ${weight};\n` +
        `  font-display: swap;\n` +
        `  src: url('/fonts/${filename}') format('woff2');\n` +
        (unicodeMatch ? `  unicode-range: ${unicodeMatch[1].trim()};\n` : '') +
        `}`
      );
    }
  }
  const header =
    '/* Self-hosted Thai web fonts (TOR gap audit — see scripts/fetch-fonts.mjs\n' +
    '   for how this file and public/fonts/*.woff2 were generated; re-run that\n' +
    '   script rather than hand-editing this file if the weight set changes). */\n\n';
  writeFileSync(path.join(FONTS_DIR, 'fonts.css'), header + cssRules.join('\n\n') + '\n');
  console.log('wrote fonts.css with', cssRules.length, 'rules');
}

main().catch((e) => { console.error(e); process.exit(1); });
