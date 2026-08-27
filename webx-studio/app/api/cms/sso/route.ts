import { NextRequest } from "next/server";
import { getTenantSsoConfig, saveTenantSsoConfig } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant") || "";
  return handle(() => getTenantSsoConfig(tenant));
}

export async function PUT(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant") || "";
  const body = await req.json().catch(() => ({}));
  return handle(() => saveTenantSsoConfig(tenant, body));
}
