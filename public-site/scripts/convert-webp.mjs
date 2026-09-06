/* ============================================================
   convert-webp.mjs — pre-optimize images to WebP at build time (TOR gap
   audit — PageSpeed/Core Web Vitals: next.config.mjs's own comment already
   flagged `images:{unoptimized:true}` against "TOR 4.1.6" without a fix;
   Next's built-in image optimizer needs a request-time server, which
   `output:"export"` genuinely can't run, so the fix has to happen at BUILD
   time instead). Several of these PNGs are 2-3MB EACH for what's a single
   hero/carousel image — a real, measurable LCP/bandwidth problem, not a
   theoretical one.

   One-off setup script, not a build step: walks both tenants' real
   public/assets/{orst,royalsociety}/images directories and writes a .webp
   sibling next to every .png/.jpg/.jpeg (originals untouched, kept as the
   <picture> fallback for browsers old enough not to support WebP — vanishingly
   rare today, but free to keep). Re-run by hand after adding new images.

   Usage: node scripts/convert-webp.mjs
   ============================================================ */
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOTS = [
  path.join(__dirname, '..', 'public', 'assets', 'orst', 'images'),
  path.join(__dirname, '..', 'public', 'assets', 'royalsociety', 'images'),
];
const EXT_RE = /\.(png|jpe?g)$/i;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (EXT_RE.test(entry.name)) out.push(p);
  }
  return out;
}

async function main() {
  let converted = 0, savedBytes = 0;
  for (const root of ROOTS) {
    let files;
    try { files = walk(root); } catch { continue; }
    for (const file of files) {
      const webpPath = file.replace(EXT_RE, '.webp');
      const before = statSync(file).size;
      await sharp(file).webp({ quality: 82 }).toFile(webpPath);
      const after = statSync(webpPath).size;
      savedBytes += before - after;
      converted++;
      console.log(path.relative(process.cwd(), file), `${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB`);
    }
  }
  console.log(`\nconverted ${converted} image(s), saved ${(savedBytes / 1024 / 1024).toFixed(1)}MB total`);
}

main().catch((e) => { console.error(e); process.exit(1); });
