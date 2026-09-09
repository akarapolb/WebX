/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export — plain HTML/CSS/JS, deployable to the same static hosting
  // public-site already uses. No server needed for a marketing site.
  output: "export",
  images: { unoptimized: true },
  // Trailing slashes so /pricing exports as pricing/index.html — works on any
  // static host without a clean-URL rewrite rule.
  trailingSlash: true,
  env: {
    // Where the CTAs send people. Override per environment.
    NEXT_PUBLIC_STUDIO_URL: process.env.NEXT_PUBLIC_STUDIO_URL || "http://localhost:3001",
    NEXT_PUBLIC_CONTACT_EMAIL: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@webx.io",
  },
};
export default nextConfig;
