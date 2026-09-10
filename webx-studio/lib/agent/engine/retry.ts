// What to do when a model request fails. Transient failures back off and
// retry; a context overflow gets one aggressive compaction; a provider
// rejecting the tool-call structure gets one history repair; everything
// else (bad key, unknown model) fails the turn.
import { LlmError, type LlmErrorKind } from "./errors";
import type { RunMode } from "./types";

export type RetryState = { compacted: boolean; repaired: boolean };

export type RetryDecision =
  | { action: "retry"; delayMs: number; reason: LlmErrorKind }
  | { action: "compact" }
  | { action: "repair" }
  /** Out of attempts in a background job: requeue it rather than fail. */
  | { action: "later" }
  | { action: "fail"; reason: LlmErrorKind | "unexpected" };

const TRANSIENT: ReadonlySet<LlmErrorKind> = new Set<LlmErrorKind>(["network", "timeout", "rate_limit", "server"]);
const TOOL_PROTOCOL_400 = /tool_call_id|tool_calls?\b|tool_use|tool_result|function call|reasoning_content|thinking/i;

/** Exponential backoff with equal jitter, 1s → 30s, never shorter than the provider's Retry-After. */
export function backoffMs(attempt: number, random: () => number = Math.random, retryAfterMs?: number, baseMs = 1000, capMs = 30_000): number {
  const ceiling = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  const jittered = Math.round(ceiling / 2 + random() * (ceiling / 2));
  return retryAfterMs && retryAfterMs > jittered ? Math.round(retryAfterMs) : jittered;
}

/** `attempt` is the 1-based number of the request that just failed. */
export function decideRetry(
  err: unknown,
  attempt: number,
  o: { maxAttempts: number; mode: RunMode; state: RetryState; random?: () => number },
): RetryDecision {
  if (!(err instanceof LlmError)) return { action: "fail", reason: "unexpected" };
  if (TRANSIENT.has(err.kind)) {
    if (attempt < o.maxAttempts) return { action: "retry", delayMs: backoffMs(attempt, o.random, err.retryAfterMs), reason: err.kind };
    return o.mode === "job" ? { action: "later" } : { action: "fail", reason: err.kind };
  }
  if (err.kind === "context_length") return o.state.compacted ? { action: "fail", reason: err.kind } : { action: "compact" };
  if (err.kind === "bad_request" && TOOL_PROTOCOL_400.test(err.body || err.message)) {
    return o.state.repaired ? { action: "fail", reason: err.kind } : { action: "repair" };
  }
  return { action: "fail", reason: err.kind };
}
