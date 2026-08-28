import { NextRequest } from "next/server";
import { saveCustomRole, deleteCustomRole } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

type Ctx = { params: Promise<{ key: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { key } = await params;
  const tenant = req.nextUrl.searchParams.get("tenant") || "";
  const body = await req.json().catch(() => ({}));
  return handle(() => saveCustomRole(tenant, { ...body, roleKey: key }));
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { key } = await params;
  const tenant = req.nextUrl.searchParams.get("tenant") || "";
  return handle(() => deleteCustomRole(tenant, key));
}
