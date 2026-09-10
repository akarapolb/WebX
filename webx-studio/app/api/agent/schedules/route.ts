// GET: the schedules you can see in this workspace. POST: create a schedule.
import { NextRequest } from "next/server";
import { createAgentSchedule, listAgentSchedules } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => listAgentSchedules());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return handle(() => createAgentSchedule({
    name: body.name, template: body.template, params: body.params, recurrence: body.recurrence, lang: body.lang,
  }));
}
