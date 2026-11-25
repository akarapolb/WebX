import { startMfaEnrollment } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

// Body is optional: { currentCode } is needed only to REPLACE an authenticator that is already on
// (lib/cms/mfaEnrollment.ts). A first enrollment sends none.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const currentCode = typeof body?.currentCode === "string" ? body.currentCode : undefined;
  return handle(() => startMfaEnrollment(currentCode));
}
