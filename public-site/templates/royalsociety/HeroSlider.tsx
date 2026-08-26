"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          <img
            key={src}
            className={"rs-hero__slide" + (i === current ? " is-active" : "")}
            src={src}
            alt=""
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
