// Phase 7 — auto-rebuild the static public site on publish. Both underlying
// engines already solve "content changed, rebuild the static frontend" the
// same way in their headless usage: Strapi has a built-in Webhooks feature
// firing on entry.publish/etc.; headless WordPress bolts on the same pattern
// via a plugin. This replicates that at the governance layer instead of two
// separate per-engine webhooks, so it's consistent across both engines and
// every tenant from one place — see lib/cms/governance.ts's doPublish() and
// governed.unpublish(), the only two call sites that trigger this.
//
// Debounced + single-flight: a burst of publishes (a scheduled release
// publishing several items, or a few editors publishing close together)
// should produce ONE rebuild, not N, and never two builds running at once.
import "server-only";
import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";

const PUBLIC_SITE_DIR = process.env.PUBLIC_SITE_DIR || path.resolve(process.cwd(), "../public-site");
const AUTO_REBUILD = process.env.PUBLIC_SITE_AUTO_REBUILD !== "off";
const DEBOUNCE_MS = Number(process.env.PUBLIC_SITE_REBUILD_DEBOUNCE_MS || 20_000);
const BUILD_TIMEOUT_MS = 5 * 60_000; // guards against a hung build wedging the state machine forever

type BuildStatus = {
  building: boolean;
  lastBuiltAt: string | null;
  lastError: string | null;
};

let building = false;
let pendingRebuild = false;
let debounceTimer: NodeJS.Timeout | null = null;
let lastBuiltAt: string | null = null;
let lastError: string | null = null;

/** Schedule a rebuild — safe to call as often as you like; bursts collapse
 * into one build. Never awaited by callers: a debounce timer plus a build
 * that can take tens of seconds would otherwise hang the publish request
 * that triggered it. Failures are caught and logged here, not thrown —
 * same reasoning as writeAudit in governance.ts: a side-effect must never
 * roll back or surface as an error on the content action that triggered it. */
export function requestPublicSiteRebuild(): void {
  if (!AUTO_REBUILD || !existsSync(PUBLIC_SITE_DIR)) return;
  if (building) { pendingRebuild = true; return; }
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { debounceTimer = null; void runBuild(); }, DEBOUNCE_MS);
}

async function runBuild(): Promise<void> {
  building = true;
  try {
    await execBuild();
    lastBuiltAt = new Date().toISOString();
    lastError = null;
    console.log(`[public-site] rebuilt successfully at ${lastBuiltAt}`);
  } catch (e: any) {
    lastError = e?.message || String(e);
    console.error(`[public-site] rebuild failed: ${lastError}`);
  } finally {
    building = false;
    if (pendingRebuild) {
      // Something published again while this build was running — its
      // content may not be in the build that just finished, so run once
      // more rather than debouncing again (things have already gone quiet
      // once; no need to wait another full DEBOUNCE_MS).
      pendingRebuild = false;
      void runBuild();
    }
  }
}

async function execBuild(): Promise<void> {
  // Next.js's on-disk fetch cache (.next/cache) persists ACROSS separate
  // `next build` invocations, not just within one — without clearing it
  // first, a rebuild can silently serve a previous build's stale fetched
  // content instead of what was just published (found live: a rebuild ran
  // successfully but the just-published post was missing from the output).
  // Static export still needs a per-fetch cache DURING one build (that's
  // why lib/cms.ts never sets cache:"no-store" — see its own comment); this
  // clears the cache BETWEEN builds instead, which achieves freshness
  // without breaking static export.
  await rm(path.join(PUBLIC_SITE_DIR, ".next"), { recursive: true, force: true });
  // exec() inherits the parent process's env by default — since this module
  // only ever runs inside webx-studio's OWN `next dev` process, that means
  // NODE_ENV=development and assorted Next-internal PORT/__NEXT_*/NEXT_*
  // vars leak into the child `next build` too. Not cosmetic: it made the
  // child load React's development server-rendering bundle during static
  // export and crash outright (found live — every auto-triggered rebuild
  // failed on /_error/404 while the identical command succeeded from a
  // plain terminal, which doesn't carry those vars). Strip them explicitly
  // rather than setting to undefined, which child_process does not treat
  // as "unset" the same way across Node versions.
  const buildEnv: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  for (const [k, v] of Object.entries(process.env)) {
    if (v == null || k === "NODE_ENV") continue;
    if (k === "PORT" || k.startsWith("__NEXT_") || k.startsWith("NEXT_RUNTIME")) continue;
    buildEnv[k] = v;
  }
  return new Promise((resolve, reject) => {
    exec("npm run build", { cwd: PUBLIC_SITE_DIR, timeout: BUILD_TIMEOUT_MS, env: buildEnv }, (err: Error | null, _stdout: string, stderr: string) => {
      if (err) reject(new Error(stderr?.slice(-500) || err.message));
      else resolve();
    });
  });
}

export function getPublicSiteBuildStatus(): BuildStatus {
  return { building, lastBuiltAt, lastError };
}
