// Engine-aware media upload — routes through governed.media.upload, which
// already picks the active session's adapter (Strapi or WordPress). Added
// for the Visual Builder's WordPress-backed pages (wp:page): the existing
// /api/strapi/upload proxy only ever carries a Strapi bearer token, so it
// 401s under a WordPress session and, even on success, the gov-portal-only
// caller (VisualBuilder.tsx's uploadFieldImage) treats the result as a
// Strapi upload-id relation, not the absolute URL a WordPress-hosted static
// export needs. Left the gov-portal path on the old proxy untouched — this
// is additive, not a replacement, so nothing about its existing behavior
// (deliberately ungoverned uploads, see governed.media.upload's own
// comment) changes.
import { NextRequest } from "next/server";
import { governed } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const form = await req.formData();
    const file = form.get("files") ?? form.get("file");
    if (!(file instanceof File)) throw new Error("No file in request");
    return governed.media.upload(file);
  });
}

// Media library gap (TOR — search/tag/reuse/crop/caption) — list/edit/
// delete for MediaLibrary.tsx, both engines, same governed.media.* dispatch
// as the upload handler above (now genuinely tenant-scoped for both, see
// governance.ts's media wrapper).
export async function GET(req: NextRequest) {
  return handle(async () => {
    const { searchParams } = new URL(req.url);
    return governed.media.list({
      search: searchParams.get("search") || undefined,
      page: searchParams.get("page") ? Number(searchParams.get("page")) : undefined,
      pageSize: searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined,
    });
  });
}
