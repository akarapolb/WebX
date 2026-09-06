import { NextRequest } from "next/server";
import { governed } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

type Ctx = { params: Promise<{ id: string }> };

// Media library gap (TOR — search/tag/reuse/crop/caption) — edit caption/
// alt/tags or delete one asset, both engines via governed.media.*.
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  return handle(() => governed.media.update(id, body));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return handle(() => governed.media.remove(id));
}
