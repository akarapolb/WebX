// The secret the /api/internal/* routes called by a scheduler or another server of the deployment check
// (WEBX_SCHEDULER_SECRET, sent as `X-Internal-Secret`): one place, compared in constant time. These routes were each
// checking it with `!==`, which answers faster the earlier a guess goes wrong.
import "server-only";
import { NextResponse } from "next/server";
import { WEBX_SCHEDULER_SECRET } from "./config";
import { secretMatches } from "./secretCompare";

export const INTERNAL_SECRET_HEADER = "x-internal-secret";

/** null when the caller sent the scheduler secret; otherwise the 401 the route returns. No secret configured: always 401. */
export function schedulerSecretRefusal(req: Request, expected: string = WEBX_SCHEDULER_SECRET): NextResponse | null {
  if (secretMatches(req.headers.get(INTERNAL_SECRET_HEADER), expected)) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
