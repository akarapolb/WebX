// The models the AI gateway really serves, for the Agent settings page and the model picker in the chat
// (lib/aiModels.ts). Any signed-in user may read it: only aliases, provider/model names and the host of a custom endpoint.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/cms/governance";
import { CmsError } from "@/lib/cms/types";
import { gatewayModels } from "@/lib/aiModels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
  } catch (e) {
    return NextResponse.json({ error: e instanceof CmsError ? e.message : "Unauthenticated" }, { status: e instanceof CmsError ? e.status || 401 : 401 });
  }
  return NextResponse.json(await gatewayModels());
}
