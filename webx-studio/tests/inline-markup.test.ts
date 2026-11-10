import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { toEditorHtml, safeHref, stripMarkup, isColour } from "../lib/inlineMarkup";

describe("toEditorHtml — the stored text in the editable field", () => {
  test("the allowed tags come through, with the colour's look", () => {
    const out = toEditorHtml('a <b>b</b> <a href="https://x.org">c</a> <span data-c="@primary">d</span><br>e', (c) => (c === "@primary" ? "#1a73e8" : undefined));
    assert.equal(out, 'a <b>b</b> <a href="https://x.org">c</a> <span data-c="@primary" style="color:#1a73e8">d</span><br>e');
  });
  test("anything else is escaped, never markup", () => {
    assert.equal(toEditorHtml('<img src=x onerror="alert(1)"><script>x</script>'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&lt;script&gt;x&lt;/script&gt;");
    assert.equal(toEditorHtml('<a href="javascript:alert(1)">x</a>'), "&lt;a href=&quot;javascript:alert(1)&quot;&gt;x&lt;/a&gt;");
    assert.equal(toEditorHtml('<b onclick="x()">t</b>'), "<b>t</b>");
  });
  test("an unclosed tag is closed; a stray closing tag is text", () => {
    assert.equal(toEditorHtml("<b>open"), "<b>open</b>");
    assert.equal(toEditorHtml("a</i>"), "a&lt;/i&gt;");
  });
  test("entities stay escaped once", () => {
    assert.equal(toEditorHtml("a &lt; b &amp; c"), "a &lt; b &amp; c");
  });
});

describe("links, colours and plain words", () => {
  test("safeHref matches the site's own rule", () => {
    for (const ok of ["https://x.org/a", "/orst/news", "#top", "mailto:a@b.org", "tel:021234567"]) assert.equal(safeHref(ok), ok);
    for (const bad of ["javascript:alert(1)", "//evil.org", "data:text/html,x", "https://x.org/a b"]) assert.equal(safeHref(bad), null, bad);
  });
  test("colours: theme tokens or a hex only", () => {
    assert.equal(isColour("@primary"), true);
    assert.equal(isColour("#c00"), true);
    assert.equal(isColour("red"), false);
    assert.equal(isColour("#c00;background:url(x)"), false);
  });
  test("stripMarkup leaves the words", () => {
    assert.equal(stripMarkup('<b>สถาบัน</b> <span data-c="@primary">ความรู้</span><br>ของชาติ &amp; ไทย'), "สถาบัน ความรู้ ของชาติ & ไทย");
  });
});
