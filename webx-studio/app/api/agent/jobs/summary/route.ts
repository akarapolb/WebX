// For the jobs indicator next to the agent toggle: active, waiting-for-input and recently failed counts.
import { agentJobsSummary } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => agentJobsSummary());
}
