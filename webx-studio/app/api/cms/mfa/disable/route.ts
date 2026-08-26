import { NextRequest } from "next/server";
import { disableMfa } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}));
  return handle(() => disableMfa(password));
}
