import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { wpSlash } from "../lib/cms/wpSlash";

const BS = String.fromCharCode(92);

// PHP's stripslashes(), which the REST layer applies once: "\\" -> "\", "\0" -> NUL, "\x" -> "x".
function stripslashes(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === BS && i + 1 < s.length) { i++; out += s[i] === "0" ? "\u0000" : s[i]; }
    else if (s[i] !== BS) out += s[i];
  }
  return out;
}

describe("wpSlash", () => {
  const samples = [
    "plain text",
    'say "hi" there',
    "it's fine",
    "back" + BS + "slash",
    "line1\nline2\ttabbed",
    JSON.stringify([{ type: "x", t: 'a "b" c\nd', u: "x" + BS + "y" }]),
    "ข้อความไทย \"อ้างอิง\" และ 'เครื่องหมาย'",
    "emoji 🎉 and \u0000 nul",
    "",
    BS,
    BS + BS + '"' + "'",
  ];

  test("what WordPress stores after its one unslash is exactly what was sent", () => {
    for (const s of samples) assert.equal(stripslashes(wpSlash(s)), s, JSON.stringify(s));
  });

  test("without it, JSON with a quote is corrupted — the bug this exists for", () => {
    const json = JSON.stringify([{ t: 'a "b" c' }]);
    assert.throws(() => JSON.parse(stripslashes(json)));
    assert.deepEqual(JSON.parse(stripslashes(wpSlash(json))), [{ t: 'a "b" c' }]);
  });

  test("newlines and tabs survive (they are escapes in JSON, so they carry a backslash)", () => {
    const json = JSON.stringify({ css: "a: 1\nb: 2\tc" });
    assert.equal(JSON.parse(stripslashes(wpSlash(json))).css, "a: 1\nb: 2\tc");
  });

  test("arrays and objects are slashed inside, and non-strings are left alone", () => {
    assert.deepEqual(wpSlash({ a: ['x"y', 5, true, null], b: { c: "it's" } }), { a: ["x" + BS + '"y', 5, true, null], b: { c: "it" + BS + "'s" } });
    assert.equal(wpSlash(42), 42);
    assert.equal(wpSlash(null), null);
    assert.equal(wpSlash(undefined), undefined);
  });

  test("a string with nothing to slash comes out unchanged", () => {
    assert.equal(wpSlash("hello world 123 ก ข ค"), "hello world 123 ก ข ค");
  });
});
