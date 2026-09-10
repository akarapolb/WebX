import type { RunMode, SliceLimits } from "./types";

const BASE = {
  llmTimeoutMs: 60_000,
  maxToolCallsPerTurn: 6,
  maxTokens: 1200,
  toolFullBytes: 6 * 1024,
  toolDigestBytes: 300,
  digestAfterBytes: 40 * 1024,
  maxLlmAttempts: 3,
  compactAt: 0.6,
  compactTo: 0.5,
  contextHardLimit: 0.9,
};

export const LIMITS: Record<RunMode, SliceLimits> = {
  docked: { ...BASE, maxTurns: 10, maxWallMs: 90_000 },
  // The run route's maxDuration is 600s; leave room for the last turn to finish.
  workspace: { ...BASE, maxTurns: 25, maxWallMs: 480_000 },
  job: { ...BASE, maxTurns: 8, maxWallMs: 120_000, llmTimeoutMs: 90_000, maxToolCallsPerTurn: 10, maxTokens: 4096, maxLlmAttempts: 5 },
};

export function limitsFor(mode: RunMode, overrides: Partial<SliceLimits> = {}): SliceLimits {
  return { ...LIMITS[mode], ...overrides };
}
