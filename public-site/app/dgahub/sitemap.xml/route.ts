import { site } from "@/templates/dgahub/Site";
import { sitemapRoute } from "@/lib/site/routes";

// The hub's sitemap, both languages, with hreflang alternates (WebX site kit).
export const dynamic = "force-static";
export const GET = sitemapRoute(site);
