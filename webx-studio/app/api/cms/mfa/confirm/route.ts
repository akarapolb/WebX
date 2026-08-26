import { NextRequest } from "next/server";
import { confirmMfaEnrollment } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export async function POST(req: NextRequest) {
  const { code } = await req.json().catch(() => ({}));
  return handle(() => confirmMfaEnrollment(code));
}
