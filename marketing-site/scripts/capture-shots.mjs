/* Capture real WebX Studio screenshots for the marketing site.
   Reuses e2e's Playwright and public-site's sharp — no extra dependencies
   in this app. Logs into the running Studio with a tenant-scoped editor so
   the dashboard shows real, non-empty counts, then captures 3 pages at
   1440×900 (dark theme, which is the Studio's default) to public/shots/.

   Pre-flight: Strapi (:1337) + WebX Studio (:3001) running; public-site-dev
   (:3100) too if you want the Visual Builder canvas populated.

   The account below MUST be a dedicated demo/showcase tenant, never a real
   customer's — these screenshots ship on the public marketing site. The
   default is WebX's own "เทศบาลตัวอย่าง" (Sample Municipality) showcase
   workspace (key "webx-showcase", self-serve-signed-up, seeded with
   clearly-fictional content — see the git history for how it was built).
   There is deliberately no default password baked in here: set
   SHOT_PASSWORD yourself (e.g. in marketing-site/.env.local, gitignored) —
   never hardcode a real credential into this committed script.

   Usage: npm run shots   (env: STUDIO_URL, SHOT_EMAIL, SHOT_PASSWORD) */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, unlinkSync } from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const { chromium } = createRequire(path.join(root, "e2e", "package.json"))("@playwright/test");
let sharp = null;
try { sharp = createRequire(path.join(root, "public-site", "package.json"))("sharp"); } catch { console.warn("sharp not found — keeping PNGs"); }

const STUDIO = (process.env.STUDIO_URL || "http://localhost:3001").replace(/\/$/, "");
const EMAIL = process.env.SHOT_EMAIL || "demo-editor@webx.io";
const PASS = process.env.SHOT_PASSWORD;
if (!PASS) throw new Error("Set SHOT_PASSWORD (the webx-showcase demo account's password) — no default is hardcoded here on purpose.");
const OUT = path.join(here, "..", "public", "shots");
mkdirSync(OUT, { recursive: true });

// settle = ms to wait after network idle: dashboard/compliance run live
// checks after first paint, the builder's canvas is an iframe of the real
// public site.
const SHOTS = [
  { name: "dashboard", path: "/dashboard", settle: 4000 },
  { name: "builder", path: "/builder", settle: 9000 },
  { name: "analytics", path: "/analytics", settle: 4000 },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark" });
const page = await ctx.newPage();

await page.goto(STUDIO + "/login");
await page.getByPlaceholder("admin@webx.io").fill(EMAIL);
await page.getByPlaceholder("••••••••").fill(PASS);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

for (const s of SHOTS) {
  await page.goto(STUDIO + s.path, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(s.settle);
  const png = path.join(OUT, s.name + ".png");
  await page.screenshot({ path: png });
  if (sharp) {
    await sharp(png).webp({ quality: 84 }).toFile(path.join(OUT, s.name + ".webp"));
    unlinkSync(png);
  }
  console.log("captured", s.name);
}
await browser.close();
