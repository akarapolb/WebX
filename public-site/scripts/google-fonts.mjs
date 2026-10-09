/* ============================================================
   google-fonts.mjs — self-host the Google Fonts an admin picked in
   WebX Studio (Branding → Theme).

   Why this exists: the site deliberately serves its fonts from its own
   origin (see fetch-fonts.mjs — a visitor's browser must never call Google's
   CDN: it costs a render-blocking round trip and sends the visitor's IP to a
   third party). That is easy for the two bundled families. For "any Google
   font" it is done at BUILD time instead: the site-builder runs
   prepare-theme-fonts.mjs before `next build`, which asks Google's CSS API
   for just the picked families, downloads the woff2 files and writes
   public/fonts/google/fonts.css. Visitors only ever load same-origin files.

   Everything that reaches a URL or a stylesheet here came from a value an
   admin can write (brand.theme), so nothing is trusted:
     - the family must match FAMILY_RE (letters, digits, spaces — no quote,
       brace, slash, semicolon or anything else that could end a CSS string or
       a URL);
     - only https://fonts.gstatic.com/ files are downloaded;
     - file names are derived from a slug and a hash, never from remote text;
     - unicode-range values are re-matched against a strict pattern.

   Plain Node, no dependencies (the builder image has none to spare).
   The pure functions take an injectable `fetchImpl` so they are unit-tested
   without a network.
   ============================================================ */
import { createHash } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/** A theme font value is either a built-in key ("plex-sans") or "google:<Family>". */
export const GOOGLE_PREFIX = "google:";
// Keep in sync with lib/theme.ts (and webx-studio/lib/theme.ts); lib/googleFonts.test.ts checks it.
export const FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{0,40}$/;

/** Only these Google subsets are kept — this site is Thai/English. */
export const KEEP_SUBSETS = new Set(["thai", "latin", "latin-ext"]);
/** The weights the theme can ask for (body 300–500, headings 500–700) plus 400/600 used by the stylesheet. */
export const WEIGHTS = [300, 400, 500, 600, 700];

const GSTATIC = "https://fonts.gstatic.com/";
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const UNICODE_RANGE_RE = /^U\+[0-9A-Fa-f?]{1,6}(?:-[0-9A-Fa-f]{1,6})?(?:\s*,\s*U\+[0-9A-Fa-f?]{1,6}(?:-[0-9A-Fa-f]{1,6})?)*$/;
// Google serves woff2 only to clients whose UA it recognises as supporting it.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** "google:Prompt" → "Prompt"; anything else (built-in keys, junk, injection attempts) → null. */
export function googleFamilyOf(key) {
  if (typeof key !== "string" || !key.startsWith(GOOGLE_PREFIX)) return null;
  const family = key.slice(GOOGLE_PREFIX.length);
  return FAMILY_RE.test(family) ? family : null;
}

/** The distinct Google families a (raw, untrusted) theme asks for. */
export function themeGoogleFamilies(theme) {
  const fonts = theme && typeof theme === "object" && theme.fonts && typeof theme.fonts === "object" ? theme.fonts : {};
  const out = [];
  for (const role of ["display", "body"]) {
    const f = googleFamilyOf(fonts[role]);
    if (f && !out.includes(f)) out.push(f);
  }
  return out;
}

/** Google answers with, per subset, a comment naming it followed by an @font-face block. */
export function parseGoogleCss(css) {
  const parts = String(css).split(/\/\*\s*([\w-]+)\s*\*\//).slice(1);
  const blocks = [];
  for (let i = 0; i < parts.length; i += 2) {
    const subset = parts[i];
    const body = parts[i + 1] || "";
    if (!KEEP_SUBSETS.has(subset)) continue;
    const url = (body.match(/src:\s*url\(([^)]+)\)\s*format\('woff2'\)/) || [])[1];
    const weight = Number((body.match(/font-weight:\s*(\d+)/) || [])[1]);
    const style = (body.match(/font-style:\s*(normal|italic)/) || [])[1] || "normal";
    const range = ((body.match(/unicode-range:\s*([^;]+);/) || [])[1] || "").trim();
    if (!url || !weight || !url.startsWith(GSTATIC)) continue;
    // Italic faces are not used by the stylesheet — skip them rather than ship dead weight.
    if (style !== "normal") continue;
    blocks.push({ subset, weight, url, unicodeRange: UNICODE_RANGE_RE.test(range) ? range : "" });
  }
  return blocks;
}

