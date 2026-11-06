import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { safeLink, entryLink } from "./linkUrl";

describe("safeLink / entryLink", () => {
  test("accepts http(s) addresses, mailto:, tel:, paths on this site and anchors", () => {
    const url = "https://www.orst.go.th/iwfm_list.asp?n=g&b=e&i=0020000402001002%2F69F%2DN3044019";
    assert.equal(safeLink(url), url);
    assert.equal(safeLink("  http://example.com/a?b=1#c  "), "http://example.com/a?b=1#c");
    assert.equal(safeLink("/orst/about"), "/orst/about");
    assert.equal(safeLink("#contact"), "#contact");
    assert.equal(safeLink("mailto:info@orst.go.th"), "mailto:info@orst.go.th");
    assert.equal(safeLink("tel:+6622222222"), "tel:+6622222222");
  });
  test("refuses script and data URLs, protocol-relative links, spaces, quotes, markup and non-strings", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>1</script>", "//evil.example/x", "https://", "ftp://x.org/f",
      "https://a.com/x y", 'https://a.com/"onmouseover="x', "https://a.com/<b>", "orst.go.th/page", "", "   ", "/a\b", "x".repeat(2001)]) {
      assert.equal(safeLink(bad), null, JSON.stringify(bad).slice(0, 40));
    }
    for (const bad of [null, undefined, 5, {}, ["/a"]]) assert.equal(safeLink(bad as any), null);
  });
  test("entryLink uses the entry's own link_url, else the fallback", () => {
    assert.equal(entryLink({ acf: { link_url: "https://www.orst.go.th/x" } }), "https://www.orst.go.th/x");
    assert.equal(entryLink({ acf: { link_url: "javascript:alert(1)" } }), "#");
    assert.equal(entryLink({ acf: {} }, "/fallback"), "/fallback");
    assert.equal(entryLink(undefined), "#");
  });
});
