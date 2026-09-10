// POST /api/agent/jobs/:id/cancel | pause | resume | answer
import { NextRequest } from "next/server";
import { kickWorker } from "@/lib/agent/worker";
import { controlAgentJob } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; action: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id, action } = await params;
  const body = await req.json().catch(() => ({}));
  return handle(async () => {
    const job = await controlAgentJob(id, action, typeof body.answer === "string" ? body.answer : undefined);
    if (action === "resume" || action === "answer") kickWorker();
    return job;
  });
}
