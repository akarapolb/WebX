"use client";
// Consumes the SSE stream from POST /api/agent/run (see that route and
// lib/agent/runtime.ts for the exact event shapes) and reduces it into a
// renderable message list. No token streaming in v1 (per the approved plan)
// — `text` events arrive as one complete string, so there's no partial-token
// buffering to do here, only per-turn tool-call/tool-result/proposal/error
// events to fold into the right message.
import { useCallback, useRef, useState } from "react";
import type { AgentContextRef, AgentProposal } from "@/lib/agent/types";

export type ToolStep = { id: string; name: string; ok?: boolean; summary?: string; pending: boolean };
export type ChatMsg =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string }
  | { kind: "tools"; id: string; steps: ToolStep[] }
  | { kind: "proposal"; id: string; proposal: AgentProposal; status: "pending" | "applied" | "undone" | "stale" }
  | { kind: "error"; id: string; text: string };

type SendOpts = {
  message: string;
  mode: "docked" | "workspace";
  lang: "en" | "th";
  context: AgentContextRef;
  threadId: string | null;
};

let seq = 0;
const nid = () => "m" + Date.now().toString(36) + (seq++).toString(36);

/** Converts a persisted thread's own stored `messages` (app/api/agent/run's
 * buildPersistMessages shape — plain {role,content}/{role:"tools",steps}/
 * {role:"proposal",proposal} rows, NOT this file's own ChatMsg union) back
 * into renderable ChatMsg[] for AgentProvider.loadThread. Loaded proposals
 * are marked "pending" rather than replaying an unknowable applied/undone
 * history (buildPersistMessages never stored status) — Apply re-validates
 * the target + level at click time regardless, so this stays safe even if
 * the underlying entry has since changed or closed. */
export function chatMsgsFromThread(rows: any[]): ChatMsg[] {
  const out: ChatMsg[] = [];
  rows.forEach((r, i) => {
    const id = "h" + i;
    if (!r || typeof r !== "object") return;
    if (r.role === "user" && typeof r.content === "string") out.push({ kind: "user", id, text: r.content });
    else if (r.role === "assistant" && typeof r.content === "string") out.push({ kind: "assistant", id, text: r.content });
    else if (r.role === "tools" && Array.isArray(r.steps)) {
      out.push({ kind: "tools", id, steps: r.steps.map((s: any, j: number) => ({ id: id + "-" + j, name: s?.name || "", ok: s?.ok, summary: s?.summary, pending: false })) });
    } else if (r.role === "proposal" && r.proposal) {
      out.push({ kind: "proposal", id, proposal: r.proposal, status: "pending" });
    }
  });
  return out;
}

/** Splits a text/event-stream body into {event,data} records. Handles
 * chunk boundaries landing mid-event (buffers across reads) and ignores
 * SSE comment lines (route.ts's own 15s ": ping" keepalive). */
async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: any }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (!raw || raw.startsWith(":")) continue; // keepalive comment
        let event = "message";
        let data = "";
        for (const line of raw.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (!data) continue;
        try { yield { event, data: JSON.parse(data) }; } catch { /* malformed line — skip rather than crash the stream */ }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

export function useAgentRun(onDone: (applied: { uid: string; id: string }[] | undefined, threadId: string) => void) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [running, setRunning] = useState(false);
  const [usage, setUsage] = useState({ promptTokens: 0, completionTokens: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const toolsMsgId = useRef<string | null>(null);

  const reset = useCallback(() => {
    setMessages([]);
    setUsage({ promptTokens: 0, completionTokens: 0 });
    toolsMsgId.current = null;
  }, []);

  const send = useCallback(async (opts: SendOpts) => {
    setMessages((m) => [...m, { kind: "user", id: nid(), text: opts.message }]);
    setRunning(true);
    toolsMsgId.current = null;
    const ac = new AbortController();
    abortRef.current = ac;
    let returnedThreadId = opts.threadId || "";
    let appliedList: { uid: string; id: string }[] | undefined;

    try {
      const r = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: opts.message, mode: opts.mode, lang: opts.lang,
          context: opts.context, threadId: opts.threadId || undefined,
        }),
        signal: ac.signal,
      });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => null as any);
        setMessages((m) => [...m, { kind: "error", id: nid(), text: j?.error || ("Request failed (HTTP " + r.status + ")") }]);
        return;
      }
      for await (const evt of parseSSE(r.body)) {
        const d = evt.data;
        switch (d.type) {
          case "run_started":
            if (d.threadId) returnedThreadId = d.threadId;
            break;
          case "tool_call": {
            const step: ToolStep = { id: d.id, name: d.name, pending: true };
            // The id must be settled and the ref mutated HERE, outside the
            // setMessages updater — an updater function must be pure (React
            // 18 StrictMode double-invokes it in dev to enforce exactly
            // this), and mutating toolsMsgId.current from inside one is not
            // pure: found live via e2e/tests/agent-panel.spec.ts under
            // `next dev` (StrictMode on) — the double-invoke's first call
            // added the tools message and set the ref; its second call then
            // saw the ref already set and tried to update an existing
            // message that, from that call's own (pre-first-call) snapshot
            // of `m`, doesn't exist yet — a silent no-op that dropped the
            // tools message from the committed state entirely.
            if (!toolsMsgId.current) toolsMsgId.current = nid();
            const gid = toolsMsgId.current;
            setMessages((m) => {
              const idx = m.findIndex((x) => x.kind === "tools" && x.id === gid);
              if (idx === -1) return [...m, { kind: "tools", id: gid, steps: [step] }];
              return m.map((x, i) => (i === idx ? { ...x, steps: [...(x as Extract<ChatMsg, { kind: "tools" }>).steps, step] } : x));
            });
            break;
          }
          case "tool_result": {
            const gid = toolsMsgId.current;
            setMessages((m) => m.map((x) => (x.kind === "tools" && x.id === gid
              ? { ...x, steps: x.steps.map((s) => (s.id === d.id ? { ...s, ok: d.ok, summary: d.summary, pending: false } : s)) }
              : x)));
            break;
          }
          case "proposal":
            setMessages((m) => [...m, { kind: "proposal", id: nid(), proposal: d.proposal, status: "pending" }]);
            break;
          case "text":
            toolsMsgId.current = null;
            if (d.content) setMessages((m) => [...m, { kind: "assistant", id: nid(), text: d.content }]);
            break;
          case "usage":
            setUsage({ promptTokens: d.promptTokens || 0, completionTokens: d.completionTokens || 0 });
            break;
          case "error":
            toolsMsgId.current = null;
            setMessages((m) => [...m, { kind: "error", id: nid(), text: d.message || "Something went wrong." }]);
            break;
          case "done":
            appliedList = d.applied;
            break;
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setMessages((m) => [...m, { kind: "error", id: nid(), text: "Connection lost before the agent finished." }]);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
      onDone(appliedList, returnedThreadId);
    }
  }, [onDone]);

  const abort = useCallback(() => { abortRef.current?.abort(); }, []);

  return { messages, setMessages, running, usage, send, abort, reset };
}
