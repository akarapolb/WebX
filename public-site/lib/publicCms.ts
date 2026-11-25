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

/** Browser-facing WebX control plane base URL (PUBLIC_CONTROL_URL, lib/publicCmsRule.mjs), "" while the browser's
 *  calls all go to the CMS. */
export const PUBLIC_CONTROL: string = (process.env.PUBLIC_CONTROL_URL || "").replace(/\/$/, "");

/** Where the browser calls a route the control plane already serves (the cookie-consent log, a tenant's contact
 *  lookup): the control plane when PUBLIC_CONTROL_URL is set, else the CMS as before. "" switches the call off. */
export const PUBLIC_RUNTIME: string = PUBLIC_CONTROL || PUBLIC_CMS;

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
