import { NextRequest } from "next/server";
import { governed } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const tenant = req.nextUrl.searchParams.get("tenant") || "";
  const email = req.nextUrl.searchParams.get("email") || "";
  return handle(() => governed.auth.remove(tenant, { id, email }));
}
