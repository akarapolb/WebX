// Phase 5 — engine-agnostic release scheduler trigger. Replaces the
// setInterval that used to live inside strapi-cms's own process
// (strapi-cms/src/index.ts's former processDueReleases): that could only
// ever publish Strapi content, and running it alongside this route would
// double-process the same release row, so it's been removed there.
// Secret-protected (not an admin session — this is meant to be called by an
// external scheduler, e.g. a system cron hitting this on an interval).
import { NextRequest, NextResponse } from "next/server";
import { processDueReleases } from "@/lib/cms/governance";
import { WEBX_SCHEDULER_SECRET } from "@/lib/config";

export async function POST(req: NextRequest) {
  if (!WEBX_SCHEDULER_SECRET || req.headers.get("x-internal-secret") !== WEBX_SCHEDULER_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await processDueReleases();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "process-due failed" }, { status: 500 });
  }
}
