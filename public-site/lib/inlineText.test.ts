// Formatting inside a line of text. Every field it reads comes from editors (and the agent), so most of these are
// about what must stay plain text.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { inline, plainText, parseInline } from "./inlineText";

const html = (s: string, opts?: { links?: boolean }) => renderToStaticMarkup(createElement("p", null, inline(s, opts)));

describe("inline formatting — what it renders", () => {
  test("bold, italic, underline, strike and a line break", () => {
    assert.equal(html("a <b>b</b> <i>c</i> <u>d</u> <s>e</s><br>f"), "<p>a <strong style=\"color:inherit\">b</strong> <em style=\"color:inherit\">c</em> <u>d</u> <s>e</s><br/>f</p>");
  });
  test("strong / em are read as bold / italic", () => {
    assert.equal(html("<strong>x</strong><em>y</em>"), "<p><strong style=\"color:inherit\">x</strong><em style=\"color:inherit\">y</em></p>");
  });
  test("a link on a few words, and a theme colour", () => {
    assert.match(html('ดู <a href="https://example.org/a">ที่นี่</a>'), /<a href="https:\/\/example.org\/a" class="block-autolink" rel="noopener noreferrer">ที่นี่<\/a>/);
    assert.match(html('<span data-c="@primary">สี</span>'), /<span style="color:var\(--[^"]+\)">สี<\/span>/);
    assert.match(html('<span data-c="#c00">red</span>'), /<span style="color:#c00">red<\/span>/);
  });
  test("nested formatting", () => {
    assert.equal(html("<b>a <i>b</i></b>"), "<p><strong style=\"color:inherit\">a <em style=\"color:inherit\">b</em></strong></p>");
  });
  test("typed addresses still become links, but not inside a link", () => {
    assert.match(html("<b>see https://x.org/a</b>"), /<strong style="color:inherit">see <a href="https:\/\/x.org\/a"/);
    assert.equal((html('<a href="https://x.org">go https://y.org</a>').match(/<a /g) || []).length, 1);
  });
  test("links: false keeps the formatting and drops the links (inside a card that is a link)", () => {
    const out = html('<b>x</b> <a href="https://x.org">y</a> https://z.org', { links: false });
    assert.doesNotMatch(out, /<a /);
    assert.match(out, /<strong style="color:inherit">x<\/strong> y https:\/\/z.org/);
  });
  test("entities come back as the characters they stand for", () => {
    assert.equal(html("<b>a &lt; b &amp; c</b>"), "<p><strong style=\"color:inherit\">a &lt; b &amp; c</strong></p>");
  });
});

describe("inline formatting — what stays text", () => {
  test("any other tag is shown as text, never as markup", () => {
    for (const s of ["<script>alert(1)</script>", '<img src=x onerror="alert(1)">', "<div>x</div>", "<style>*{}</style>"]) {
      const out = html(s);
      assert.doesNotMatch(out, /<(script|img|div|style)/, s);
    }
  });
  test("attributes other than href / data-c are not carried over", () => {
    const out = html('<b onclick="x()" style="color:red">t</b><span data-c="@primary" onmouseover="y()">u</span>');
    assert.doesNotMatch(out, /onclick|onmouseover|color:red/);
  });
  test("an unsafe link or a made-up colour leaves the tag as text", () => {
    assert.doesNotMatch(html('<a href="javascript:alert(1)">x</a>'), /<a /);
    assert.doesNotMatch(html('<span data-c="red;background:url(x)">x</span>'), /<span style/);
  });
  test("a closing tag that does not match is text; an unclosed tag keeps its formatting", () => {
    assert.equal(html("a</b>"), "<p>a&lt;/b&gt;</p>");
    assert.equal(html("<b>open"), "<p><strong style=\"color:inherit\">open</strong></p>");
  });
  test("no link inside a link", () => {
    const out = html('<a href="https://a.org">x <a href="https://b.org">y</a></a>');
    assert.equal((out.match(/<a /g) || []).length, 1);
    assert.equal(parseInline('<a href="https://a.org">x</a>').length, 1);
  });
});

describe("plainText", () => {
  test("the words alone", () => {
    assert.equal(plainText('<b>สถาบัน</b> <span data-c="@primary">ความรู้</span><br>ของชาติ'), "สถาบัน ความรู้ ของชาติ");
    assert.equal(plainText("no tags"), "no tags");
    assert.equal(plainText(undefined), "");
  });
});
