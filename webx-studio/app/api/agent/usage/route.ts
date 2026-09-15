// Billing.tsx's own AI-usage bar — a status/percentage against this
// calendar month's usage vs. the plan's budget (lib/plans.ts's
// agentMonthlyJobTokens, the same number app/api/agent/run's own pre-run
// gate checks) with the actual token numbers deliberately never
// serialized into this response — see getAgentUsageSummary's own comment.
// Separate from /api/agent/status (that route answers "what can I do
// right now" for the docked chat panel, not a billing-page concern) —
// same shape as /api/cms/content-usage sitting next to the tenant's own
// content limit.
import { requireUser, getAgentUsageSummary } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => getAgentUsageSummary(await requireUser()));
}
