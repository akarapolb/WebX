import { NextRequest } from "next/server";
import { getAgentPolicy, saveAgentPolicy } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant") || "";
  return handle(() => getAgentPolicy(tenant));
}

export async function PUT(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant") || "";
  const body = await req.json().catch(() => ({}));
  return handle(() => saveAgentPolicy(tenant, body));
}
