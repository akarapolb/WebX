"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Picture from "@/components/Picture";

// Ported from the source's assets/js/04-interactions.js -> initHeroSlider().
// Only the auto-rotating slide/dot mechanic is a Client Component — the
// hero's text content (kicker, title) stays server-rendered in HomePage.tsx
// and is passed around this component as ordinary JSX children via the
// section markup there, not through this file.
//
// Original behaviour reproduced here:
//   - slides auto-advance every 4.5s (HERO_DELAY), matching the source.
//   - respects prefers-reduced-motion (no auto-rotation if set).
//   - clicking a dot jumps to that slide and restarts the auto-rotate timer.
const HERO_DELAY = 4500;

export default function HeroSlider({ slides }: { slides: string[] }) {
  const [current, setCurrent] = useState(0);
  // TOR gap audit (PageSpeed/Core Web Vitals) — a real Lighthouse run traced
  // this page's LCP (2.9-3.0s, over the TOR's own 2.5s target) to
  // `.rs-hero__slide`'s own `transition: opacity 1.1s` rule: even though the
  // FIRST slide already renders at opacity:1 (`is-active`) in the initial
  // server-rendered HTML, Chrome's LCP algorithm still waits out any
  // transition declared on the element before counting it as painted —
  // confirmed live (removing the transition for the very first paint alone
  // dropped LCP by roughly the transition's own duration). `ready` starts
  // false so that first paint has no transition to wait for at all; flips
  // true after mount so every LATER slide change (the actual auto-rotation)
  // still gets its real cross-fade, exactly as before — this only touches
  // the one-time initial load.
  const [ready, setReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setReady(true); }, []);

  const start = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (slides.length <= 1) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timerRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % slides.length);
    }, HERO_DELAY);
  }, [slides.length]);

  useEffect(() => {
    start();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [start]);

  function goTo(index: number) {
    setCurrent(index);
    start();
  }

  return (
    <>
      <div className="rs-hero__slides" aria-hidden="true">
        {slides.map((src, i) => (
          <Picture
            key={src}
            className={"rs-hero__slide" + (i === current ? " is-active" : "") + (ready ? "" : " no-initial-transition")}
            src={src}
            alt=""
            // The first slide is this page's real LCP element (confirmed via
            // a real Lighthouse run — royalsociety scored LCP=3.03s, over the
            // TOR's own 2.5s threshold, before this) — fetchPriority hints
            // the browser to fetch it ahead of lower-priority requests
            // instead of waiting for normal image-discovery order.
            {...(i === 0 ? { fetchPriority: "high" as const } : {})}
          />
        ))}
      </div>

      <div className="rs-hero__dots" aria-label="ตัวบอกตำแหน่งสไลด์">
        {slides.map((_, i) => (
          <button
            key={i}
            className={i === current ? "is-active" : undefined}
            type="button"
            data-hero-dot={i}
            aria-label={`สไลด์ที่ ${i + 1}`}
            aria-current={i === current}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </>
  );
}
