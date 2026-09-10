// Keeps a long run inside the model's context window without an extra LLM
// call. Deterministic: first, tool results older than the last exchanges are
// replaced by their digests; then the oldest history items are folded into
// the pinned progress message, which keeps every entry id. A tool-call
// exchange is one history item, so it is never split from its results.
import { buildWireMessages } from "./checkpoint";
import { providerFor } from "./providers";
import { byteLen } from "./toolView";
import type { HItem, RunCheckpoint, SliceLimits, ToolSpec } from "./types";

export const DEFAULT_TOKEN_RATIO = 0.3;
const SAFETY = 1.1;
const PROGRESS_MAX_BYTES = 6 * 1024;
const GOAL_MAX_CHARS = 8000;
export const PROGRESS_HEADER = "Progress so far (older steps, summarized by the harness; ids are exact):";
const OMITTED_LINE = /^- \((\d+) earlier steps? omitted\)$/;

export type CompactionResult = { changed: boolean; overLimit: boolean; beforeTokens: number; afterTokens: number; folded: number };

type CompactOpts = {
  system: string;
  specs: ToolSpec[];
  limits: Pick<SliceLimits, "digestAfterBytes" | "compactAt" | "compactTo" | "contextHardLimit">;
  /** After a context-length error: compact regardless of the estimate, harder. */
  aggressive?: boolean;
};

export function requestBytes(cp: RunCheckpoint, system: string, specs: ToolSpec[], digestAfterBytes: number): number {
  const messages = buildWireMessages(cp, { system, targetModel: cp.model, digestAfterBytes });
  return byteLen(JSON.stringify(messages)) + (specs.length ? byteLen(JSON.stringify(specs)) : 0);
}

export function estimateTokens(bytes: number, ratio?: number): number {
  return Math.ceil(bytes * (ratio && ratio > 0 ? ratio : DEFAULT_TOKEN_RATIO) * SAFETY);
}

/** Moves the tokens-per-byte estimate toward what the provider actually reported. */
export function calibrateRatio(prev: number | undefined, promptTokens: number, bytes: number): number | undefined {
  if (!(promptTokens > 0) || !(bytes > 0)) return prev;
  const observed = Math.min(1, Math.max(0.05, promptTokens / bytes));
  return prev ? prev * 0.7 + observed * 0.3 : observed;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

function argsPreview(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw || "{}"), (_k, v) => (typeof v === "string" && v.length > 40 ? v.slice(0, 40) + "…" : v));
  } catch {
    return clip(String(raw), 80);
  }
}

function idsFrom(digest: string): string {
  try {
    const ids = JSON.parse(digest)?.ids;
    if (!Array.isArray(ids) || !ids.length) return "";
    return " [" + ids.map((x: any) => (x.uid ? `${x.uid} ` : "") + x.id).join(", ") + "]";
  } catch {
    return "";
  }
}

function linesFor(h: HItem): string[] {
  if (h.kind === "user") return [`- User: ${clip(h.text, 300)}`];
  if (h.kind === "assistant_text") return [`- Assistant: ${clip(h.text, 200)}`];
  const lines = h.text?.trim() ? [`- Assistant: ${clip(h.text, 160)}`] : [];
  for (const c of h.calls) {
    const r = h.results.find((x) => x.callId === c.id);
    if (r && !r.executed) continue;
    const outcome = !r ? "no result" : r.ok ? "ok" : "failed";
    lines.push(`- ${c.function.name}(${clip(argsPreview(c.function.arguments), 120)}) → ${outcome}${r ? `: ${clip(r.summary, 120)}${idsFrom(r.digest)}` : ""}`);
  }
  return lines;
}

function appendProgress(cp: RunCheckpoint, lines: string[]): void {
  if (!lines.length) return;
  const prev = cp.pinned?.progress || "";
  let omitted = 0;
  const kept: string[] = [];
  for (const l of prev.split("\n")) {
    const m = OMITTED_LINE.exec(l);
    if (m) omitted = Number(m[1]);
    else if (l && l !== PROGRESS_HEADER) kept.push(l);
  }
  const all = [...kept, ...lines];
  while (all.length > 1 && byteLen(all.join("\n")) > PROGRESS_MAX_BYTES) {
    all.shift();
    omitted++;
  }
  const head = omitted ? [PROGRESS_HEADER, `- (${omitted} earlier step${omitted === 1 ? "" : "s"} omitted)`] : [PROGRESS_HEADER];
  cp.pinned = { ...cp.pinned, progress: [...head, ...all].join("\n") };
}

