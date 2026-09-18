import { providerFor, sameReasoningTarget } from "./providers";
import { byteLen } from "./toolView";
import type { ExchangeItem, HItem, ImageBlock, ReasoningPayload, RunCheckpoint, RunCounters, RunMode, TextBlock, WireMsg } from "./types";
import type { AgentContextRef } from "../types";

export const CHECKPOINT_VERSION = 1 as const;

export const emptyCounters = (): RunCounters => ({
  turns: 0, toolCalls: 0, promptTokens: 0, completionTokens: 0, protocolRepairs: 0, retries: 0, compactions: 0, ms: 0,
});

export type StartRunInput = {
  runId: string;
  threadId: string;
  jobId?: string;
  mode: RunMode;
  lang: "en" | "th";
  ref: AgentContextRef;
  model: string;
  priorText?: { role: "user" | "assistant"; content: string }[];
  message: string;
  /** A human-pasted image (data URL or http(s) URL) attached to this turn. */
  image?: string;
};

export function startRun(i: StartRunInput): RunCheckpoint {
  const history: HItem[] = [];
  for (const m of i.priorText || []) {
    if (typeof m?.content !== "string" || !m.content.trim()) continue;
    if (m.role === "user") history.push({ kind: "user", text: m.content });
    // A leading assistant turn (trimmed history) would put an assistant message right after system.
    else if (m.role === "assistant" && history.length) history.push({ kind: "assistant_text", text: m.content });
  }
  history.push({ kind: "user", text: i.message, ...(i.image ? { image: i.image } : {}) });
  return {
    v: CHECKPOINT_VERSION,
    runId: i.runId,
    threadId: i.threadId,
    ...(i.jobId ? { jobId: i.jobId } : {}),
    mode: i.mode,
    lang: i.lang,
    ref: i.ref,
    model: i.model,
    history,
    ledger: { applied: [], proposals: [], toolSteps: [] },
    counters: emptyCounters(),
  };
}

export function applyInput(cp: RunCheckpoint, input: { kind: "message" | "answer"; text: string; image?: string }): RunCheckpoint {
  if (cp.inflight) throw new Error("Cannot add input while a tool batch is still in flight");
  const next = structuredClone(cp);
  const text = input.text.trim();
  if (text || input.image) next.history.push({ kind: "user", text, ...(input.image ? { image: input.image } : {}) });
  next.lastStop = undefined;
  delete next.waiting;
  return next;
}

/** A checkpoint from storage, or null when it is missing, malformed or from another engine version. */
export function parseCheckpoint(raw: unknown): RunCheckpoint | null {
  let v: any = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object" || v.v !== CHECKPOINT_VERSION) return null;
  if (typeof v.runId !== "string" || !Array.isArray(v.history) || !v.ledger || !v.counters) return null;
  return { ...v, counters: { ...emptyCounters(), ...v.counters } } as RunCheckpoint;
}

export function buildWireMessages(cp: RunCheckpoint, o: { system: string; targetModel: string; digestAfterBytes: number }): WireMsg[] {
  const out: WireMsg[] = [{ role: "system", content: [{ type: "text", text: o.system, cache_control: { type: "ephemeral" } }] }];

  const pinned = [cp.pinned?.goal, cp.pinned?.progress].filter((s): s is string => Boolean(s && s.trim()));
  if (pinned.length) out.push({ role: "user", content: pinned.join("\n\n") });

  let lastUser = -1;
  cp.history.forEach((h, i) => {
    if (h.kind === "user") lastUser = i;
  });

  const exchanges = cp.history.flatMap((h, i) => (h.kind === "exchange" ? [i] : []));
  let toolBytes = 0;
  for (const i of exchanges) for (const r of (cp.history[i] as ExchangeItem).results) toolBytes += byteLen(r.full);
  const digestBefore = toolBytes > o.digestAfterBytes && exchanges.length > 2 ? exchanges[exchanges.length - 2] : -1;

  const provider = providerFor(o.targetModel);
  const echo = (r: ReasoningPayload | undefined, i: number): Partial<WireMsg> => {
    if (!r || i < lastUser || provider.echo === "none" || !sameReasoningTarget(r.servedBy, o.targetModel)) return {};
    if (provider.echo === "reasoning_content" && r.content) return { reasoning_content: r.content };
    if (provider.echo === "thinking_blocks" && r.thinkingBlocks?.length) return { thinking_blocks: r.thinkingBlocks };
    return {};
  };

  cp.history.forEach((h, i) => {
    if (h.kind === "user") {
      if (h.image) {
        const blocks: (TextBlock | ImageBlock)[] = [{ type: "image_url", image_url: { url: h.image } }];
        if (h.text.trim()) blocks.unshift({ type: "text", text: h.text });
        out.push({ role: "user", content: blocks });
        return;
      }
      const prev = out[out.length - 1];
      if (prev && prev.role === "user" && typeof prev.content === "string") prev.content = `${prev.content}\n\n${h.text}`;
      else out.push({ role: "user", content: h.text });
      return;
    }
    if (h.kind === "assistant_text") {
      if (h.text.trim()) out.push({ role: "assistant", content: h.text, ...echo(h.reasoning, i) });
      return;
    }
    const useDigest = digestBefore >= 0 && i < digestBefore;
    out.push({ role: "assistant", content: h.text, tool_calls: h.calls, ...echo(h.reasoning, i) });
    for (const c of h.calls) {
      const r = h.results.find((x) => x.callId === c.id);
      out.push({
        role: "tool",
        tool_call_id: c.id,
        name: c.function.name,
        content: r ? (useDigest ? r.digest : r.full) : JSON.stringify({ ok: false, summary: "No result was recorded for this call." }),
      });
    }
  });
  return out;
}

/** A copy that fits `maxBytes` when serialized, or null. Older tool results degrade to digests first. */
export function fitCheckpoint(cp: RunCheckpoint, maxBytes: number, o: { stripReasoning?: boolean } = {}): RunCheckpoint | null {
  const c = structuredClone(cp);
  if (o.stripReasoning) {
    for (const h of c.history) if (h.kind !== "user") delete h.reasoning;
  }
  const fits = () => byteLen(JSON.stringify(c)) <= maxBytes;
  if (fits()) return c;
  // A pasted image (a data URL) is typically the single biggest thing in the
  // whole checkpoint — degrade every OLDER one before touching tool results,
  // keeping only the most recent user turn's image (the one still relevant
  // to "what should the model look at right now"). Dropped, not summarized:
  // there's no useful text substitute for a picture the model already
  // responded to.
  let lastImageIdx = -1;
  c.history.forEach((h, i) => { if (h.kind === "user" && h.image) lastImageIdx = i; });
  if (lastImageIdx >= 0) {
    let changed = false;
    c.history.forEach((h, i) => { if (h.kind === "user" && h.image && i !== lastImageIdx) { delete h.image; changed = true; } });
    if (changed && fits()) return c;
  }
  for (const h of c.history) {
    if (h.kind !== "exchange") continue;
    for (const r of h.results) r.full = r.digest;
    if (fits()) return c;
  }
  delete c.stuck;
  c.ledger.proposals = c.ledger.proposals.map((p) => ({ id: p.id, kind: p.kind, target: p.target, title: p.title }));
  c.ledger.toolSteps = c.ledger.toolSteps.slice(-50);
  return fits() ? c : null;
}
