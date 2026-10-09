// RFC 5545 ICS (iCalendar) builder for the event calendar (Phase 3 gap —
// see wordpress/mu-plugins/custom-post-types.php's `event` CPT comment and
// lib/blockSource.ts's CalendarItem). Deliberately isomorphic (no Node-only
// or DOM-only APIs) — used server-side by app/{orst,royalsociety}/events.ics/
// route.ts for the full subscribe feed, AND client-side by
// components/EventCalendar.tsx for a single event's "add to calendar"
// download, from the exact same VEVENT-building code.
import type { CalendarItem } from "./blockSource";

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

const utf8Len = (cp: number): number => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

// RFC 5545 §3.1 line folding: a content line is at most 75 OCTETS, and a
// continuation line starts with a single space (which counts toward its 75).
// Counted in real UTF-8 bytes, never splitting a character — Thai is 3 bytes
// a character, so a 70-character cut (the old behaviour) ran ~210 bytes and
// some clients mis-read or truncated the line.
function foldLine(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = utf8Len(ch.codePointAt(0)!);
    if (bytes + n > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // the leading space of the continuation takes one octet
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const pad2 = (n: number): string => (n < 10 ? "0" + n : String(n));

/** The day after a YYYYMMDD date, as YYYYMMDD. An all-day event's DTEND is
 * exclusive (RFC 5545 §3.6.1), so a one-day event ends the following day.
 * Returns null for a date that is not a real calendar day. */
function nextDay(ymd: string): string | null {
  if (!/^\d{8}$/.test(ymd)) return null;
  const y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(4, 6)), d = Number(ymd.slice(6, 8));
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  t.setUTCDate(t.getUTCDate() + 1);
  return String(t.getUTCFullYear()) + pad2(t.getUTCMonth() + 1) + pad2(t.getUTCDate());
}

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

/** Start (and, when given, end) clock time read out of event_time's free-form
 * Thai text — "09:00 - 12:00 น.", "9.00-12.00", "๐๙:๐๐ น.". Times are HHMMSS.
 * Returns null for "ตลอดวัน", empty or anything without a valid clock time,
 * and the event then stays all-day: reading no time is safe, guessing one is
 * not. An end that isn't after the start is dropped (a start time still
 * stands) rather than turned into a wrong or overnight duration. */
export function parseTimeRange(text: string | undefined | null): { start: string; end?: string } | null {
  if (!text) return null;
  const ascii = text.replace(/[๐-๙]/g, (c) => String(THAI_DIGITS.indexOf(c)));
  const found: string[] = [];
  for (const m of ascii.matchAll(/(?<!\d)(\d{1,2})\s*[:.]\s*(\d{2})(?!\d)/g)) {
    const h = Number(m[1]), min = Number(m[2]);
    if (h < 24 && min < 60) found.push(pad2(h) + pad2(min) + "00");
    if (found.length === 2) break;
  }
  if (!found.length) return null;
  const [start, end] = found;
  return end && end > start ? { start, end } : { start };
}

// The event times typed in event_time are Thai local time (UTC+7, no daylight
// saving). They are written out as UTC instants (`…Z`), which every calendar
// client reads the same way with no VTIMEZONE block to get right.
const BANGKOK_OFFSET_H = 7;

/** YYYYMMDD + HHMMSS (Bangkok time) → the same instant as `YYYYMMDDTHHMMSSZ`.
 * Goes through Date.UTC so an early-morning time rolls back onto the previous
 * UTC day correctly. */
function bangkokToUtc(ymd: string, hms: string): string {
  const t = new Date(Date.UTC(
    Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)),
    Number(hms.slice(0, 2)) - BANGKOK_OFFSET_H, Number(hms.slice(2, 4)), Number(hms.slice(4, 6)),
  ));
  return String(t.getUTCFullYear()) + pad2(t.getUTCMonth() + 1) + pad2(t.getUTCDate()) + "T" +
    pad2(t.getUTCHours()) + pad2(t.getUTCMinutes()) + pad2(t.getUTCSeconds()) + "Z";
}

/** VEVENT. When event_time holds a readable clock time the event is a timed
 * one (UTC instants, ALLDAYEVENT:FALSE); otherwise ("ตลอดวัน", empty,
 * unreadable) it is an all-day event. Either way it is marked free
 * (TRANSP/BUSYSTATUS), so adding a public event never blocks the visitor's
 * calendar. The original time text always stays in DESCRIPTION. */
export function buildVEvent(item: CalendarItem, opts: { uidDomain: string; now?: Date }): string {
  const dateCompact = item.date.replace(/-/g, "");
  // nextDay() doubles as the "is this a real calendar day" check.
  const range = nextDay(dateCompact) ? parseTimeRange(item.time) : null;
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const descParts = [item.time, item.location, item.body].filter(Boolean) as string[];
  const lines = [
    "BEGIN:VEVENT",
    `UID:event-${item.id}@${opts.uidDomain}`,
    "SEQUENCE:1",
    `DTSTAMP:${stamp}`,
    `LAST-MODIFIED:${stamp}`,
  ];
  if (range) {
    lines.push(`DTSTART:${bangkokToUtc(dateCompact, range.start)}`);
    if (range.end) lines.push(`DTEND:${bangkokToUtc(dateCompact, range.end)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dateCompact}`);
    const end = nextDay(dateCompact);
    if (end) lines.push(`DTEND;VALUE=DATE:${end}`);
  }
  lines.push(`SUMMARY:${escapeIcsText(item.title)}`);
  if (item.location) lines.push(`LOCATION:${escapeIcsText(item.location)}`);
  if (descParts.length) lines.push(`DESCRIPTION:${escapeIcsText(descParts.join(" · "))}`);
  lines.push("TRANSP:TRANSPARENT", "STATUS:CONFIRMED");
  lines.push("X-MICROSOFT-CDO-ALLDAYEVENT:" + (range ? "FALSE" : "TRUE")); // stated either way, Outlook reads it
  lines.push("X-MICROSOFT-CDO-BUSYSTATUS:FREE", "END:VEVENT");
  return lines.map(foldLine).join("\r\n");
}

export function buildVCalendar(items: CalendarItem[], opts: { calName: string; uidDomain: string }): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WebX//Event Calendar//TH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${escapeIcsText(opts.calName)}`),
    ...items.map((it) => buildVEvent(it, opts)),
    "END:VCALENDAR",
  ].join("\r\n") + "\r\n";
}

/** Single-event .ics for a client-side "add to calendar" download —
 * wraps buildVEvent in its own VCALENDAR envelope (a standalone .ics file
 * needs one, unlike the per-event chunk inside the full feed above). */
export function buildSingleEventIcs(item: CalendarItem, opts: { uidDomain: string }): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WebX//Event Calendar//TH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    buildVEvent(item, opts),
    "END:VCALENDAR",
  ].join("\r\n") + "\r\n";
}