const cssUrl = (family, weights) =>
  "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(family).replace(/%20/g, "+") +
  ":wght@" + weights.join(";") + "&display=swap";

/**
 * The @font-face blocks Google has for a family, for every weight in `weights`
 * it actually offers. Google answers 400 when ANY requested weight is missing
 * (many families ship only 400/700), so on a 400 each weight is asked for on
 * its own and the ones that exist are kept. Throws if the family is unknown.
 */
export async function fetchFamilyBlocks(family, { fetchImpl = fetch, weights = WEIGHTS } = {}) {
  if (!FAMILY_RE.test(family)) throw new Error("invalid family name");
  const get = (w) => fetchImpl(cssUrl(family, w), { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  const all = await get(weights);
  if (all.ok) return parseGoogleCss(await all.text());
  if (all.status !== 400) throw new Error("Google Fonts answered " + all.status);
  const blocks = [];
  for (const w of weights) {
    const one = await get([w]);
    if (one.ok) blocks.push(...parseGoogleCss(await one.text()));
    else if (one.status !== 400) throw new Error("Google Fonts answered " + one.status);
  }
  if (!blocks.length) throw new Error("Google Fonts has no family named " + JSON.stringify(family));
  return blocks;
}

const slug = (family) => family.toLowerCase().replace(/ /g, "-");
export const fileNameFor = (family, b) =>
  `${slug(family)}-${b.weight}-${b.subset}-${createHash("sha1").update(b.url).digest("hex").slice(0, 8)}.woff2`;

export function renderFontFace(family, b, file, urlBase = "/fonts/google/") {
  return [
    "@font-face {",
    `  font-family: '${family}';`,
    "  font-style: normal;",
    `  font-weight: ${b.weight};`,
    "  font-display: swap;",
    `  src: url('${urlBase}${file}') format('woff2');`,
    ...(b.unicodeRange ? [`  unicode-range: ${b.unicodeRange};`] : []),
    "}",
  ].join("\n");
}

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

/** Download one block's file unless it is already there (file names are content-addressed). */
async function download(b, dest, fetchImpl) {
  if (await exists(dest)) return;
  const r = await fetchImpl(b.url, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error("font file answered " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length || buf.length > MAX_FILE_BYTES) throw new Error("unexpected font file size " + buf.length);
  await writeFile(dest + ".part", buf);
  await rename(dest + ".part", dest);
}

/**
 * Download the given families into `outDir` and write `outDir/fonts.css`.
 * Never throws for one bad family — it is reported in `failed` and left out, so
 * a typo or a Google outage costs that font (the page falls back to the
 * theme's default stack) rather than the whole build.
 */
export async function prepareFonts(families, outDir, { fetchImpl = fetch, weights = WEIGHTS, log = () => {} } = {}) {
  await mkdir(outDir, { recursive: true });
  const rules = [];
  const ok = [];
  const failed = [];
  for (const family of families) {
    try {
      const blocks = await fetchFamilyBlocks(family, { fetchImpl, weights });
      if (!blocks.length) throw new Error("no usable font files (no thai/latin subset)");
      const faces = [];
      for (const b of blocks) {
        const file = fileNameFor(family, b);
        await download(b, path.join(outDir, file), fetchImpl);
        faces.push(renderFontFace(family, b, file));
      }
      rules.push(`/* ${family} */`, ...faces);
      ok.push(family);
      log("font ready:", family, `(${blocks.length} files)`);
    } catch (e) {
      failed.push({ family, error: String(e?.message || e) });
      log("font FAILED:", family, "-", String(e?.message || e));
    }
  }
  const css = "/* Generated by scripts/prepare-theme-fonts.mjs from the picked theme fonts — do not edit. */\n" +
    (rules.length ? rules.join("\n\n") + "\n" : "");
  const tmp = path.join(outDir, "fonts.css.part");
  await writeFile(tmp, css);
  await rename(tmp, path.join(outDir, "fonts.css"));
  return { ok, failed };
}

/** Remove the generated files (used when no theme font needs them any more). */
export async function clearFonts(outDir) {
  await rm(outDir, { recursive: true, force: true });
}
