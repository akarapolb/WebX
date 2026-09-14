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

import { PLAN_LIMITS, planLimit, seatLimitExceeded, tokenBudgetExceeded, agentUsagePercent } from "../lib/plans";

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

// 2026-09-14: Pro's "fair usage, managed automatically" AI copy is now
// backed by a real monthly token budget (governance.ts's
// enforceAgentTokenBudget, called before a background job is created).
// Summing real job rows needs a live Strapi connection this suite can't
// fake, so — same move as seatLimitExceeded above — the sum-vs-limit
// DECISION is pulled out into tokenBudgetExceeded() and tested on its own.
describe("tokenBudgetExceeded", () => {
  test("free plan (0 tokens/month) blocks at the very first token", () => {
    assert.equal(tokenBudgetExceeded("free", 0), true);
    assert.equal(tokenBudgetExceeded("free", 1), true);
  });

  test("pro plan (2M tokens/month) blocks only once usage reaches the cap", () => {
    assert.equal(tokenBudgetExceeded("pro", 1_999_999), false);
    assert.equal(tokenBudgetExceeded("pro", 2_000_000), true);
    assert.equal(tokenBudgetExceeded("pro", 2_500_000), true);
  });

  test("enterprise plan (Infinity) never blocks, at any realistic usage", () => {
    assert.equal(tokenBudgetExceeded("enterprise", 0), false);
    assert.equal(tokenBudgetExceeded("enterprise", 1_000_000_000), false);
  });

  test("an unknown/missing plan falls back to free's budget, not unlimited", () => {
    assert.equal(tokenBudgetExceeded(undefined, 1), true);
    assert.equal(tokenBudgetExceeded("not-a-real-plan", 1), true);
    assert.equal(tokenBudgetExceeded(undefined, 0), true); // free's own budget is 0, so even 0 used is already "at the limit"
  });

  test("stays correct if PLAN_LIMITS itself changes — reads through planLimit(), not a hardcoded number", () => {
    for (const [plan, limits] of Object.entries(PLAN_LIMITS)) {
      if (!Number.isFinite(limits.agentMonthlyJobTokens)) continue; // enterprise-shaped: never exceeded, nothing to assert against a number
      if (limits.agentMonthlyJobTokens > 0) {
        assert.equal(tokenBudgetExceeded(plan, limits.agentMonthlyJobTokens - 1), false, `${plan}: one token under its own budget should be allowed`);
      }
      assert.equal(tokenBudgetExceeded(plan, limits.agentMonthlyJobTokens), true, `${plan}: exactly at its own token budget should be blocked`);
    }
  });

  test("planLimit() itself still returns the expected token budget for each tier (regression guard for the table above)", () => {
    assert.equal(planLimit("free").agentMonthlyJobTokens, 0);
    assert.equal(planLimit("pro").agentMonthlyJobTokens, 2_000_000);
    assert.equal(planLimit("enterprise").agentMonthlyJobTokens, Infinity);
  });
});

// 2026-09-14, later same day: Billing.tsx's AI-usage bar shows a percentage
// instead of the raw used/limit numbers (matching how Claude's own consumer
// plans communicate usage) specifically so the actual token cap never
// reaches a network response, and so PLAN_LIMITS.pro's real number can be
// retuned later with zero client-side change. agentUsagePercent() is the
// one function allowed to see both the real usage AND the real limit and
// reduce them to the single number the browser is allowed to see.
describe("agentUsagePercent", () => {
  test("pro plan (2M budget) reduces usage to a rounded percentage", () => {
    assert.equal(agentUsagePercent("pro", 0), 0);
    assert.equal(agentUsagePercent("pro", 20_000), 1); // 1%, rounded
    assert.equal(agentUsagePercent("pro", 1_000_000), 50);
    assert.equal(agentUsagePercent("pro", 2_000_000), 100);
  });

  test("never exceeds 100%, even if usage somehow overshoots the budget", () => {
    assert.equal(agentUsagePercent("pro", 3_000_000), 100);
  });

  test("free plan (0 budget) and enterprise (Infinity) both return 0 — a percentage isn't a meaningful answer for either, callers check the plan's own limit shape separately", () => {
    assert.equal(agentUsagePercent("free", 0), 0);
    assert.equal(agentUsagePercent("enterprise", 50_000_000), 0);
  });

  test("an unknown/missing plan falls back to free's (0) budget, same as tokenBudgetExceeded/seatLimitExceeded", () => {
    assert.equal(agentUsagePercent(undefined, 100), 0);
    assert.equal(agentUsagePercent("not-a-real-plan", 100), 0);
  });

  test("stays correct if PLAN_LIMITS.pro's budget changes — reads through planLimit(), not a hardcoded number", () => {
    const limit = PLAN_LIMITS.pro.agentMonthlyJobTokens;
    assert.equal(agentUsagePercent("pro", Math.round(limit / 4)), 25);
    assert.equal(agentUsagePercent("pro", limit), 100);
  });
});
