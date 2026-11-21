#!/usr/bin/env node
// Post-build: give every exported page under out/en/ a real <html lang="en">.
//
// Only one layout may render <html>, and a static export has no request to
// pick the language from, so the root layout bakes lang="th" into every page
// and corrects it with an inline script before paint (see app/layout.tsx).
// That works for visitors running JavaScript; this makes the exported HTML
// itself right too, for crawlers and assistive tech that read the raw file.
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

// The export folder: out/, or NEXT_DIST_DIR when set (see next.config.mjs).
const OUT = join(process.cwd(), process.env.NEXT_DIST_DIR || "out");
const root = join(OUT, "en");
let n = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".html")) {
      const s = readFileSync(p, "utf8");
      const out = s.replace(/<html lang="th"/, '<html lang="en"');
      if (out !== s) { writeFileSync(p, out); n++; }
    }
  }
}
// out/en.html is the /en page itself (sits beside the out/en/ folder).
const enPage = join(OUT, "en.html");
if (existsSync(enPage)) {
  const s = readFileSync(enPage, "utf8");
  const out = s.replace(/<html lang="th"/, '<html lang="en"');
  if (out !== s) { writeFileSync(enPage, out); n++; }
}
if (existsSync(root)) walk(root);
console.log(`[set-html-lang] lang="en" on ${n} page(s)`);
