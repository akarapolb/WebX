"use client";
// Previously a bare <form> with no onSubmit — a real submit fell back to a
// GET against the current URL, leaking the citizen's search query into the
// address bar/history. Site search now exists for real (TOR gap audit —
// see templates/royalsociety/SearchResults.tsx and lib/useSiteSearch.ts),
// so this submits there instead of the old fallback redirect to the static
// knowledge page.
import { type FormEvent } from "react";
import { RsIcon } from "./icons";

export default function MobileSearchForm() {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q");
    const query = typeof q === "string" ? q.trim() : "";
    if (query && typeof window !== "undefined") {
      window.location.href = "/royalsociety/search?q=" + encodeURIComponent(query);
    }
  }

  return (
    <form className="rs-mobile-search" role="search" onSubmit={handleSubmit}>
      <RsIcon id="i-search" />
      <input type="search" name="q" placeholder="ค้นหาในเว็บไซต์..." aria-label="ค้นหาในเว็บไซต์" />
    </form>
  );
}
