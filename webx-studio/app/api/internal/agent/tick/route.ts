// The scheduler's tick (the agent-scheduler compose service, every 60s):
// starts due schedules' jobs (lib/agent/jobs/schedules.ts), then starts this
// process's worker if it isn't running and wakes it to claim now. Expired job
// leases are reaped by the claim itself (strapi-cms's agent-jobs controller).
// Safe to call from several places at once: schedules advance by
// compare-and-set in Strapi.
import { NextRequest, NextResponse } from "next/server";
import { kickWorker, workerStatus } from "@/lib/agent/worker";
import { processAgentScheduleTick } from "@/lib/cms/governance";
import { WEBX_SCHEDULER_SECRET } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!WEBX_SCHEDULER_SECRET || req.headers.get("x-internal-secret") !== WEBX_SCHEDULER_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let schedules: unknown;
  try {
    schedules = await processAgentScheduleTick();
  } catch (e) {
    console.error("[agent-tick] schedules failed:", (e as Error)?.message || e);
    schedules = { error: (e as Error)?.message || "The schedule tick failed." };
  }
  kickWorker();
  return NextResponse.json({ schedules, worker: workerStatus() });
}
