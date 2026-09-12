// Plan/seat-limit enforcement (lib/plans.ts) — a full-codebase audit
// (2026-09-12, M15) found no test anywhere confirms the seat cap actually
// blocks adding a user past a workspace's plan limit, unlike the agent's own
// token-budget enforcement (well-tested). governance.ts's users.create()
// itself needs a real request/cookie scope (via requireUser()) that this
// suite has no harness for yet, but the enforcement DECISION doesn't need
// any of that — seatLimitExceeded() was extracted from users.create()
// specifically so this part is testable without one. See governance.ts's
// own call site and plans.ts's comment on seatLimitExceeded().
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { PLAN_LIMITS, planLimit, seatLimitExceeded } from "../lib/plans";

describe("seatLimitExceeded", () => {
  test("free plan (seats: 1) blocks the 2nd user, allows the 1st", () => {
    assert.equal(seatLimitExceeded("free", 0), false);
    assert.equal(seatLimitExceeded("free", 1), true);
    assert.equal(seatLimitExceeded("free", 2), true);
  });

  test("pro plan (seats: 5) blocks only once the cap is actually reached", () => {
    assert.equal(seatLimitExceeded("pro", 4), false);
    assert.equal(seatLimitExceeded("pro", 5), true);
    assert.equal(seatLimitExceeded("pro", 6), true);
  });

  test("enterprise plan (seats: Infinity) never blocks, at any realistic count", () => {
    assert.equal(seatLimitExceeded("enterprise", 0), false);
    assert.equal(seatLimitExceeded("enterprise", 1_000_000), false);
  });

  test("an unknown/missing plan falls back to free's limit, not unlimited", () => {
    assert.equal(seatLimitExceeded(undefined, 1), true);
    assert.equal(seatLimitExceeded("not-a-real-plan", 1), true);
    assert.equal(seatLimitExceeded(undefined, 0), false);
  });

  test("stays correct if PLAN_LIMITS itself changes — reads through planLimit(), not a hardcoded number", () => {
    for (const [plan, limits] of Object.entries(PLAN_LIMITS)) {
      if (!Number.isFinite(limits.seats)) continue; // enterprise-shaped: never exceeded, nothing to assert against a number
      assert.equal(seatLimitExceeded(plan, limits.seats - 1), false, `${plan}: one under its own seat limit should be allowed`);
      assert.equal(seatLimitExceeded(plan, limits.seats), true, `${plan}: exactly at its own seat limit should be blocked`);
    }
  });

  test("planLimit() itself still returns the expected shape for each tier (regression guard for the table above)", () => {
    assert.equal(planLimit("free").seats, 1);
    assert.equal(planLimit("pro").seats, 5);
    assert.equal(planLimit("enterprise").seats, Infinity);
  });
});
