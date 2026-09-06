/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export: the whole point of Phase 4 — content is fetched from
  // Strapi at BUILD time (see lib/cms.ts), the output is plain HTML/JS/CSS,
  // deployable to the same static hosting/CDN site/DGA-Website uses today.
  output: "export",
  // Static export can't run Next's image-optimization server.
  images: { unoptimized: true },
  // WORDPRESS_URL added alongside STRAPI_URL — useSiteSearch.ts (TOR gap
  // audit) is the first CLIENT-side WordPress call this app makes; every
  // existing one (lib/cms.ts) runs server-side at build time, where a plain
  // (non-inlined) env var is enough.
  env: {
    STRAPI_URL: process.env.STRAPI_URL || "http://localhost:1337",
    WORDPRESS_URL: process.env.WORDPRESS_URL || "http://localhost:8081/wp-json",
  },
};
export default nextConfig;
