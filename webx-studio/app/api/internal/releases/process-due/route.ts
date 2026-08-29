// Phase 5 — engine-agnostic release scheduler trigger. Replaces the
// setInterval that used to live inside strapi-cms's own process
// (strapi-cms/src/index.ts's former processDueReleases): that could only
// ever publish Strapi content, and running it alongside this route would
// double-process the same release row, so it's been removed there.
// Secret-protected (not an admin session — this is meant to be called by an
// external scheduler, e.g. a system cron hitting this on an interval).
import { NextRequest, NextResponse } from "next/server";
import { processDueReleases } from "@/lib/cms/governance";
import { CmsError } from "@/lib/cms/types";
import { WEBX_SCHEDULER_SECRET } from "@/lib/config";

export async function POST(req: NextRequest) {
  if (!WEBX_SCHEDULER_SECRET || req.headers.get("x-internal-secret") !== WEBX_SCHEDULER_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await processDueReleases();
    // curl's own `-f` flag (release-scheduler's `curl -sf ... || echo tick
    // failed`) only treats a response as a failure at status >= 400 — a 2xx
    // (including 207 Multi-Status) would pass silently right past it, which
    // would defeat the point. 502 here is a deliberate, if loose, use of
    // the status purely so that -f actually fires; see processDueReleases'
    // own comment on why a release that failed to publish used to be
    // silently indistinguishable from one that fully succeeded, both to
    // admins in the UI and to this scheduler's own health signal.
    if (result.failed > 0) return NextResponse.json(result, { status: 502 });
    return NextResponse.json(result);
  } catch (e: any) {
    if (e instanceof CmsError) return NextResponse.json({ error: e.message }, { status: e.status || 500 });
    return NextResponse.json({ error: e?.message || "process-due failed" }, { status: 500 });
  }
}
