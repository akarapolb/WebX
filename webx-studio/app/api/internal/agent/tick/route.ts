// Liveness backstop for the background job worker, ticked by an external
// scheduler the same way releases/process-due is: starts this process's
// worker if it isn't running and wakes it to claim now. Expired leases are
// reaped by the claim itself (strapi-cms's agent-jobs controller).
import { NextRequest, NextResponse } from "next/server";
import { kickWorker, workerStatus } from "@/lib/agent/worker";
import { WEBX_SCHEDULER_SECRET } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!WEBX_SCHEDULER_SECRET || req.headers.get("x-internal-secret") !== WEBX_SCHEDULER_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  kickWorker();
  return NextResponse.json({ worker: workerStatus() });
}
