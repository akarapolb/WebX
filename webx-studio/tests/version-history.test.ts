import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { versionName, dayHeading, clockTime, ago, compareVersions, show } from "../lib/versionHistory";

const t = (k: string) => ({ "vb.ver.published": "Published", "vb.ver.agent": "AI agent edit", "vb.ver.untitled": "Untitled", "vb.manualver": "Manual save" } as Record<string, string>)[k] || k;

describe("versionName", () => {
  test("automatic labels read as words", () => {
    assert.deepEqual(versionName("agent:5dfea9f3-9b44-4c50-a152-9adf4e30d5e5", t), { text: "AI agent edit", auto: true });
    assert.deepEqual(versionName("agent:5dfea9f3-9b44 (EN)", t), { text: "AI agent edit (EN)", auto: true });
    assert.deepEqual(versionName("Published", t), { text: "Published", auto: true });
    assert.deepEqual(versionName("", t), { text: "Untitled", auto: true });
  });
  test("a name someone typed is kept as it is", () => {
    assert.deepEqual(versionName("ก่อนแก้หน้าแรก", t), { text: "ก่อนแก้หน้าแรก", auto: false });
  });
});

describe("dates", () => {
  const now = new Date(2026, 10, 10, 12, 0, 0);
  test("today and yesterday are named, older days are written out", () => {
    assert.equal(dayHeading(new Date(2026, 10, 10, 9, 0).toISOString(), "en", now), "Today");
    assert.equal(dayHeading(new Date(2026, 10, 9, 23, 0).toISOString(), "th", now), "เมื่อวาน");
    assert.match(dayHeading(new Date(2026, 10, 3, 9, 0).toISOString(), "en", now), /3 November 2026/);
  });
  test("the time has seconds, so two saves in one minute differ", () => {
    assert.equal(clockTime(new Date(2026, 10, 10, 10, 36, 7).toISOString()), "10:36:07");
  });
  test("how long ago", () => {
    assert.equal(ago(new Date(2026, 10, 10, 11, 55).toISOString(), "en", now), "5 minutes ago");
    assert.equal(ago(new Date(2026, 10, 10, 9, 0).toISOString(), "th", now), "3 ชั่วโมงที่แล้ว");
    assert.equal(ago(new Date(2026, 10, 10, 11, 59, 50).toISOString(), "en", now), "just now");
  });
});

describe("compareVersions", () => {
  const hero = (heading: string) => ({ __component: "orst.home-hero", id: 1, heading });
  test("an unchanged page has no differences", () => {
    assert.deepEqual(compareVersions([hero("a")], [hero("a")]), []);
  });
  test("a changed text shows what it said then and now", () => {
    const d = compareVersions([hero("Old title")], [hero("New title")]);
    assert.equal(d.length, 1);
    assert.deepEqual(d[0].changes, [{ field: "heading", before: "Old title", after: "New title" }]);
  });
  test("a change inside a list names the item and its field", () => {
    const then = [{ __component: "orst.card-grid", items: [{ title: "A", body: "x" }, { title: "B" }] }];
    const now = [{ __component: "orst.card-grid", items: [{ title: "A", body: "y" }, { title: "B" }, { title: "C" }] }];
    assert.deepEqual(compareVersions(then, now)[0].changes, [
      { field: "items #1 · body", before: "x", after: "y" },
      { field: "items #3", before: "", after: "C" },
    ]);
  });
  test("a style change names the part and the values", () => {
    const then = [{ __component: "orst.card-grid", styles: { heading: { color: "#000" } } }];
    const now = [{ __component: "orst.card-grid", styles: { heading: { color: "#c00" } } }];
    assert.deepEqual(compareVersions(then, now)[0].changes, [{ field: "style · heading", before: "color: #000", after: "color: #c00" }]);
  });
  test("styles added to a block that had none are listed part by part", () => {
    const then = [{ __component: "orst.feature-list" }];
    const now = [{ __component: "orst.feature-list", styles: { "itemIcon.0": { iconColor: "#e11d48" } } }];
    assert.deepEqual(compareVersions(then, now)[0].changes, [{ field: "style · itemIcon.0", before: "", after: "iconColor: #e11d48" }]);
  });
  test("added, removed and replaced blocks", () => {
    assert.equal(compareVersions([], [hero("a")])[0].status, "added");
    assert.equal(compareVersions([hero("a")], [])[0].status, "removed");
    const r = compareVersions([hero("a")], [{ __component: "orst.card-grid" }])[0];
    assert.equal(r.status, "replaced"); assert.equal(r.fromComp, "orst.home-hero");
  });
  test("long text is shortened", () => {
    assert.ok(show("x".repeat(500)).length <= 140);
  });
});
