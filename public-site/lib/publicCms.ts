// The CMS address the VISITOR'S BROWSER uses (assistant, forms, cookie
// consent, captcha, contact lookups), as opposed to STRAPI_URL, which the build
// uses to fetch content. They differ when the CMS is reachable from the build
// machine but not from the internet: a public copy built against
// http://localhost:1337 must not ship that address in its JavaScript.
//
// next.config.mjs works the value out once (lib/publicCmsRule.mjs) and inlines
// it as process.env.PUBLIC_CMS_URL; "" means the published site has no CMS.
// Set PUBLIC_CMS_URL=https://cms.example.go.th for a hosted CMS, or "off".

/** Browser-facing CMS base URL, "" when the published site has no CMS. */
export const PUBLIC_CMS: string = (process.env.PUBLIC_CMS_URL || "").replace(/\/$/, "");

/** False on a public copy with no reachable CMS: blocks that call the CMS from
 *  the browser (assistant, form) show components/site/OfflineNote instead, and
 *  cookie-consent logging, captcha and contact lookups are skipped. */
export const CMS_REACHABLE = PUBLIC_CMS !== "";

/** Browser-facing WordPress REST base (…/wp-json), "" when the published site
 *  has no reachable WordPress (same rule, lib/publicCmsRule.mjs). Used by the
 *  WordPress tenants' polls, breaking-news banner, site search, captcha and
 *  forms; each skips its call or shows its "unavailable" state when "". */
export const PUBLIC_WP: string = (process.env.PUBLIC_WORDPRESS_URL || "").replace(/\/$/, "");
export const WP_REACHABLE = PUBLIC_WP !== "";
