import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseFinal, parseLive, writeDefault } from "../lib/styleInput";

describe("typing into a number field", () => {
  test("a field with a minimum above zero can be typed into digit by digit", () => {
    // Scale: min 25, max 300. Typing 1, 15, 150 must not turn into 25 along the way.
    assert.deepEqual(parseLive("1", 25, 300), { action: "wait" });
    assert.deepEqual(parseLive("15", 25, 300), { action: "wait" });
    assert.deepEqual(parseLive("150", 25, 300), { action: "set", n: 150 });
  });

  test("a number in range is applied at once; empty clears", () => {
    assert.deepEqual(parseLive("40", 25, 300), { action: "set", n: 40 });
    assert.deepEqual(parseLive("", 25, 300), { action: "clear" });
    assert.deepEqual(parseLive("   ", 25, 300), { action: "clear" });
  });

  test("half-typed numbers and out-of-range ones wait", () => {
    for (const t of ["-", ".", "-.", "1e", "abc", "99999", "-5"]) assert.deepEqual(parseLive(t, 25, 300), { action: "wait" }, t);
    assert.deepEqual(parseLive("-5", -200, 400), { action: "set", n: -5 });
  });

  test("a decimal is fine", () => {
    assert.deepEqual(parseLive("0.85", 0.8, 3), { action: "set", n: 0.85 });
    assert.deepEqual(parseLive("0.5", 0.8, 3), { action: "wait" });
  });

  test("on leaving the field the value is clamped into range", () => {
    assert.equal(parseFinal("1", 25, 300), 25);
    assert.equal(parseFinal("9999", 25, 300), 300);
    assert.equal(parseFinal("150", 25, 300), 150);
    assert.equal(parseFinal("-9999", -200, 400), -200);
    assert.equal(parseFinal("", 25, 300), undefined);
    assert.equal(parseFinal("abc", 25, 300), "invalid");
    assert.equal(parseFinal("-", 25, 300), "invalid");
  });
});

describe("choosing a field's default", () => {
  test("with nothing inherited it clears the field, keeping the style small", () => {
    assert.equal(writeDefault(100, 100, undefined), undefined);
    assert.equal(writeDefault("linear", "linear", undefined), undefined);
    assert.equal(writeDefault("cover", "cover", undefined), undefined);
  });

  test("with a value inherited it is written, so an override can undo it", () => {
    assert.equal(writeDefault(100, 100, 70), 100);
    assert.equal(writeDefault("linear", "linear", "radial"), "linear");
    assert.equal(writeDefault("cover", "cover", "contain"), "cover");
  });

  test("a value that is not the default is always written", () => {
    assert.equal(writeDefault(50, 100, undefined), 50);
    assert.equal(writeDefault("radial", "linear", undefined), "radial");
  });

  test("an inherited value of zero or an empty string still counts as inherited", () => {
    assert.equal(writeDefault(100, 100, 0), 100);
    assert.equal(writeDefault("cover", "cover", ""), "cover");
  });
});
