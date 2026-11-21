import { site } from "@/templates/dgahub/Site";
import { dataRoute } from "@/lib/site/routes";

// Static open-data files (en), written at export time (lib/site/openData.ts).
export const dynamic = "force-static";
export const dynamicParams = false;

const r = dataRoute(site, "en");
export const generateStaticParams = r.generateStaticParams;
export const GET = r.GET;
