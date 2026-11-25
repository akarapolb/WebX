// Which CMS address the visitor's browser may call — the rule behind
// process.env.PUBLIC_CMS_URL and process.env.PUBLIC_WORDPRESS_URL (see
// lib/publicCms.ts). Plain .mjs so next.config.mjs, scripts and tests can
// import it.
//
//   PUBLIC_CMS_URL set        → used as is ("" or "off" switches browser calls off)
//   not set, STRAPI_URL local and PUBLIC_SITE_URL public → "" (off)
//   otherwise                 → STRAPI_URL (local development keeps working)
//
// WordPress follows the same rule with PUBLIC_WORDPRESS_URL / WORDPRESS_URL
// (default http://localhost:8081/wp-json). The older NEXT_PUBLIC_WORDPRESS_URL
// still counts as an explicit browser address when it is set.

export const isLocalUrl = (u) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(String(u || ""));

export const DEFAULT_STRAPI_URL = "http://localhost:1337";
export const DEFAULT_WORDPRESS_URL = "http://localhost:8081/wp-json";
const DEFAULT_SITE_URL = "http://localhost:3100";

const trim = (u) => String(u).replace(/\/$/, "");

function publicUrl(explicit, buildUrl, site) {
  if (explicit !== undefined) return explicit === "off" ? "" : trim(explicit);
  const base = trim(buildUrl);
  return isLocalUrl(base) && !isLocalUrl(site) ? "" : base;
}

export function publicCmsUrl(env) {
  return publicUrl(env.PUBLIC_CMS_URL, env.STRAPI_URL || DEFAULT_STRAPI_URL, env.PUBLIC_SITE_URL || DEFAULT_SITE_URL);
}

// The WebX control plane's address as the visitor's browser reaches it (webx-control), or "" while all of the site's
// browser calls still go to the CMS. Where the control plane already serves a route the browser calls (the cookie-consent
// log, the tenant lookup), the browser calls it there instead of at PUBLIC_CMS_URL (docs/target-architecture.md, track
// C5). No default: the control plane is optional, and WEBX_CONTROL_URL (what the BUILD reads tenants from) is separate.
export function publicControlUrl(env) {
  const u = env.PUBLIC_CONTROL_URL;
  return u === undefined || u === "off" ? "" : trim(u);
}

export function publicWordpressUrl(env) {
  const explicit = env.PUBLIC_WORDPRESS_URL !== undefined ? env.PUBLIC_WORDPRESS_URL : (env.NEXT_PUBLIC_WORDPRESS_URL || undefined);
  return publicUrl(explicit, env.WORDPRESS_URL || DEFAULT_WORDPRESS_URL, env.PUBLIC_SITE_URL || DEFAULT_SITE_URL);
}
