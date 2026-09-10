// Polled by the Jobs UI: events after ?after=<seq>, plus the job's current state.
import { NextRequest } from "next/server";
import { getAgentJobEvents } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const after = Number(req.nextUrl.searchParams.get("after")) || 0;
  return handle(() => getAgentJobEvents(id, after));
}
