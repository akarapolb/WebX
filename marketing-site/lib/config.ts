// A production export with NEXT_PUBLIC_STUDIO_URL unset used to fall back to
// localhost silently — every "Start free" / "Sign in" CTA on the live site
// would have pointed at http://localhost:3001 and the build would have
// reported success (same silent-fallback shape as public-site's tenant
// fetchers, fixed in the 2026-09-12 audit as H14). Fail the build instead:
// `next build` runs this module at export time, so a missing var is a hard
// error with a message, not a broken site.
function required(name: string, devDefault: string): string {
  const v = process.env[name];
  if (v) return v;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`[marketing-site] ${name} must be set for a production build — every CTA on the site links to it.`);
  }
  return devDefault;
}

export const STUDIO_URL = required("NEXT_PUBLIC_STUDIO_URL", "http://localhost:3001").replace(/\/$/, "");
export const CONTACT_EMAIL = required("NEXT_PUBLIC_CONTACT_EMAIL", "hello@webx.io");

export const SIGNUP_URL = `${STUDIO_URL}/signup`;
export const LOGIN_URL = `${STUDIO_URL}/login`;
export const CONTACT_URL = `mailto:${CONTACT_EMAIL}`;
