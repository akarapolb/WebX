// POST: start a schedule's job now (its owner only); the schedule's timing doesn't change.
import { NextRequest } from "next/server";
import { kickWorker } from "@/lib/agent/worker";
import { runAgentScheduleNow } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const job = await runAgentScheduleNow(id);
    kickWorker();
    return job;
  });
}
