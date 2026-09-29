// The Builder harness opts out of the scroll-reveal animation by removing
// the `js-reveal` class from <html> (see HarnessBridge.tsx). That fix works
// only because of a specific shape in each tenant's base CSS: `.reveal` is
// visible by DEFAULT, and content is hidden only by a rule qualified with
// `html.js-reveal`. If anyone ever inverts that — hiding `.reveal` outright
// and revealing it with a second class — removing the boot class would make
// every block in the Builder permanently invisible instead of permanently
// visible, which is the exact bug this replaced.
//
// So these tests read the real stylesheets rather than mocking them.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SHEETS = [
  ["ORST", "public/assets/orst/css/base.css"],
  ["RoyalSociety", "public/assets/royalsociety/css/02-base.css"],
] as const;

// From this file to the public-site package root.
const root = join(import.meta.dirname, "..", "..");

/** The declaration block of the first rule whose selector matches exactly. */
function ruleBody(css: string, selector: string): string | null {
  // Selectors here are simple and hand-written; a real parser would be
  // overkill for reading two known rules out of two known files.
  const re = new RegExp(String.raw`(^|\})\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\s*\{([^}]*)\}`, "m");
  const m = css.match(re);
  return m ? m[2] : null;
}

for (const [name, rel] of SHEETS) {
  describe(`${name} reveal CSS`, () => {
    const css = readFileSync(join(root, rel), "utf8");

    test("`.reveal` is visible on its own, so a missing boot class can't hide content", () => {
      const body = ruleBody(css, ".reveal");
      assert.notEqual(body, null, ".reveal rule not found in " + rel);
      assert.match(body!, /opacity:\s*1/);
    });

    test("hiding is qualified with html.js-reveal — the class the harness removes", () => {
      const body = ruleBody(css, "html.js-reveal .reveal:not(.is-visible)");
      assert.notEqual(body, null, "the js-reveal-qualified hide rule is missing from " + rel);
      assert.match(body!, /opacity:\s*0/);
    });

    test("nothing else sets .reveal to opacity 0 unconditionally", () => {
      // Any such rule would survive removing the boot class and reintroduce
      // the invisible-block bug.
      for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const [, selector, body] = m;
        if (!selector.includes(".reveal")) continue;
        if (!/opacity:\s*0\b/.test(body)) continue;
        assert.match(selector, /js-reveal/, `unqualified hide rule in ${rel}: ${selector.trim()}`);
      }
    });
  });
}
