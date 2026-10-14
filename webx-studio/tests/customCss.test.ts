import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ALLOWED_PROPS, customDecls, parseCustomCss } from "../lib/customCss";
import { isBlankStyle } from "../lib/componentStyle";

const norm = (s: string) => s.split("\r\n").join("\n");

describe("custom CSS in the Studio", () => {
  test("the validator is byte-for-byte the one the public site runs", () => {
    const site = path.join(__dirname, "..", "..", "public-site", "templates", "_builder", "customCss.ts");
    // The Studio is built on its own (Docker context = this folder), so the copy may not be there; when it is, it must match.
    if (!fs.existsSync(site)) return;
    assert.equal(norm(fs.readFileSync(path.join(__dirname, "..", "lib", "customCss.ts"), "utf8")), norm(fs.readFileSync(site, "utf8")),
      "webx-studio/lib/customCss.ts and public-site/templates/_builder/customCss.ts have drifted apart — copy one over the other");
  });

  test("it tells the editor what will be ignored, and why", () => {
    const r = parseCustomCss("opacity: .5\nfont-family: x\nwidth: url(x)\nnonsense");
    assert.equal(r.accepted.length, 1);
    assert.deepEqual(r.ignored.map((i) => i.reason), ["unknown-property", "bad-value", "malformed"]);
  });

  test("the allowlist leaves out what must never be there", () => {
    for (const bad of ["content", "font-family", "src", "animation"]) assert.ok(!ALLOWED_PROPS.includes(bad), bad);
  });

  test("custom CSS makes a style non-blank, in a device or dark override too", () => {
    assert.equal(isBlankStyle({ customCss: "opacity: .5" }), false);
    assert.equal(isBlankStyle({ mobile: { customCss: "display: none" } }), false);
    assert.equal(isBlankStyle({ dark: { customCss: "" } }), true);
  });

  test("declarations come out marked !important", () => {
    assert.deepEqual(customDecls("letter-spacing: 1px"), ["letter-spacing:1px!important"]);
  });
});
