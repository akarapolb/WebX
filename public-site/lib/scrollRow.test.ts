import { test } from "node:test";
import assert from "node:assert/strict";
import { scrollStep } from "./scrollRow";

test("one press moves about a screen of cards, never less than a card", () => {
  assert.equal(scrollStep({ clientWidth: 1000 }, "right"), 800);
  assert.equal(scrollStep({ clientWidth: 1000 }, "left"), -800);
  assert.equal(scrollStep({ clientWidth: 200 }, "right"), 240);
});
