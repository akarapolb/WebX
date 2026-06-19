/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // WebX Studio talks to a Strapi backend via server-side BFF routes only.
  env: { STRAPI_URL: process.env.STRAPI_URL || "http://localhost:1337" },
};
export default nextConfig;
