"use client";
// Real "ปฏิทินกิจกรรม" (event calendar) — TOR gap: ORST's own news.json
// carried an empty placeholder table block for this (id "calendar", rows:
// []) and RoyalSociety's activities.json lead copy already promises one,
// neither had actual data or a calendar UI behind it. Shared by both
// tenants' Blocks.tsx (registered as the "event-calendar" block type) —
// same split as ShareButtons.tsx: one tenant-agnostic component, styling
// via plain class names each tenant's own components.css skins.
//
// "today" is real wall-clock state, computed client-side only — same
// hydration-mismatch class of bug ShareButtons.tsx hit reading
// window.location.href in the render body (server-render time and a real
// visitor's clock never match). Starts at `null` (renders a neutral
// skeleton matching the server output) and fills in the real default month
// in useEffect, after mount.
import { useEffect, useMemo, useState } from "react";
import { fmtDateTh } from "@/lib/cms";
import { buildSingleEventIcs } from "@/lib/ics";
import type { CalendarItem } from "@/lib/blockSource";

const WEEKDAYS_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MONTHS_TH_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function pad2(n: number): string { return n < 10 ? "0" + n : String(n); }
function toYmd(y: number, m: number, d: number): string { return String(y) + pad2(m + 1) + pad2(d); }
function ymdToIso(ymd: string): string {
  return ymd.length === 8 ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}` : ymd;
}

function downloadIcs(item: CalendarItem) {
  const ics = buildSingleEventIcs(item, { uidDomain: window.location.host || "webx.local" });
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `event-${item.id}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function EventCalendar({ items, icsHref }: { items: CalendarItem[]; icsHref: string }) {
  const [view, setView] = useState<{ year: number; month: number } | null>(null);
  const [todayYmd, setTodayYmd] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const nowYmd = toYmd(now.getFullYear(), now.getMonth(), now.getDate());
    setTodayYmd(nowYmd);
    // Default to the earliest upcoming (or today's) event's month, not just
    // today's — a calendar that opens on an empty "today" month when every
    // seeded event is next month reads as broken, not merely quiet.
    const upcoming = [...items].sort((a, b) => a.date.localeCompare(b.date)).find((it) => it.date >= nowYmd);
    const anchor = upcoming ? ymdToIso(upcoming.date) : now.toISOString().slice(0, 10);
    const [y, m] = anchor.split("-").map(Number);
    setView({ year: y, month: m - 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of items) {
      if (!map.has(it.date)) map.set(it.date, []);
      map.get(it.date)!.push(it);
    }
    return map;
  }, [items]);

  if (!view || !todayYmd) {
    // Neutral pre-mount skeleton — exactly what the server rendered, so
    // hydration has nothing to reconcile (see the file comment above).
    return <div className="wx-cal wx-cal--loading" aria-hidden="true" />;
  }

  const { year, month } = view;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const selectedItems = selected ? byDate.get(selected) || [] : [];

  function go(delta: number) {
    setSelected(null);
    setView((v) => {
      if (!v) return v;
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  return (
    <div className="wx-cal">
      <div className="wx-cal-toolbar">
        <button type="button" className="wx-cal-nav" onClick={() => go(-1)} aria-label="เดือนก่อนหน้า">‹</button>
        <strong className="wx-cal-month">{MONTHS_TH_FULL[month]} {year + 543}</strong>
        <button type="button" className="wx-cal-nav" onClick={() => go(1)} aria-label="เดือนถัดไป">›</button>
        <a className="wx-cal-subscribe" href={icsHref}>สมัครรับปฏิทิน (.ics)</a>
      </div>
      <div className="wx-cal-grid">
        {WEEKDAYS_TH.map((w) => <div className="wx-cal-weekday" key={w}>{w}</div>)}
        {cells.map((day, i) => {
          if (day == null) return <div className="wx-cal-cell wx-cal-cell--empty" key={"e" + i} />;
          const ymd = toYmd(year, month, day);
          const dayItems = byDate.get(ymd) || [];
          const isToday = ymd === todayYmd;
          const isSelected = ymd === selected;
          return (
            <button
              type="button"
              key={ymd}
              className={"wx-cal-cell" + (isToday ? " wx-cal-cell--today" : "") + (isSelected ? " wx-cal-cell--selected" : "") + (dayItems.length ? " wx-cal-cell--has-events" : "")}
              onClick={() => dayItems.length && setSelected(isSelected ? null : ymd)}
              disabled={!dayItems.length}
            >
              <span className="wx-cal-cell-num">{day}</span>
              {dayItems.length ? <span className="wx-cal-cell-dot" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      {selectedItems.length > 0 ? (
        <div className="wx-cal-day-panel">
          <h3>{fmtDateTh(ymdToIso(selected!))}</h3>
          <ul>
            {selectedItems.map((it) => (
              <li className="wx-cal-event" key={it.id}>
                {it.category ? <span className="wx-cal-event-cat">{it.category}</span> : null}
                <strong className="wx-cal-event-title">{it.title}</strong>
                <div className="wx-cal-event-meta">
                  {it.time ? <span>{it.time}</span> : null}
                  {it.location ? <span>{it.location}</span> : null}
                </div>
                {it.body ? <p className="wx-cal-event-body">{it.body}</p> : null}
                <button type="button" className="wx-cal-event-add" onClick={() => downloadIcs(it)}>
                  + เพิ่มลงปฏิทินของฉัน
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!items.length ? <p className="wx-cal-empty">ยังไม่มีกิจกรรมที่ประกาศในขณะนี้</p> : null}
    </div>
  );
}
