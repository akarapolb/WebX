/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export: the whole point of Phase 4 — content is fetched from
  // Strapi at BUILD time (see lib/cms.ts), the output is plain HTML/JS/CSS,
  // deployable to the same static hosting/CDN site/DGA-Website uses today.
  output: "export",
  // Static export can't run Next's image-optimization server.
  images: { unoptimized: true },
  env: { STRAPI_URL: process.env.STRAPI_URL || "http://localhost:1337" },
};
export default nextConfig;
