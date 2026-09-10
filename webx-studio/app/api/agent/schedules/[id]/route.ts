// PUT: change a schedule, or turn it off with { enabled: false }. DELETE: remove it.
import { NextRequest } from "next/server";
import { deleteAgentSchedule, updateAgentSchedule } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const input: Record<string, unknown> = {};
  for (const k of ["name", "template", "params", "recurrence", "lang", "enabled"]) if (k in body) input[k] = body[k];
  return handle(() => updateAgentSchedule(id, input));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    await deleteAgentSchedule(id);
    return { ok: true };
  });
}
