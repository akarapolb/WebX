// POST /api/agent/jobs/from-thread: "Continue in background". A chat that
// stopped where it can resume becomes a background job that carries on from
// the same point.
import { NextRequest } from "next/server";
import { kickWorker } from "@/lib/agent/worker";
import { createAgentJobFromThread } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return handle(async () => {
    const job = await createAgentJobFromThread(String(body.threadId || ""), body.lang);
    kickWorker();
    return job;
  });
}
