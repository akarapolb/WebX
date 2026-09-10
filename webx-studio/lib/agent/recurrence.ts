// When a scheduled agent job runs (Phase 9, M6): daily, weekly or monthly
// presets at 15-minute steps, in one time zone (Asia/Bangkok by default), with
// no cron dependency. Missed runs collapse: the next run is always the first
// occurrence after now. Monthly days stop at 28 so every month has one.

export type Recurrence = {
  freq: "daily" | "weekly" | "monthly";
  /** weekly: the days to run, 0 = Sunday … 6 = Saturday. */
  byWeekday?: number[];
  /** monthly: the day of the month, 1–28. */
  byMonthDay?: number;
  hour: number;
  minute: 0 | 15 | 30 | 45;
  tz: string;
};

export const DEFAULT_TZ = "Asia/Bangkok";
const MINUTES = [0, 15, 30, 45];

export class RecurrenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecurrenceError";
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
    });
    formatters.set(tz, f);
  }
  return f;
}

function wallClock(tz: string, t: number) {
  const p: Record<string, string> = {};
  for (const part of formatter(tz).formatToParts(new Date(t))) p[part.type] = part.value;
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute), s: Number(p.second) };
}

/** How far the zone's wall clock is ahead of UTC at instant `t`, in ms. */
function offsetAt(tz: string, t: number): number {
  const w = wallClock(tz, t);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(t / 1000) * 1000;
}

/** The instant a wall-clock time in `tz` happens (checked twice, for zones with daylight saving). */
export function zonedTime(tz: string, y: number, m: number, d: number, h: number, mi: number): number {
  const wall = Date.UTC(y, m - 1, d, h, mi);
  const first = wall - offsetAt(tz, wall);
  return wall - offsetAt(tz, first);
}

export function parseRecurrence(raw: unknown): Recurrence {
  const r: any = raw && typeof raw === "object" ? raw : {};
  if (r.freq !== "daily" && r.freq !== "weekly" && r.freq !== "monthly") throw new RecurrenceError("Choose daily, weekly or monthly");
  const hour = Number(r.hour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new RecurrenceError("The hour must be 0 to 23");
  const minute = Number(r.minute ?? 0);
  if (!MINUTES.includes(minute)) throw new RecurrenceError("The minute must be 0, 15, 30 or 45");
  const tz = typeof r.tz === "string" && r.tz ? r.tz : DEFAULT_TZ;
  try {
    formatter(tz);
  } catch {
    throw new RecurrenceError(`Unknown time zone: ${tz}`);
  }
  const out: Recurrence = { freq: r.freq, hour, minute: minute as Recurrence["minute"], tz };
  if (r.freq === "weekly") {
    const days = Array.isArray(r.byWeekday) ? r.byWeekday.map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
    if (!days.length) throw new RecurrenceError("Choose at least one day of the week");
    out.byWeekday = [...new Set<number>(days)].sort((a, b) => a - b);
  }
  if (r.freq === "monthly") {
    const day = Number(r.byMonthDay);
    if (!Number.isInteger(day) || day < 1 || day > 28) throw new RecurrenceError("The day of the month must be 1 to 28");
    out.byMonthDay = day;
  }
  return out;
}

/** The first run strictly after `after` (ms since the epoch). */
export function nextOccurrence(rec: Recurrence, after: number): number {
  const start = wallClock(rec.tz, after);
  for (let i = 0; i < 400; i++) {
    // Calendar arithmetic on the zone's date; Date.UTC normalizes month and year ends.
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + i));
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    if (rec.freq === "weekly" && !rec.byWeekday?.includes(day.getUTCDay())) continue;
    if (rec.freq === "monthly" && d !== rec.byMonthDay) continue;
    const t = zonedTime(rec.tz, y, m, d, rec.hour, rec.minute);
    if (t > after) return t;
  }
  throw new RecurrenceError("No next run within a year");
}
