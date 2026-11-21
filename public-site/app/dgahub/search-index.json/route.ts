import { buildSearchIndex } from "@/templates/dgahub/searchIndex";

// Static file at export time: the hub's search index (th).
export const dynamic = "force-static";

export async function GET() {
  return Response.json(await buildSearchIndex("th"));
}
