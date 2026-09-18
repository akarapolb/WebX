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
  // 90s/10 turns was too tight for the panel's own headline flows: a single
  // "import this page and build it here" run legitimately needs import_* →
  // list_content_types → get_content_type_schema → list_block_types →
  // create_draft_entry → insert_blocks, and at a reasoning model's ~6-10s a
  // turn that paused mid-way every time (observed live: "6 of 9 steps
  // succeeded", leaving a created-but-empty page behind until someone
  // pressed Continue). Still well inside the run route's own maxDuration of
  // 600s, and workspace mode stays the longer-running tier above it.
  docked: { ...BASE, maxTurns: 18, maxWallMs: 240_000 },
  // The run route's maxDuration is 600s; leave room for the last turn to finish.
  workspace: { ...BASE, maxTurns: 25, maxWallMs: 480_000, llmTimeoutMs: 180_000, maxTokens: 8192 },
  job: { ...BASE, maxTurns: 8, maxWallMs: 120_000, llmTimeoutMs: 180_000, maxToolCallsPerTurn: 10, maxTokens: 8192, maxLlmAttempts: 5 },
};

export function limitsFor(mode: RunMode, overrides: Partial<SliceLimits> = {}): SliceLimits {
  return { ...LIMITS[mode], ...overrides };
}
