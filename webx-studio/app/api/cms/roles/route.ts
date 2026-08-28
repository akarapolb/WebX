import { NextRequest } from "next/server";
import { listCustomRoles, saveCustomRole } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant") || "";
  return handle(() => listCustomRoles(tenant));
}

export async function POST(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant") || "";
  const body = await req.json().catch(() => ({}));
  return handle(() => saveCustomRole(tenant, body));
}
