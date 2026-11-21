/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lean container image: a self-contained server in .next/standalone.
  output: "standalone",
  // NEXT_DIST_DIR lets a production build run next to `next dev` (which keeps
  // .next/), e.g. NEXT_DIST_DIR=.next-prod for a demo build. Default .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // WebX Studio talks to a Strapi backend via server-side BFF routes only.
  env: { STRAPI_URL: process.env.STRAPI_URL || "http://localhost:1337" },
};
export default nextConfig;
