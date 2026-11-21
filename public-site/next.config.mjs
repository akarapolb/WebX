import { publicCmsUrl, publicWordpressUrl } from "./lib/publicCmsRule.mjs";

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
  // The browser never gets STRAPI_URL or WORDPRESS_URL (the build machine's
  // CMS addresses): client code calls PUBLIC_CMS_URL / PUBLIC_WORDPRESS_URL,
  // which are "" — calls switched off — when the build reads a CMS on
  // localhost but the site is published elsewhere (lib/publicCmsRule.mjs).
  // Server code reads STRAPI_URL / WORDPRESS_URL from the environment as
  // before (lib/cms.ts).
  env: {
    PUBLIC_CMS_URL: publicCmsUrl(process.env),
    PUBLIC_WORDPRESS_URL: publicWordpressUrl(process.env),
  },
};
export default nextConfig;
