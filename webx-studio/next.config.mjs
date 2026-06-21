/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lean container image: a self-contained server in .next/standalone.
  output: "standalone",
  // WebX Studio talks to a Strapi backend via server-side BFF routes only.
  env: { STRAPI_URL: process.env.STRAPI_URL || "http://localhost:1337" },
};
export default nextConfig;
