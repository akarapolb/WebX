import { NextRequest } from "next/server";
import { kickWorker } from "@/lib/agent/worker";
import { createAgentJob, listAgentJobs } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => listAgentJobs());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return handle(async () => {
    const job = await createAgentJob({
      title: body.title, goal: body.goal, template: body.template, params: body.params,
      threadId: body.threadId, lang: body.lang, budget: body.budget,
    });
    kickWorker();
    return job;
  });
}
