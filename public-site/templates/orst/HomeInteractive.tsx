"use client";

import { useState, type ReactNode } from "react";

/* =============================================================================
   HomeInteractive.tsx — the genuinely-JS-dependent slivers of HomePage.tsx
   -----------------------------------------------------------------------------
   Ported from ORST Website/assets/js/components.js's initMediaTabs() and
   initNewsEventsTabs() (both shared, page-agnostic functions loaded on every
   page — NOT from pages/home.js, which has no tab logic of its own) plus the
   `[data-scroll]` handler also in components.js (`initScrollers` in
   pages/home.js does the same thing for this page specifically). All three
   were plain click handlers toggling a "active" class / `hidden` attribute
   on sibling DOM nodes queried by id — reimplemented here as real React
   state instead, same resulting classes/attributes.

   The "research" media panel (id="panel-research"/"tab-research") present in
   the source markns=up has no corresponding tab button in `.media-tablist`
   (dead/unreachable in the original static site too) — intentionally not
   included in the tabs this component renders. See HomePage.tsx for that.

   The section-head "view all" links (id="media-view-all-link" /
   "news-view-all-link") swapped their href/label per active tab in the
   source (components.js's mediaLinks/mediaLabels, newsLinks/newsLabels
   maps). Those links live in server-rendered markup in HomePage.tsx,
   outside these components, and are kept static there (pointing at the
   first tab's target) rather than threading tab state up through props —
   a deliberate simplification, noted in the task report. */

export function ScrollButton({ rowId, dir, label }: { rowId: string; dir: "left" | "right"; label: string }) {
  return (
    <button
      className={`scroll-btn ${dir}`}
      type="button"
      aria-label={label}
      onClick={() =>
        document.getElementById(rowId)?.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" })
      }
    >
      {dir === "left" ? "‹" : "›"}
    </button>
  );
}

export type MediaTab = { id: string; label: string; panel: ReactNode };

/** Knowledge Hub tabs (id="publications" section) — id="tab-ebook" etc. */
export function MediaTabs({ tabs }: { tabs: MediaTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  return (
    <div className="media-tabs knowledge-hub-tabs">
      <div className="media-tablist knowledge-tablist" role="tablist" aria-label="หมวดคลังองค์ความรู้">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={"media-tab" + (active === t.id ? " active" : "")}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabs.map((t) => (
        <div
          key={t.id}
          className={"media-tab-panel" + (active === t.id ? " active" : "")}
          id={`panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${t.id}`}
          hidden={active !== t.id}
        >
          {t.panel}
        </div>
      ))}
    </div>
  );
}

export type NewsTab = { id: string; label: string; panel: ReactNode };

/** News & Events tabs (id="news" section) — tabs and panels are NOT DOM
    siblings in the source (a calendar <aside> sits between the tablist and
    the panel wrapper), so this renders both pieces itself rather than
    reusing MediaTabs' single-wrapper shape. */
export function NewsEventsTabs({ tabs, calendar }: { tabs: NewsTab[]; calendar: ReactNode }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  return (
    <>
      <div className="news-events-tabs" role="tablist" aria-label="ประเภทข่าวและกิจกรรม">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={"news-event-tab" + (active === t.id ? " active" : "")}
            role="tab"
            aria-selected={active === t.id}
            aria-controls={`news-panel-${t.id}`}
            id={`news-tab-${t.id}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="news-events-layout">
        <div className="news-events-main">
          {tabs.map((t) => (
            <div
              key={t.id}
              className={"news-event-panel" + (active === t.id ? " active" : "")}
              id={`news-panel-${t.id}`}
              role="tabpanel"
              aria-labelledby={`news-tab-${t.id}`}
              hidden={active !== t.id}
            >
              {t.panel}
            </div>
          ))}
        </div>

        {calendar}
      </div>
    </>
  );
}
