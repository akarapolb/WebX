// Runs one tool for the agent worker: POST {job, tool, args} -> {ok, text}.
// The tool runs inside the job owner's acting session (runAsJobOwner), through
// executeTool, which re-checks the autonomy level, the allow-list and the
// arguments: this is the enforcement point, whatever the worker believes.
import { NextRequest, NextResponse } from "next/server";
import { runAsJobOwner } from "@/lib/cms/governance";
import { ctxForOwner, gatewayAuthorized, parseGatewayJob, runGatewayTool } from "@/lib/agent/toolGateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!gatewayAuthorized(req.headers.get("authorization"), process.env.WEBX_AGENT_TOOLS_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const job = parseGatewayJob(body?.job);
  if (typeof job === "string") return NextResponse.json({ error: job }, { status: 400 });
  if (typeof body?.tool !== "string" || !body.tool) return NextResponse.json({ error: "tool is required" }, { status: 400 });
  try {
    const r = await runAsJobOwner(job as any, async (owner) => runGatewayTool(ctxForOwner(owner, job), body.tool, body.args));
    if (!r.ok) return NextResponse.json({ ok: false, text: `This job may no longer act as its owner (${r.reason}).` }, { status: 403 });
    return NextResponse.json(r.value);
  } catch (e) {
    console.error("[agent-tools] run failed:", (e as Error)?.message || e);
    return NextResponse.json({ ok: false, text: "The tool failed unexpectedly." }, { status: 500 });
  }
}
