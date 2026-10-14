import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  PRESET_MAX, PRESET_NAME_MAX, addPreset, cleanName, cleanPresets, cleanStyle, newPresetId, presetStyle, removePreset,
} from "../lib/stylePresets";

const style = { bg: "#112233", padding: 12, hover: { bg: "#445566" }, mobile: { fontSize: 20 } };

describe("style presets", () => {
  test("a preset keeps the whole style, states and devices included", () => {
    const list = addPreset([], "Card", style)!;
    assert.equal(list.length, 1);
    assert.deepEqual(list[0].style, style);
    assert.match(list[0].id, /^p[a-z0-9]{6}$/);
  });

  test("an empty name or an empty style is refused", () => {
    assert.equal(addPreset([], "   ", style), null);
    assert.equal(addPreset([], "Card", {}), null);
    assert.equal(addPreset([], "Card", { hover: {} }), null);
    assert.equal(addPreset([], "Card", undefined), null);
  });

  test("names are cleaned: control characters and angle brackets removed, trimmed, capped", () => {
    assert.equal(cleanName("  <b>Hero</b>\u0000\n "), "bHero/b");
    assert.equal(cleanName("x".repeat(500)).length, PRESET_NAME_MAX);
    assert.equal(cleanName(null), "");
  });

  test("the list is capped", () => {
    let list: any[] = [];
    for (let i = 0; i < PRESET_MAX; i++) list = addPreset(list, "P" + i, style)!;
    assert.equal(list.length, PRESET_MAX);
    assert.equal(addPreset(list, "One too many", style), null);
  });

  test("ids never collide, even when the random source repeats itself", () => {
    const a = addPreset([], "A", style, () => 0.5)!;
    const b = addPreset(a, "B", style, (() => { let n = 0; return () => (n++ < 3 ? 0.5 : 0.25); })())!;
    assert.equal(new Set(b.map((p) => p.id)).size, 2);
  });

  test("applying gives a copy: editing it never edits the preset", () => {
    const p = addPreset([], "Card", style)![0];
    const copy: any = presetStyle(p);
    copy.hover.bg = "#ffffff"; copy.bg = "#000000";
    assert.equal(p.style.bg, "#112233");
    assert.equal((p.style as any).hover.bg, "#445566");
  });

  test("removing drops exactly one", () => {
    let list = addPreset([], "A", style)!;
    list = addPreset(list, "B", style)!;
    assert.deepEqual(removePreset(list, list[0].id).map((p) => p.name), ["B"]);
    assert.equal(removePreset(list, "nope").length, 2);
  });
});

describe("cleaning what is stored", () => {
  test("only plain data survives: functions, undefined, NaN and arrays are dropped", () => {
    const s = cleanStyle({ bg: "#112233", fn: () => 1, u: undefined, n: NaN, i: Infinity, arr: [1], nested: { ok: 1, bad: undefined } }) as any;
    assert.deepEqual(s, { bg: "#112233", nested: { ok: 1 } });
  });

  test("prototype-pollution keys are ignored", () => {
    const evil = JSON.parse(`{"bg":"#112233","__proto__":{"polluted":true},"constructor":{"x":1}}`);
    const s = cleanStyle(evil) as any;
    assert.deepEqual(s, { bg: "#112233" });
    assert.equal(({} as any).polluted, undefined);
  });

  test("a style too deep or too big is cut or refused", () => {
    const deep = cleanStyle({ a: { b: { c: { d: { e: 1 } } } }, bg: "#112233" }) as any;
    assert.equal(deep.a?.b?.c?.d, undefined);
    assert.equal(cleanStyle({ bg: "x".repeat(1999), a: "x".repeat(1999), b: "x".repeat(1999), c: "x".repeat(1999) }), null);
  });

  test("a stored list drops bad entries, duplicates and anything over the cap", () => {
    const raw = [
      { id: "pabc123", name: "Good", style },
      { id: "pabc123", name: "Duplicate id", style },
      { id: "BAD ID", name: "Bad id", style },
      { id: "pdef456", name: "", style },
      { id: "pghi789", name: "No style", style: {} },
      null, "x", 5,
      { id: "pjkl012", name: "Also good", style: { opacity: 50 } },
    ];
    assert.deepEqual(cleanPresets(raw).map((p) => p.name), ["Good", "Also good"]);
    assert.deepEqual(cleanPresets("nope"), []);
    assert.deepEqual(cleanPresets(undefined), []);
  });

  test("newPresetId avoids ids already in the list", () => {
    const list = [{ id: newPresetId([], () => 0.1), name: "A", style }];
    const next = newPresetId(list, (() => { let n = 0; return () => (n++ ? 0.2 : 0.1); })());
    assert.notEqual(next, list[0].id);
  });
});
