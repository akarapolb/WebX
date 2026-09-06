import { publicSiteStatus } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

// Found live: without this, Next.js's App Router can treat this GET handler
// as statically cacheable and keep serving the response from the FIRST hit,
// never reflecting the in-memory building/lastBuiltAt state that changes on
// every rebuild — Status.tsx's own polling loop (every 3s while a build
// runs) then never observes a real transition, so its "wait for building to
// flip back to false" logic passes instantly against a stale cached
// "false", well before the actual build finishes. Playwright's own
// APIRequestContext bypassed this (no browser HTTP cache), which is why the
// bug only showed up through the real browser-driven Status page, not a
// direct fetch — this route's result must always reflect current state.
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => publicSiteStatus());
}
