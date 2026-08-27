import { NextRequest } from "next/server";
import { deleteApiToken } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return handle(() => deleteApiToken(Number(id)));
}
