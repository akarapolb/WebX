import { site } from "@/templates/dgahub/Site";
import { searchIndexRoute } from "@/lib/site/routes";

// Static file at export time: the hub's search index (th), WebX site kit.
export const dynamic = "force-static";
export const GET = searchIndexRoute(site, "th");
