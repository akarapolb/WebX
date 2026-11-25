// A file attached to a submission the WebX control plane holds (a complaint's attachment, an application's résumé): downloaded
// through Studio so the caller's own workspace and role are checked first (governed.formFile). Always an attachment, never inline.
import { NextRequest, NextResponse } from "next/server";
import { governed } from "@/lib/cms/governance";
import { CmsError } from "@/lib/cms/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    return await governed.formFile(id);
  } catch (e: any) {
    if (e instanceof CmsError) return NextResponse.json({ error: e.message }, { status: e.status || 500 });
    console.error("[cms] unhandled error:", e);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
