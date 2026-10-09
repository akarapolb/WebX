/* ============================================================
   prepare-theme-fonts.mjs — build step, run by docker/builder.mjs before
   `next build` (and by hand: `STRAPI_URL=http://localhost:1337 node
   scripts/prepare-theme-fonts.mjs`).

   Reads each theme-enabled tenant's saved theme from Strapi, collects the
   Google fonts picked in Branding → Theme and self-hosts them (see
   google-fonts.mjs for why and for the safety rules).

   It NEVER fails the build: Strapi or Google being unreachable just means the
   pages fall back to the theme's default fonts, which is a far better outcome
   than a site that cannot be republished. Problems are logged and written to
   .theme-fonts-status.json (project root, NOT under public/ — the export would publish it) so they are not silent.
   ============================================================ */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { clearFonts, prepareFonts, themeGoogleFamilies } from "./google-fonts.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "public", "fonts", "google");
const STATUS = path.join(root, ".theme-fonts-status.json"); // kept out of public/: everything there is published
const STRAPI = (process.env.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");
// Tenants whose layout links /fonts/google/fonts.css (see app/orst/layout.tsx).
const TENANTS = (process.env.THEME_FONT_TENANTS || "orst").split(",").map((s) => s.trim()).filter(Boolean);
const log = (...a) => console.log(new Date().toISOString(), "[theme-fonts]", ...a);

async function tenantTheme(key) {
  const r = await fetch(`${STRAPI}/api/tenants/resolve?tenant=${encodeURIComponent(key)}&locale=th`, {
    headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Strapi answered ${r.status} for tenant ${key}`);
  const j = await r.json();
  return j?.data?.brand?.theme;
}

async function main() {
  const families = [];
  for (const t of TENANTS) {
    try {
      for (const f of themeGoogleFamilies(await tenantTheme(t))) if (!families.includes(f)) families.push(f);
    } catch (e) {
      log("could not read the theme of", t, "-", String(e?.message || e));
    }
  }
  if (!families.length) {
    // Nothing picked: make sure no stale files from an earlier build are shipped.
    await clearFonts(OUT);
    log("no Google fonts in use");
    return;
  }
  log("self-hosting:", families.join(", "));
  const result = await prepareFonts(families, OUT, { log });
  await writeFile(STATUS, JSON.stringify({ at: new Date().toISOString(), ...result }, null, 2));
  if (result.failed.length) log("WARNING — falling back to the default fonts for:", result.failed.map((f) => f.family).join(", "));
}

main().catch((e) => { log("failed (build continues):", String(e?.message || e)); }).finally(() => process.exit(0));
