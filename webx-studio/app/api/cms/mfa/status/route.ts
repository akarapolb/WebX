import { mfaEnrollmentStatus } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export async function GET() {
  return handle(() => mfaEnrollmentStatus());
}
