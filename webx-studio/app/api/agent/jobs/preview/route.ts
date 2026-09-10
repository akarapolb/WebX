// POST /api/agent/jobs/preview: what a template job would do (how many items,
// the first few, a token estimate) before anyone starts it.
import { NextRequest } from "next/server";
import { previewAgentJob } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return handle(() => previewAgentJob({ template: body.template, params: body.params, lang: body.lang }));
}
