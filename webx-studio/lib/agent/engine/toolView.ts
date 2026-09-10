import type { SliceLimits, ToolOutcome, ToolResultRec } from "./types";

const encoder = new TextEncoder();
export const byteLen = (s: string): number => encoder.encode(s).length;

const PRIORITY_KEYS = ["ok", "id", "documentId", "uid", "title", "name", "summary", "error", "status"];
const rank = (k: string) => {
  const i = PRIORITY_KEYS.indexOf(k);
  return i === -1 ? PRIORITY_KEYS.length : i;
};

function safeStringify(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    return s === undefined ? "null" : s;
  } catch {
    return JSON.stringify("[unserializable]");
  }
}

type ShrinkOpts = { str: number; arr: number; depth: number };

function shrink(v: unknown, o: ShrinkOpts, depth = 0): unknown {
  if (typeof v === "string") return v.length > o.str ? `${v.slice(0, o.str)}…[+${v.length - o.str} chars]` : v;
  if (v === null || typeof v !== "object") return v;
  if (depth >= o.depth) return Array.isArray(v) ? `[${v.length} items]` : "{…}";
  if (Array.isArray(v)) {
    const kept: unknown[] = v.slice(0, o.arr).map((x) => shrink(x, o, depth + 1));
    if (v.length > o.arr) kept.push({ _omitted: v.length - o.arr });
    return kept;
  }
  const entries = Object.entries(v as Record<string, unknown>).sort(([a], [b]) => rank(a) - rank(b));
  const out: Record<string, unknown> = {};
  for (const [k, x] of entries) out[k] = shrink(x, o, depth + 1);
  return out;
}

/** JSON for `value` that is always valid and at most `maxBytes` (UTF-8). */
export function boundedJson(value: unknown, maxBytes: number): string {
  const whole = safeStringify(value);
  if (byteLen(whole) <= maxBytes) return whole;
  let o: ShrinkOpts = { str: 2000, arr: 40, depth: 6 };
  for (let i = 0; i < 14; i++) {
    const s = safeStringify(shrink(value, o));
    if (byteLen(s) <= maxBytes) return s;
    o = { str: Math.max(24, Math.floor(o.str / 2)), arr: Math.max(2, Math.floor(o.arr / 2)), depth: Math.max(1, o.depth - (i % 2)) };
  }
  let n = Math.max(0, maxBytes - 40);
  for (;;) {
    const s = safeStringify({ _truncated: true, preview: whole.slice(0, n) });
    if (byteLen(s) <= maxBytes || n === 0) return byteLen(s) <= maxBytes ? s : '{"_truncated":true}';
    n = Math.floor(n * 0.75);
  }
}

export type IdRef = { uid?: string; id: string; title?: string };

/** Entry ids found in a tool result, so they survive when the result is digested. */
export function extractIds(data: unknown, limit = 20): IdRef[] {
  const out: IdRef[] = [];
  const seen = new Set<string>();
  const walk = (v: unknown, depth: number, uid?: string) => {
    if (out.length >= limit || depth > 3 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1, uid);
      return;
    }
    const o = v as Record<string, unknown>;
    const u = typeof o.uid === "string" ? o.uid : uid;
    const id = o.documentId ?? o.id ?? o.reviewId;
    if ((typeof id === "string" && id) || typeof id === "number") {
      const key = `${u || ""}:${id}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ ...(u ? { uid: u } : {}), id: String(id), ...(typeof o.title === "string" ? { title: o.title.slice(0, 60) } : {}) });
      }
    }
    for (const x of Object.values(o)) if (x && typeof x === "object") walk(x, depth + 1, u);
  };
  walk(data, 0);
  return out;
}

export function toolResultRecord(
  callId: string,
  name: string,
  outcome: ToolOutcome,
  executed: boolean,
  limits: Pick<SliceLimits, "toolFullBytes" | "toolDigestBytes">,
): ToolResultRec {
  const payload: Record<string, unknown> = { ok: outcome.ok, summary: outcome.summary };
  if (outcome.proposal) payload.proposal = { id: outcome.proposal.id, kind: outcome.proposal.kind };
  else if (outcome.data !== undefined) payload.data = outcome.data;
  const full = boundedJson(payload, limits.toolFullBytes);
  const digest = boundedJson(
    {
      ok: outcome.ok,
      summary: outcome.summary.slice(0, 160),
      ids: extractIds(outcome.data),
      ...(outcome.proposal ? { proposal: outcome.proposal.id } : {}),
      digest: true,
    },
    limits.toolDigestBytes,
  );
  return { callId, name, ok: outcome.ok, summary: outcome.summary, full, digest, executed };
}
