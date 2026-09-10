// Schedule recurrence (lib/agent/recurrence.ts), in Asia/Bangkok (UTC+7).
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { nextOccurrence, parseRecurrence, RecurrenceError } from "../lib/agent/recurrence";

const at = (iso: string) => Date.parse(iso);
const iso = (t: number) => new Date(t).toISOString();

describe("parseRecurrence", () => {
  test("normalizes the presets and rejects anything else", () => {
    assert.deepEqual(parseRecurrence({ freq: "weekly", byWeekday: [5, 1, 1], hour: "9", minute: 30 }), {
      freq: "weekly", byWeekday: [1, 5], hour: 9, minute: 30, tz: "Asia/Bangkok",
    });
    assert.throws(() => parseRecurrence({ freq: "hourly", hour: 1 }), /daily, weekly or monthly/);
    assert.throws(() => parseRecurrence({ freq: "daily", hour: 9, minute: 10 }), /0, 15, 30 or 45/);
    assert.throws(() => parseRecurrence({ freq: "daily", hour: 24 }), /0 to 23/);
    assert.throws(() => parseRecurrence({ freq: "monthly", hour: 9, byMonthDay: 31 }), /1 to 28/);
    assert.throws(() => parseRecurrence({ freq: "weekly", hour: 9, byWeekday: [] }), /at least one day/);
    assert.throws(() => parseRecurrence({ freq: "daily", hour: 9, tz: "Mars/Olympus" }), RecurrenceError);
  });
});

describe("nextOccurrence", () => {
  const daily = parseRecurrence({ freq: "daily", hour: 9, minute: 0 });

  test("daily at 09:00 Bangkok is 02:00 UTC, and a run at that exact time moves to tomorrow", () => {
    assert.equal(iso(nextOccurrence(daily, at("2026-09-11T01:59:00Z"))), "2026-09-11T02:00:00.000Z");
    assert.equal(iso(nextOccurrence(daily, at("2026-09-11T02:00:00Z"))), "2026-09-12T02:00:00.000Z");
  });

  test("an early Bangkok morning that is still the previous day in UTC", () => {
    const early = parseRecurrence({ freq: "daily", hour: 6, minute: 15 });
    assert.equal(iso(nextOccurrence(early, at("2026-09-10T22:00:00Z"))), "2026-09-10T23:15:00.000Z");
  });

  test("weekly runs on the next listed weekday", () => {
    // 2026-09-11 is a Friday; Mondays and Wednesdays at 10:30.
    const w = parseRecurrence({ freq: "weekly", byWeekday: [1, 3], hour: 10, minute: 30 });
    assert.equal(iso(nextOccurrence(w, at("2026-09-11T05:00:00Z"))), "2026-09-14T03:30:00.000Z");
  });

  test("monthly on the 28th crosses the year end and February", () => {
    const m = parseRecurrence({ freq: "monthly", byMonthDay: 28, hour: 23, minute: 45 });
    assert.equal(iso(nextOccurrence(m, at("2026-12-28T17:00:00Z"))), "2027-01-28T16:45:00.000Z");
    assert.equal(iso(nextOccurrence(m, at("2027-02-01T00:00:00Z"))), "2027-02-28T16:45:00.000Z");
  });

  test("missed runs collapse into the next one after now", () => {
    assert.equal(iso(nextOccurrence(daily, at("2026-09-20T12:00:00Z"))), "2026-09-21T02:00:00.000Z");
  });
});
