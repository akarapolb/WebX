import { rebuildPublicSiteNow } from "@/lib/cms/governance";
import { handle } from "@/lib/cms/route-helpers";

export async function POST() {
  return handle(() => rebuildPublicSiteNow());
}
