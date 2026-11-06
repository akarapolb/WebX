// The fields a file import can fill for one content type (see lib/importFields.ts).
import { NextRequest } from "next/server";
import { CmsError } from "@/lib/cms/types";
import { handle } from "@/lib/cms/route-helpers";
import { importFieldsFor } from "@/lib/importFields";

export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid") || "";
  return handle(async () => {
    if (!uid) throw new CmsError("uid is required", 400);
    const fields = await importFieldsFor(uid);
    if (!fields) throw new CmsError("This content type cannot be imported.", 404);
    return { uid, fields };
  });
}
