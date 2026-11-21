"use client";
// WebX site kit — state for a search page over the static index: loads
// /<tenant>/search-index.json once, keeps the query in ?q= (so results can be
// linked and a header search box can land here) and returns ranked results.
// The template draws the page; see templates/dgahub/Search.tsx.
import { useEffect, useMemo, useRef, useState } from "react";
import { queryTerms, searchDocs, type SearchDoc } from "@/lib/site/search";

export function useStaticSearch(indexUrl: string, onSearch?: (q: string, results: number) => void) {
  const [q, setQ] = useState("");
  const [docs, setDocs] = useState<SearchDoc[] | null>(null);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q") || "";
    setQ(initial);
    if (!initial) input.current?.focus();
    fetch(indexUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setDocs)
      .catch(() => setFailed(true));
  }, [indexUrl]);

  // Keep the address in step with the query (no new history entry per keystroke).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (q) url.searchParams.set("q", q); else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  }, [q]);

  const terms = useMemo(() => queryTerms(q), [q]);
  const results = useMemo(() => (docs ? searchDocs(docs, terms) : []), [docs, terms]);

  // Report a search once the visitor pauses typing (analytics hook).
  useEffect(() => {
    if (!onSearch || !docs || !terms.length) return;
    const t = setTimeout(() => onSearch(q.trim(), results.length), 1200);
    return () => clearTimeout(t);
  }, [onSearch, docs, terms, q, results.length]);

  return { q, setQ, terms, docs, failed, results, input, loading: !docs && !failed };
}
