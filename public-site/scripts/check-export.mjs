#!/usr/bin/env node
// Post-build check of the static export: fails the build (exit 1) when a page
// came out broken, so a bad export never gets published.
//
//   - every .html page: no Next.js error page, has a <main> landmark and a <title>
//   - every .json file parses
//   - internal links on pages of the tenants in CHECK_LINKS (default "dgahub";
//     "*" for all) point at a file that exists in the export
//   - when the site is published somewhere public (PUBLIC_SITE_URL not
//     localhost), no JS chunk contains the build machine's CMS addresses
//     (STRAPI_URL, default http://localhost:1337; WORDPRESS_URL, default
//     http://localhost:8081/wp-json; WEBX_CONTROL_URL when it is a local address)
//
// Usage: node scripts/check-export.mjs [exportDir]   (default: $NEXT_DIST_DIR or out)
// Runs as the last step of `npm run build`.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isLocalUrl, DEFAULT_STRAPI_URL, DEFAULT_WORDPRESS_URL } from "../lib/publicCmsRule.mjs";

/** @param {string} dir @param {Record<string, string | undefined>} [env] @returns {string[]} */
export function checkExport(dir, env = process.env) {
  const problems = [];
  if (!existsSync(dir)) return [`export folder not found: ${dir}`];
  const files = [];
  (function walk(d) {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p); else files.push(p);
    }
  })(dir);
  const rel = (p) => "/" + relative(dir, p).split(sep).join("/");
  const all = new Set(files.map(rel));

  const linkTenants = String(env.CHECK_LINKS ?? "dgahub").split(",").map((s) => s.trim()).filter(Boolean);
  const checkLinksOn = (page) => linkTenants.includes("*") || linkTenants.some((t) => page === `/${t}.html` || page.startsWith(`/${t}/`) || page === `/en/${t}.html` || page.startsWith(`/en/${t}/`));
  const exists = (path) => {
    const p = decodeURI(path.replace(/[?#].*$/, "")).replace(/\/$/, "");
    if (p === "") return all.has("/index.html");
    return all.has(p) || all.has(p + ".html") || all.has(p + "/index.html");
  };

  for (const f of files) {
    const page = rel(f);
    if (page.startsWith("/_next/")) continue;
    if (f.endsWith(".json")) {
      try { JSON.parse(readFileSync(f, "utf8")); } catch (e) { problems.push(`${page}: invalid JSON (${e.message})`); }
      continue;
    }
    if (!f.endsWith(".html")) continue;
    const html = readFileSync(f, "utf8");
    // A route with no real params exports one "_" placeholder that renders
    // notFound() (output:"export" rejects an empty list); that is not a page.
    if (/\/_(\/|\.html$)/.test(page)) continue;
    if (/id="__next_error__"/.test(html) || /Application error: a (client|server)-side exception/.test(html)) {
      problems.push(`${page}: rendered as a Next.js error page`);
      continue;
    }
    // Next's own 404 for unknown routes (/404.html, /_not-found.html) is exempt from the landmark rule.
    const isNextNotFound = page === "/404.html" || page === "/_not-found.html";
    if (!isNextNotFound && !/<main[\s>]/.test(html)) problems.push(`${page}: no <main> landmark (empty or broken page)`);
    if (!/<title>[^<]+<\/title>/.test(html)) problems.push(`${page}: no <title>`);
    if (checkLinksOn(page)) {
      const body = html.replace(/<script[\s\S]*?<\/script>/g, "");
      for (const m of body.matchAll(/<a\s[^>]*href="(\/[^"]*)"/g)) {
        const href = m[1].replace(/&amp;/g, "&");
        if (href.startsWith("//") || href.startsWith("/_next/")) continue;
        if (!exists(href)) problems.push(`${page}: broken link ${href}`);
      }
    }
  }

  const site = env.PUBLIC_SITE_URL || "http://localhost:3100";
  if (!isLocalUrl(site)) {
    // host:port only, so "http://localhost:8081" and "localhost:8081/wp-json" both match
    const needles = [env.STRAPI_URL || DEFAULT_STRAPI_URL, env.WORDPRESS_URL || DEFAULT_WORDPRESS_URL, env.WEBX_CONTROL_URL]
      .filter(isLocalUrl)
      .map((u) => u.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
    for (const f of files) {
      if (!f.endsWith(".js") || !needles.length) continue;
      const js = readFileSync(f, "utf8");
      for (const needle of needles) {
        if (js.includes(needle)) problems.push(`${rel(f)}: contains the build machine's CMS address ${needle}`);
      }
    }
  }
  return [...new Set(problems)];
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(sep).join("/").replace(/^.*\/scripts\//, "/scripts/"));
if (isMain) {
  const dir = process.argv[2] || join(process.cwd(), process.env.NEXT_DIST_DIR || "out");
  const problems = checkExport(dir);
  if (problems.length) {
    console.error(`[check-export] ${problems.length} problem(s) in ${dir}:`);
    for (const p of problems.slice(0, 50)) console.error("  - " + p);
    if (problems.length > 50) console.error(`  … and ${problems.length - 50} more`);
    process.exit(1);
  }
  console.log(`[check-export] OK: ${dir}`);
}
