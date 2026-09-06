"use client";
// Real member/scholar directory (Phase 3 gap — see wordpress/mu-plugins/
// custom-post-types.php's `member` CPT comment: RoyalSociety's own homepage
// card promises "get to know" real Fellows/Associate Members and links to
// /about; ORST's about page carries an unfilled "[จำนวน] ราชบัณฑิตและ
// ภาคีสมาชิก" count — neither had any actual per-person content). Shared by
// both tenants' Blocks.tsx (registered as the "member-directory" block
// type), same split as ShareButtons.tsx/EventCalendar.tsx.
//
// No per-member detail page exists anywhere on this site (same honest
// constraint as news/RSS — see lib/rss.ts's own comment) — this is a
// directory (browse + search), not profile pages, so a card's bio is a
// short excerpt, not a full biography.
//
// The search/tier-filter state below needs no hydration-safe useEffect
// dance (unlike EventCalendar's "today"): it starts at a fixed "" / "all"
// on both server and client render, with nothing wall-clock- or
// window-dependent about it, so there's nothing for hydration to mismatch.
import { useMemo, useState } from "react";
import type { MemberItem } from "@/lib/blockSource";

// Bilingual EN (TOR gap) — this component's own search/filter chrome used
// to be hardcoded Thai regardless of locale (unlike its `items`, which
// already carry real per-locale text via lib/cms.ts's localizeEntry). A
// small inline dict, same pattern as the tenant templates' own Header/
// Footer STR objects, rather than a new shared i18n file for 5 strings.
const STR = {
  th: {
    searchPlaceholder: "ค้นหาชื่อหรือสำนัก...", searchAria: "ค้นหาสมาชิก", filterAria: "กรองตามประเภทสมาชิก",
    all: "ทั้งหมด", empty: "ยังไม่มีข้อมูลในขณะนี้ โปรดติดตามข่าวสารเพิ่มเติม", noMatch: "ไม่พบรายชื่อที่ตรงกับคำค้นหา",
  },
  en: {
    searchPlaceholder: "Search by name or bureau...", searchAria: "Search members", filterAria: "Filter by member type",
    all: "All", empty: "No members are listed yet — check back soon.", noMatch: "No members match your search.",
  },
} as const;

export default function MemberDirectory({ items, locale = "th" }: { items: MemberItem[]; locale?: "th" | "en" }) {
  const s = STR[locale];
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("all");

  const tiers = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) if (it.tier) set.add(it.tier);
    return [...set];
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (tier !== "all" && it.tier !== tier) return false;
      if (q && !(it.name.toLowerCase().includes(q) || (it.division || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, query, tier]);

  if (!items.length) {
    return <p className="wx-dir-empty">{s.empty}</p>;
  }

  return (
    <div className="wx-dir">
      <div className="wx-dir-controls">
        <input
          type="search"
          className="wx-dir-search"
          placeholder={s.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={s.searchAria}
        />
        {tiers.length > 1 ? (
          <div className="wx-dir-tiers" role="group" aria-label={s.filterAria}>
            <button type="button" className={"wx-dir-tier-btn" + (tier === "all" ? " is-active" : "")} onClick={() => setTier("all")}>
              {s.all}
            </button>
            {tiers.map((t) => (
              <button type="button" key={t} className={"wx-dir-tier-btn" + (tier === t ? " is-active" : "")} onClick={() => setTier(t)}>
                {t}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {filtered.length ? (
        <div className="wx-dir-grid">
          {filtered.map((m) => (
            <article className="wx-dir-card" key={m.id}>
              <div className="wx-dir-photo">
                {m.photo ? <img src={m.photo} alt="" loading="lazy" /> : <span className="wx-dir-photo-fallback" aria-hidden="true">{m.name.slice(0, 1)}</span>}
              </div>
              <h3 className="wx-dir-name">{m.name}</h3>
              {m.tier ? <span className="wx-dir-tier-badge">{m.tier}</span> : null}
              {m.division ? <p className="wx-dir-division">{m.division}</p> : null}
              {m.bio ? <p className="wx-dir-bio">{m.bio}</p> : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="wx-dir-empty">{s.noMatch}</p>
      )}
    </div>
  );
}
