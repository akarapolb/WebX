// The agent worker's tool list (webx-agent/, docs/target-architecture.md D13):
// POST {job} -> the tools that job's owner may use right now, with each tool's
// risk class. Authenticated by WEBX_AGENT_TOOLS_SECRET; the owner is re-checked
// by runAsJobOwner exactly as for a Studio-run background job.
import { NextRequest, NextResponse } from "next/server";
import { runAsJobOwner } from "@/lib/cms/governance";
import { ctxForOwner, gatewayAuthorized, gatewayTools, parseGatewayJob } from "@/lib/agent/toolGateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!gatewayAuthorized(req.headers.get("authorization"), process.env.WEBX_AGENT_TOOLS_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const job = parseGatewayJob(body?.job);
  if (typeof job === "string") return NextResponse.json({ error: job }, { status: 400 });
  try {
    const r = await runAsJobOwner(job as any, async (owner) => gatewayTools(ctxForOwner(owner, job)));
    if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 403 });
    return NextResponse.json({ data: r.value });
  } catch (e) {
    console.error("[agent-tools] list failed:", (e as Error)?.message || e);
    return NextResponse.json({ error: "The tool list could not be built." }, { status: 500 });
  }
}
