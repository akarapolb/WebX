import { NextRequest } from "next/server";
import { governed } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant") || undefined;
  return handle(() => governed.auth.listRoles(tenant));
}
