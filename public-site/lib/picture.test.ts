import { test } from "node:test";
import assert from "node:assert/strict";
import { webpSibling } from "../components/Picture";

test("the site's own pictures get their .webp copy", () => {
  assert.equal(webpSibling("/assets/orst/images/hero03.png"), "/assets/orst/images/hero03.webp");
  assert.equal(webpSibling("/assets/royalsociety/images/BG-01.jpg"), "/assets/royalsociety/images/BG-01.webp");
});
test("an uploaded picture (no .webp beside it) is offered as it is, never a .webp that 404s", () => {
  assert.equal(webpSibling("http://localhost:8081/wp-content/uploads/2026/11/bg.jpg"), null);
  assert.equal(webpSibling("https://cms.example.org/uploads/a.png"), null);
  assert.equal(webpSibling("/uploads/a.jpg"), null);
  assert.equal(webpSibling("/assets/x.svg"), null);
});
