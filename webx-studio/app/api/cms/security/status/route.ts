// The app layout's own check: is MFA required for this session's workspace,
// is the caller enrolled, and has the grace period passed. Same "resolve for
// the caller" shape as /api/agent/status. Strapi-engine only — the layout
// doesn't call this for a WordPress session.
import { mfaEnforcementStatus } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => mfaEnforcementStatus());
}
