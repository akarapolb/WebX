// The Google Fonts catalogue for the Branding → Theme font picker (see
// lib/googleFonts.ts). Behind the app's session gate like every other /api
// route, so only signed-in editors can reach it.
import { handle } from "@/lib/cms/route-helpers";
import { getGoogleFontCatalog } from "@/lib/googleFonts";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ({ fonts: await getGoogleFontCatalog() }));
}
