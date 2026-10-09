import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildSingleEventIcs, buildVCalendar, buildVEvent, parseTimeRange } from "./ics";

const item = { id: 30, date: "20261015", time: "ตลอดวัน", location: "ลานอเนกประสงค์", title: "กิจกรรมวันภาษาไทยแห่งชาติ" };
const now = new Date("2026-10-09T09:25:53Z");

// Undo RFC 5545 folding so the content lines can be read.
const unfold = (s: string) => s.replace(/\r\n /g, "");
const bytes = (s: string) => Buffer.byteLength(s, "utf8");

describe("ics event", () => {
  const ev = buildVEvent(item, { uidDomain: "192.168.8.74:8090", now });

  test("carries the fields calendar clients expect for an all-day event", () => {
    const u = unfold(ev).split("\r\n");
    for (const line of [
      "UID:event-30@192.168.8.74:8090", "SEQUENCE:1", "DTSTAMP:20261009T092553Z", "LAST-MODIFIED:20261009T092553Z",
      "DTSTART;VALUE=DATE:20261015", "DTEND;VALUE=DATE:20261016", "SUMMARY:กิจกรรมวันภาษาไทยแห่งชาติ",
      "LOCATION:ลานอเนกประสงค์", "DESCRIPTION:ตลอดวัน · ลานอเนกประสงค์", "TRANSP:TRANSPARENT", "STATUS:CONFIRMED",
      "X-MICROSOFT-CDO-ALLDAYEVENT:TRUE", "X-MICROSOFT-CDO-BUSYSTATUS:FREE",
    ]) assert.ok(u.includes(line), "missing " + line);
  });

  test("never exceeds 75 octets a line and never splits a Thai character", () => {
    for (const l of ev.split("\r\n")) assert.ok(bytes(l) <= 75, l + " = " + bytes(l));
    assert.ok(!ev.includes("�"));
    assert.equal(unfold(ev).includes("SUMMARY:กิจกรรมวันภาษาไทยแห่งชาติ"), true);
  });

  test("folds the title where the reference file does", () => {
    assert.ok(ev.includes("SUMMARY:กิจกรรมวันภาษาไทยแห่งช\r\n าติ"));
  });

  test("the day after rolls over month and year ends", () => {
    assert.ok(buildVEvent({ ...item, date: "20261231" }, { uidDomain: "x", now }).includes("DTEND;VALUE=DATE:20270101"));
    assert.ok(buildVEvent({ ...item, date: "20260228" }, { uidDomain: "x", now }).includes("DTEND;VALUE=DATE:20260301"));
  });

  test("a date that is not a real day gets no DTEND rather than a wrong one", () => {
    assert.ok(!buildVEvent({ ...item, date: "20261345" }, { uidDomain: "x", now }).includes("DTEND"));
  });
});

describe("timed events", () => {
  const timed = { ...item, id: 29, date: "20261003", time: "09:00 - 12:00 น.", location: "ห้องประชุมใหญ่" };
  const ev = unfold(buildVEvent(timed, { uidDomain: "x", now })).split("\r\n");

  test("09:00-12:00 Bangkok is written as UTC instants (02:00Z-05:00Z), not all-day", () => {
    assert.ok(ev.includes("DTSTART:20261003T020000Z"));
    assert.ok(ev.includes("DTEND:20261003T050000Z"));
    assert.ok(!ev.some((l) => l.includes("VALUE=DATE") || l.includes("TZID")));
    assert.ok(ev.includes("X-MICROSOFT-CDO-ALLDAYEVENT:FALSE") && !ev.includes("X-MICROSOFT-CDO-ALLDAYEVENT:TRUE"));
    assert.ok(ev.includes("TRANSP:TRANSPARENT") && ev.includes("X-MICROSOFT-CDO-BUSYSTATUS:FREE"));
  });

  test("matches the reference file: 08:00-17:00 Bangkok is 01:00Z-10:00Z", () => {
    const r = unfold(buildVEvent({ ...item, time: "08:00 - 17:00 น." }, { uidDomain: "x", now })).split("\r\n");
    assert.ok(r.includes("DTSTART:20261015T010000Z") && r.includes("DTEND:20261015T100000Z"));
  });

  test("a time before 07:00 lands on the previous UTC day", () => {
    const r = unfold(buildVEvent({ ...item, date: "20261001", time: "06:30 - 09:00" }, { uidDomain: "x", now })).split("\r\n");
    assert.ok(r.includes("DTSTART:20260930T233000Z") && r.includes("DTEND:20261001T020000Z"));
  });

  test("the time text is still kept in the description", () => {
    assert.ok(ev.some((l) => l.startsWith("DESCRIPTION:09:00 - 12:00 น.")));
  });

  test("reads the time forms people actually type", () => {
    assert.deepEqual(parseTimeRange("09:00 - 12:00 น."), { start: "090000", end: "120000" });
    assert.deepEqual(parseTimeRange("9.30-16.45 น."), { start: "093000", end: "164500" });
    assert.deepEqual(parseTimeRange("๑๓:๐๐ - ๑๖:๓๐ น."), { start: "130000", end: "163000" });
    assert.deepEqual(parseTimeRange("เวลา 10:00 น."), { start: "100000" });
  });

  test("all-day wording, nothing, or a bad time stays all-day", () => {
    for (const t of ["ตลอดวัน", "", undefined, "เช้า", "25:00 - 26:00", "12:75"]) assert.equal(parseTimeRange(t), null, String(t));
  });

  test("an end that is not after the start is dropped, the start stays", () => {
    assert.deepEqual(parseTimeRange("22:00 - 02:00"), { start: "220000" });
    assert.deepEqual(parseTimeRange("10:00 - 10:00"), { start: "100000" });
  });

  test("no VTIMEZONE is needed, in a single event or a mixed feed", () => {
    assert.ok(!buildSingleEventIcs(timed, { uidDomain: "x" }).includes("VTIMEZONE"));
    assert.ok(!buildVCalendar([item, timed], { calName: "c", uidDomain: "x" }).includes("VTIMEZONE"));
  });

  test("a real day is required before a time is trusted", () => {
    const bad = unfold(buildVEvent({ ...timed, date: "20261345" }, { uidDomain: "x", now }));
    assert.ok(!bad.includes("DTSTART:2") && bad.includes("DTSTART;VALUE=DATE:20261345"));
  });
});

describe("ics envelopes", () => {
  test("single-event and feed both declare METHOD:PUBLISH", () => {
    assert.ok(buildSingleEventIcs(item, { uidDomain: "x" }).includes("METHOD:PUBLISH"));
    const feed = buildVCalendar([item], { calName: "ปฏิทิน", uidDomain: "x" });
    assert.ok(feed.includes("METHOD:PUBLISH") && feed.includes("X-WR-CALNAME:"));
    assert.ok(feed.startsWith("BEGIN:VCALENDAR\r\n") && feed.endsWith("END:VCALENDAR\r\n"));
  });
});
