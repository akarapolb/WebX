import { NextRequest } from "next/server";
import { governed } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant") || "";
  return handle(() => governed.auth.listUsers(tenant));
}

export async function POST(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant") || "";
  const data = await req.json().catch(() => ({}));
  return handle(() => governed.auth.create(tenant, data));
}
