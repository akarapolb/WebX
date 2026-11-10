import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { splitLinks, autolink } from "./autolink";

const links = (s: string) => splitLinks(s).filter((p) => p.href).map((p) => [p.text, p.href]);

describe("autolink — what becomes a link", () => {
  test("a typed address in a sentence", () => {
    assert.deepEqual(links("ดูที่ https://example.org/form ได้เลย"), [["https://example.org/form", "https://example.org/form"]]);
  });
  test("www. gets https, an e-mail gets mailto:", () => {
    assert.deepEqual(links("www.orst.go.th และ info@orst.go.th"), [["www.orst.go.th", "https://www.orst.go.th"], ["info@orst.go.th", "mailto:info@orst.go.th"]]);
  });
  test("the full sentence is kept around the link", () => {
    assert.equal(splitLinks("a https://x.org/p, b").map((p) => p.text).join(""), "a https://x.org/p, b");
  });
  test("a full stop, comma or bracket after the address is not part of it", () => {
    assert.deepEqual(links("see https://x.org/a."), [["https://x.org/a", "https://x.org/a"]]);
    assert.deepEqual(links("(https://x.org/a)"), [["https://x.org/a", "https://x.org/a"]]);
    assert.deepEqual(links("https://en.wikipedia.org/wiki/Foo_(bar)"), [["https://en.wikipedia.org/wiki/Foo_(bar)", "https://en.wikipedia.org/wiki/Foo_(bar)"]]);
  });
  test("Thai written straight after an address is not swallowed", () => {
    assert.deepEqual(links("https://x.org/aแล้ว"), [["https://x.org/a", "https://x.org/a"]]);
  });
});

describe("autolink — what stays text", () => {
  test("text with no address is returned untouched", () => {
    assert.equal(autolink("just words"), "just words");
    assert.equal(autolink(""), "");
    assert.equal(autolink(undefined), undefined);
  });
  test("javascript: and other schemes never become links", () => {
    assert.deepEqual(links("javascript:alert(1) data:text/html,hi ftp://x.org"), []);
  });
  test("markup in the text is not turned into links or tags", () => {
    assert.deepEqual(links('<a href="https://x.org">x</a>').map((l) => l[1]).filter((h) => /["<>]/.test(String(h))), []);
  });
  test("a bare word with an @ but no domain is not an e-mail", () => {
    assert.deepEqual(links("@somebody and a@b"), []);
  });
});
