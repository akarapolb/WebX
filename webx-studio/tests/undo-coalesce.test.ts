// When a change starts a new undo step (lib/undoCoalesce.ts).
//
// The fault this replaced: the window was measured from the last STEP, so a
// colour drag longer than 600ms was cut into several steps and one Ctrl+Z
// reverted only the last slice. These tests replay a drag against a clock.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { coalesce, QUIET_MS } from "../lib/undoCoalesce";

/** Feed a sequence of (kind, time) events through coalesce; count the steps. */
function replay(events: Array<["edit" | "step", number]>): { pushes: number[]; } {
  let last = 0;
  const pushes: number[] = [];
  for (const [kind, t] of events) {
    const r = coalesce(kind, t, last);
    last = r.lastEdit;
    if (r.push) pushes.push(t);
  }
  return { pushes };
}

describe("coalesce — edits", () => {
  test("the first edit takes a snapshot", () => {
    assert.equal(coalesce("edit", 1000, 0).push, true);
  });

  test("a continuous drag is ONE step, however long it runs", () => {
    // 3 seconds of pointer-move events, 16ms apart — five times the quiet window.
    const events: Array<["edit", number]> = [];
    for (let t = 1000; t < 4000; t += 16) events.push(["edit", t]);
    assert.equal(replay(events).pushes.length, 1);
  });

  test("the old behaviour would have cut that same drag into several steps", () => {
    // Reproduces the bug, so the test above is shown to be guarding something.
    let lastPush = 0; let old = 0;
    for (let t = 1000; t < 4000; t += 16) { if (t - lastPush >= QUIET_MS) { lastPush = t; old++; } }
    assert.ok(old > 1, "fixed window from the last step produced " + old + " steps");
  });

  test("a pause longer than the window starts a new step", () => {
    const { pushes } = replay([["edit", 1000], ["edit", 1100], ["edit", 1100 + QUIET_MS + 1]]);
    assert.deepEqual(pushes, [1000, 1100 + QUIET_MS + 1]);
  });

  test("a gap just under the window keeps the burst going", () => {
    assert.equal(replay([["edit", 1000], ["edit", 1000 + QUIET_MS - 1]]).pushes.length, 1);
  });

  test("an edit always moves the end of the burst forward, pushed or not", () => {
    assert.equal(coalesce("edit", 1200, 1000).lastEdit, 1200);
    assert.equal(coalesce("edit", 9999, 0).lastEdit, 9999);
  });

  test("two separate drags with a pause between are two steps", () => {
    const events: Array<["edit", number]> = [];
    for (let t = 1000; t < 1500; t += 16) events.push(["edit", t]);
    for (let t = 3000; t < 3500; t += 16) events.push(["edit", t]);
    assert.equal(replay(events).pushes.length, 2);
  });
});

describe("coalesce — discrete steps", () => {
  test("always takes a snapshot", () => {
    assert.equal(coalesce("step", 1000, 0).push, true);
    assert.equal(coalesce("step", 1050, 1000).push, true); // even mid-burst
  });

  test("ends the burst, so the next edit is not folded into the action", () => {
    // delete right after editing, then edit again immediately
    const { pushes } = replay([["edit", 1000], ["step", 1100], ["edit", 1150]]);
    assert.deepEqual(pushes, [1000, 1100, 1150]);
  });

  test("two rapid actions are two steps, never swallowed", () => {
    assert.equal(replay([["step", 1000], ["step", 1010], ["step", 1020]]).pushes.length, 3);
  });
});
