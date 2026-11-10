// The agent's style properties must match what the page really renders: a key the Style panel can set but the agent
// cannot is a gap, and a key the agent can set but the page ignores is a silent no-op.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { STYLE_SPEC, checkStyleValue } from "../lib/agent/styleSpec";

const stylesTs = fs.readFileSync(path.join(__dirname, "..", "..", "public-site", "templates", "_builder", "styles.ts"), "utf8");
const KEYS = JSON.parse("[" + /export const STYLE_KEYS = \[([\s\S]*?)\]/.exec(stylesTs)![1].replace(/,\s*$/, "") + "]") as string[];
const NOT_A_PROPERTY = new Set(["hover", "focus", "active", "tablet", "mobile", "dark"]); // the variants, set with `variant`

test("the agent can set every style property the page renders, except free CSS", () => {
  const missing = KEYS.filter((k) => !NOT_A_PROPERTY.has(k) && k !== "customCss" && !STYLE_SPEC[k]);
  assert.deepEqual(missing, []);
});
test("and nothing the page does not render", () => {
  assert.deepEqual(Object.keys(STYLE_SPEC).filter((k) => !KEYS.includes(k)), []);
});
test("free CSS stays with people", () => {
  assert.equal(checkStyleValue("customCss", "color:red").ok, false);
});
