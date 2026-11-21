"use client";
// Real site search for ORST/RoyalSociety — TOR §4.4.1.2 4)/4.4.2.6's "ช่อง
// ค้นหาที่เห็นได้ชัดเจน... รองรับการค้นหาข้อมูลทุกประเภท" requirement. Both
// tenants' own search buttons/forms were confirmed rendered but genuinely
// inert (RoyalSociety's MobileSearchForm.tsx even said so outright: "Site
// search isn't built yet"). WordPress's own native /wp/v2/search endpoint
// already covers every real post type here — it just needed a way to scope
// results per tenant, which wordpress/mu-plugins/wtenant-taxonomy.php now
// provides (?wtenant=<slug>).
//
// Full-text search INTO uploaded PDF/DOCX/XLSX content (the TOR's other
// search requirement) is now also covered for WordPress's own `document`
// post type — see wordpress/mu-plugins/document-search.php (the posts_search
// filter that makes /wp/v2/search itself match a document's real file
// content, not just its title/excerpt) and strapi-cms/scripts/
// index-wp-documents.mjs (the one-off indexer that extracts that content,
// reusing the same pdf-parse/mammoth/xlsx pipeline strapi-cms/src/utils/
// extract-text.ts already provides for the Strapi engine's ebook/download
// types — run it again after adding or changing a document's File URL).
import { useEffect, useState } from "react";
import { PUBLIC_WP } from "@/lib/publicCms";

// Browser-facing WordPress REST base (includes /wp-json), "" when the
// published copy has no reachable WordPress — search then reports "error"
// (lib/publicCms.ts). lib/cms.ts's WORDPRESS_URL is the build's address.
const WP_BASE = PUBLIC_WP;

export type SearchResult = { id: number; title: string; url: string; type: string; subtype: string };

export function useSiteSearch(tenant: string, query: string) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setStatus("idle"); return; }
    if (!WP_BASE) { setResults([]); setStatus("error"); return; }
    let cancelled = false;
    setStatus("loading");
    const url = `${WP_BASE}/wp/v2/search?search=${encodeURIComponent(q)}&wtenant=${encodeURIComponent(tenant)}&per_page=20`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: any[]) => {
        if (cancelled) return;
        setResults(j.map((r) => ({ id: r.id, title: stripHtml(r.title), url: r.url, type: r.type, subtype: r.subtype })));
        setStatus("done");
      })
      .catch(() => { if (!cancelled) { setResults([]); setStatus("error"); } });
    return () => { cancelled = true; };
  }, [tenant, query]);

  return { results, status };
}

function stripHtml(s: string): string {
  return String(s || "").replace(/<[^>]+>/g, "");
}