function foldItem(cp: RunCheckpoint, h: HItem): void {
  if (h.kind === "user" && !cp.pinned?.goal && h.text.trim()) cp.pinned = { ...cp.pinned, goal: clip(h.text, GOAL_MAX_CHARS) };
  else appendProgress(cp, linesFor(h));
  // The pinned message is what keeps a user message first after the system
  // prompt once older items are gone, so it must never end up empty.
  if (!cp.pinned?.goal?.trim() && !cp.pinned?.progress?.trim()) cp.pinned = { ...cp.pinned, progress: PROGRESS_HEADER };
}

function wireBytes(h: HItem): number {
  if (h.kind !== "exchange") return byteLen(JSON.stringify({ role: h.kind === "user" ? "user" : "assistant", content: h.text }));
  let n = byteLen(JSON.stringify({ role: "assistant", content: h.text, tool_calls: h.calls }));
  for (const r of h.results) n += byteLen(r.full) + 80;
  return n;
}

const pinnedBytes = (cp: RunCheckpoint) => byteLen(cp.pinned?.goal || "") + byteLen(cp.pinned?.progress || "");

/** Mutates `cp`. Never runs while a tool batch is in flight. */
export function compactHistory(cp: RunCheckpoint, o: CompactOpts): CompactionResult {
  const context = providerFor(cp.model).contextTokens;
  const hard = context * o.limits.contextHardLimit;
  const measure = () => estimateTokens(requestBytes(cp, o.system, o.specs, o.limits.digestAfterBytes), cp.tokenRatio);
  const before = measure();
  const threshold = o.aggressive ? 0 : context * o.limits.compactAt;
  if (cp.inflight || before <= threshold) return { changed: false, overLimit: before > hard, beforeTokens: before, afterTokens: before, folded: 0 };

  const target = context * o.limits.compactTo * (o.aggressive ? 0.6 : 1);
  const keep = o.aggressive ? 1 : 2;
  const exchanges = cp.history.flatMap((h, i) => (h.kind === "exchange" ? [i] : []));
  let protectFrom = exchanges.length > keep ? exchanges[exchanges.length - keep] : exchanges.length ? exchanges[0] : cp.history.length;
  protectFrom = Math.min(protectFrom, cp.history.length - 1);

  let changed = false;
  for (let i = 0; i < protectFrom; i++) {
    const h = cp.history[i];
    if (h.kind !== "exchange") continue;
    for (const r of h.results) {
      // A digest carries ids and a flag, so for a tiny result it can be the larger of the two.
      if (byteLen(r.digest) < byteLen(r.full)) {
        r.full = r.digest;
        changed = true;
      }
    }
  }
  let tokens = changed ? measure() : before;

  let folded = 0;
  if (tokens > target && protectFrom > 0) {
    const savedHistory = cp.history.slice();
    const savedPinned = cp.pinned;
    const perByte = (cp.tokenRatio && cp.tokenRatio > 0 ? cp.tokenRatio : DEFAULT_TOKEN_RATIO) * SAFETY;
    let estimate = tokens;
    while (estimate > target && protectFrom > 0) {
      const h = cp.history[0];
      const removed = wireBytes(h);
      const pinnedBefore = pinnedBytes(cp);
      foldItem(cp, h);
      cp.history.shift();
      protectFrom--;
      folded++;
      estimate += Math.ceil((pinnedBytes(cp) - pinnedBefore - removed) * perByte);
    }
    const afterFold = measure();
    if (afterFold < tokens) {
      tokens = afterFold;
      changed = true;
    } else {
      // Folding only short turns can add more summary than it removes; keep the history as it was.
      cp.history = savedHistory;
      if (savedPinned) cp.pinned = savedPinned;
      else delete cp.pinned;
      folded = 0;
    }
  }
  return { changed, overLimit: tokens > hard, beforeTokens: before, afterTokens: tokens, folded };
}
