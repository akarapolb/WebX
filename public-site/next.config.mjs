import { publicCmsUrl } from "./lib/publicCmsRule.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export: the whole point of Phase 4 — content is fetched from
  // Strapi at BUILD time (see lib/cms.ts), the output is plain HTML/JS/CSS,
  // deployable to the same static hosting/CDN site/DGA-Website uses today.
  output: "export",
  // NEXT_DIST_DIR lets a production build run next to `next dev` (which keeps
  // .next/) without either breaking the other, e.g. NEXT_DIST_DIR=.next-build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Static export can't run Next's image-optimization server.
  images: { unoptimized: true },
  // WORDPRESS_URL added alongside STRAPI_URL — useSiteSearch.ts (TOR gap
  // audit) is the first CLIENT-side WordPress call this app makes; every
  // existing one (lib/cms.ts) runs server-side at build time, where a plain
  // (non-inlined) env var is enough.
  //
  // The browser never gets STRAPI_URL (the build machine's CMS address):
  // client code calls PUBLIC_CMS_URL, which is "" — calls switched off — when
  // the build reads a CMS on localhost but the site is published elsewhere
  // (lib/publicCmsRule.mjs). Server code reads STRAPI_URL from the
  // environment as before (lib/cms.ts).
  env: {
    PUBLIC_CMS_URL: publicCmsUrl(process.env),
    WORDPRESS_URL: process.env.WORDPRESS_URL || "http://localhost:8081/wp-json",
  },
};
export default nextConfig;
