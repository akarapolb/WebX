"use client";
// Previously a bare <form> with no onSubmit — a real submit fell back to a
// GET against the current URL, leaking the citizen's search query into the
// address bar/history. Site search isn't built yet (no results page or
// backend exists on the public site), so this stops the leak rather than
// wire up a feature that doesn't exist — sending the query to the site's
// own knowledge library is the closest honest destination available today.
import { type FormEvent } from "react";
import { RsIcon } from "./icons";

export default function MobileSearchForm() {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q");
    const query = typeof q === "string" ? q.trim() : "";
    if (query && typeof window !== "undefined") {
      window.location.href = "/royalsociety/knowledge?q=" + encodeURIComponent(query);
    }
  }

  return (
    <form className="rs-mobile-search" role="search" onSubmit={handleSubmit}>
      <RsIcon id="i-search" />
      <input type="search" name="q" placeholder="ค้นหาในเว็บไซต์..." aria-label="ค้นหาในเว็บไซต์" />
    </form>
  );
}
