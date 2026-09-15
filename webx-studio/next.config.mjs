/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lean container image: a self-contained server in .next/standalone.
  output: "standalone",
  // WebX Studio talks to a Strapi backend via server-side BFF routes only —
  // and only from server code (route handlers, never a "use client"
  // component), so it needs no help from next.config.js's `env` key at all.
  // That key isn't a runtime default: Next.js statically inlines it into the
  // compiled bundle at BUILD time, permanently replacing every
  // `process.env.STRAPI_URL` reference with whatever the value was during
  // `npm run build` — in this Docker image, that's the build stage, which
  // never has STRAPI_URL set (only the final container does, via
  // docker-compose's `environment:`). The result: the running server always
  // used the literal fallback "http://localhost:1337" baked in at build
  // time, no matter what STRAPI_URL was set to at container start — every
  // login and background agent-worker/scheduler call silently tried to
  // reach Strapi on the webx container's own loopback instead of the real
  // `strapi` service, and failed with "fetch failed" every time. Removing
  // this lets `process.env.STRAPI_URL` in lib/config.ts resolve normally, at
  // runtime, like any other server-only env var.
};
export default nextConfig;
