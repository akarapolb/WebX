"use client";
// "Share this page" (TOR gap audit — no share affordance existed anywhere;
// LINE first since it's the dominant share target in Thailand, ahead of
// Facebook/X). Needs no page-specific props at all: Facebook/LINE/X all
// scrape the target URL's own Open Graph tags for the preview card, and
// lib/seo.ts's pageMetadata now gives every page real ones — reading
// window.location.href at click time is enough. Client Component only for
// that (and the copy-link button); everything else here is a plain <a>.
import { useEffect, useState } from "react";

export default function ShareButtons({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  // Computing window.location.href straight in the render body mismatches
  // the server-rendered HTML (window is undefined at build/SSR time) and
  // React does NOT patch that up on hydration — same class of bug as the
  // ?topic=/?q= preselect fix elsewhere in this app (ContactFormBlock.tsx,
  // SearchResults.tsx): start empty (matches the server output exactly, so
  // hydration has nothing to reconcile), fill in the real value once
  // mounted client-side. Confirmed live: without this, every share link's
  // url= param was silently empty forever.
  const [url, setUrl] = useState("");
  useEffect(() => { setUrl(window.location.href); }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (non-secure context, permission
      // denied) — fail quietly rather than throw on a share click.
    }
  }

  const u = encodeURIComponent(url);

  return (
    <div className={"wx-share " + className}>
      <span className="wx-share-label">แชร์หน้านี้</span>
      <a className="wx-share-btn" href={`https://social-plugins.line.me/lineit/share?url=${u}`}
        target="_blank" rel="noopener noreferrer" aria-label="แชร์ทาง LINE" title="แชร์ทาง LINE">
        LINE
      </a>
      <a className="wx-share-btn" href={`https://www.facebook.com/sharer/sharer.php?u=${u}`}
        target="_blank" rel="noopener noreferrer" aria-label="แชร์ทาง Facebook" title="แชร์ทาง Facebook">
        Facebook
      </a>
      <a className="wx-share-btn" href={`https://twitter.com/intent/tweet?url=${u}`}
        target="_blank" rel="noopener noreferrer" aria-label="แชร์ทาง X" title="แชร์ทาง X">
        X
      </a>
      <button type="button" className="wx-share-btn" onClick={copyLink} aria-label="คัดลอกลิงก์">
        {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
      </button>
    </div>
  );
}
