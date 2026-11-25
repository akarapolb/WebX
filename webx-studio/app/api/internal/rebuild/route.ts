// Secret-protected trigger for requestPublicSiteRebuild() — mirrors
// app/api/internal/releases/process-due/route.ts's exact auth pattern
// (x-internal-secret / WEBX_SCHEDULER_SECRET), reused here rather than
// minting a second internal secret. The one intended caller is
// wordpress/mu-plugins/webx-blocks-sync.php: a native-Gutenberg save on a
// WordPress-tenant page has no webx-studio session to call doPublish()
// through (that's the ONLY other place requestPublicSiteRebuild() is
// triggered from — see governance.ts's doPublish/unpublish), so this is the
// one new HTTP surface that lets a WordPress-side save trigger the same
// debounced rebuild an in-app Publish click already does.
import { NextRequest, NextResponse } from "next/server";
import { requestPublicSiteRebuild } from "@/lib/publicSiteBuild";
import { schedulerSecretRefusal } from "@/lib/internalAuth";

export async function POST(req: NextRequest) {
  const refused = schedulerSecretRefusal(req);
  if (refused) return refused;
  requestPublicSiteRebuild();
  return NextResponse.json({ ok: true });
}
