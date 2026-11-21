// Which CMS address the visitor's browser may call — the rule behind
// process.env.PUBLIC_CMS_URL (see lib/publicCms.ts). Plain .mjs so
// next.config.mjs, scripts and tests can import it.
//
//   PUBLIC_CMS_URL set        → used as is ("" or "off" switches browser calls off)
//   not set, STRAPI_URL local and PUBLIC_SITE_URL public → "" (off)
//   otherwise                 → STRAPI_URL (local development keeps working)

export const isLocalUrl = (u) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(String(u || ""));

export function publicCmsUrl(env) {
  const set = env.PUBLIC_CMS_URL;
  if (set !== undefined) return set === "off" ? "" : set.replace(/\/$/, "");
  const strapi = (env.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");
  const site = env.PUBLIC_SITE_URL || "http://localhost:3100";
  return isLocalUrl(strapi) && !isLocalUrl(site) ? "" : strapi;
}
