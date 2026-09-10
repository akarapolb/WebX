import { getAgentJob } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(() => getAgentJob(id));
}
