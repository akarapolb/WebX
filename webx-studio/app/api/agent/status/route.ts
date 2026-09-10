// The docked panel's own "what can I do right now" check — deliberately
// separate from GET/PUT /api/agent/policy (that route is the admin SETTINGS
// screen: getAgentPolicy/saveAgentPolicy, gated by assertCanActOnTenant,
// returning AgentTenantSettings with no `reason` field at all). Any
// authenticated user needs to resolve their OWN runtime AgentPolicy
// (governance.ts's resolveAgentPolicy — level/tools/contentTypes/model,
// AND `reason`, which the empty state needs to explain itself) regardless
// of whether they administer this workspace. Found live while wiring
// AgentProvider: it had been calling the admin route by mistake, which
// both omits `reason` and could 403 a non-admin editor outright.
import { requireUser, resolveAgentPolicy } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export async function GET() {
  return handle(async () => resolveAgentPolicy(await requireUser()));
}
