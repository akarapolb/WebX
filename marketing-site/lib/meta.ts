import type { Metadata } from "next";
import { t, localePath, type Locale } from "./i18n";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://webx.io").replace(/\/$/, "");

// One metadata builder for every route: locale-aware title/description,
// canonical, hreflang alternates (both locales + x-default → Thai root),
// and Open Graph/Twitter cards pointing at the shared social image.
export function pageMeta(locale: Locale, path: "/" | "/pricing"): Metadata {
  const s = t(locale);
  const title = path === "/pricing" ? s.meta.pricingTitle : s.meta.title;
  const description = path === "/pricing" ? s.meta.pricingDescription : s.meta.description;
  const url = localePath(locale, path);
  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    alternates: {
      canonical: url,
      languages: { th: localePath("th", path), en: localePath("en", path), "x-default": localePath("th", path) },
    },
    openGraph: { title, description, url, siteName: "WebX", locale: locale === "th" ? "th_TH" : "en_US", type: "website", images: ["/og.png"] },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  };
}
