import type { RunMode, SliceLimits } from "./types";

// Output limits and timeouts are sized for reasoning models: Kimi K3's
// reasoning counts against max_tokens, and a turn that batches several
// drafts with real content ran out of 1,200 tokens and a 60s timeout live.
const BASE = {
  llmTimeoutMs: 120_000,
  maxToolCallsPerTurn: 6,
  maxTokens: 4096,
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
  workspace: { ...BASE, maxTurns: 25, maxWallMs: 480_000, llmTimeoutMs: 180_000, maxTokens: 8192 },
  job: { ...BASE, maxTurns: 8, maxWallMs: 120_000, llmTimeoutMs: 180_000, maxToolCallsPerTurn: 10, maxTokens: 8192, maxLlmAttempts: 5 },
};

export function limitsFor(mode: RunMode, overrides: Partial<SliceLimits> = {}): SliceLimits {
  return { ...LIMITS[mode], ...overrides };
}
