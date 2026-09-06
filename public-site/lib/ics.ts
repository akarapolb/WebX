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

// RFC 5545 §3.1 line folding: continuation lines start with a single space.
// Splitting on UTF-16 code units (not real octets) is an approximation, but
// well within the safety margin the 75-octet limit exists for (avoiding very
// long single lines some calendar clients mis-parse) — Thai text is 3 bytes/
// char in UTF-8, so folding here at well under 75 code units keeps every
// folded line comfortably under that byte limit too.
function foldLine(line: string): string {
  if (line.length <= 70) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 70) {
    parts.push(rest.slice(0, 70));
    rest = rest.slice(70);
  }
  parts.push(rest);
  return parts.join("\r\n ");
}

/** All-day VEVENT — event_time is free-form Thai text ("09:00 - 12:00 น.",
 * "ตลอดวัน"), not a parseable instant, so it's folded into DESCRIPTION
 * instead of a DTSTART/DTEND time component (fabricating a precise time
 * from unstructured text risks a silently wrong time in the visitor's real
 * calendar, which is worse than not showing one). */
export function buildVEvent(item: CalendarItem, opts: { uidDomain: string }): string {
  const dateCompact = item.date.replace(/-/g, "");
  const descParts = [item.time, item.location, item.body].filter(Boolean) as string[];
  const lines = [
    "BEGIN:VEVENT",
    `UID:event-${item.id}@${opts.uidDomain}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
    `DTSTART;VALUE=DATE:${dateCompact}`,
    `SUMMARY:${escapeIcsText(item.title)}`,
  ];
  if (item.location) lines.push(`LOCATION:${escapeIcsText(item.location)}`);
  if (descParts.length) lines.push(`DESCRIPTION:${escapeIcsText(descParts.join(" · "))}`);
  lines.push("END:VEVENT");
  return lines.map(foldLine).join("\r\n");
}

export function buildVCalendar(items: CalendarItem[], opts: { calName: string; uidDomain: string }): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WebX//Event Calendar//TH",
    "CALSCALE:GREGORIAN",
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
    buildVEvent(item, opts),
    "END:VCALENDAR",
  ].join("\r\n") + "\r\n";
}
