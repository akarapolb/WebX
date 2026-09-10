// The agent's streaming entry point. Auth/policy/plan-cap checks return
// plain HTTP status codes BEFORE the SSE stream opens (a 403 mid-stream
// would be an awkward, non-standard shape) — only once all three pass does
// this open a text/event-stream response and hand off to runAgent.
//
// A run that stops before finishing (one of the engine's resumable stops,
// e.g. its turn limit) leaves a checkpoint on the thread. The next request on
// that thread picks it up: `resume: true` with no message is the Continue
// button, and a new message continues the same work with that message as the
// next user turn.
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUser, resolveAgentPolicy, checkAgentRunBudget } from "@/lib/cms/governance";
import { CmsError } from "@/lib/cms/types";
import { llmConfigured } from "@/lib/llm";
import { runAgent, type ChatMsg, type RunResult } from "@/lib/agent/runtime";
import { getAgentThread, createAgentThread, appendMessages } from "@/lib/agent/threads";
import { fitCheckpoint, parseCheckpoint } from "@/lib/agent/engine/checkpoint";
import type { RunCheckpoint } from "@/lib/agent/engine/types";
import type { AgentContextRef, AgentEvent } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const MAX_HISTORY_TURNS = 16;
const MAX_CHECKPOINT_BYTES = 256 * 1024;

type StoppedEvent = Extract<AgentEvent, { type: "stopped" }>;

function sseLine(e: AgentEvent): string {
  return `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
}

function errorStatus(e: unknown, fallback: number): number {
  return e instanceof CmsError ? (e.status || fallback) : fallback;
}

function normalizeRef(raw: any): AgentContextRef {
  if (raw && typeof raw === "object") {
    if ((raw.kind === "page" || raw.kind === "entry") && raw.uid && raw.docId) {
      return { kind: raw.kind, uid: String(raw.uid), docId: String(raw.docId), locale: raw.locale ? String(raw.locale) : undefined, applyLocally: Boolean(raw.applyLocally) };
    }
    if (raw.kind === "board") return { kind: "board" };
  }
  return { kind: "none" };
}

function priorTextFrom(messages: any[]): ChatMsg[] {
  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content }));
}

function buildPersistMessages(userMessage: string, result: RunResult, resumable: boolean): any[] {
  const out: any[] = [];
  if (userMessage.trim()) out.push({ role: "user", content: userMessage });
  if (result.toolSteps.length) out.push({ role: "tools", steps: result.toolSteps });
  for (const p of result.proposals) out.push({ role: "proposal", proposal: p });
  if (result.plan) out.push({ role: "plan", items: result.plan });
  if (result.finalText) out.push({ role: "assistant", content: result.finalText });
  if (result.question) out.push({ role: "question", question: result.question.question, options: result.question.options });
  if (result.stopMessage) out.push({ role: "stopped", reason: result.stopReason, resumable, message: result.stopMessage });
  return out;
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return Response.json({ error: e instanceof CmsError ? e.message : "Unauthenticated" }, { status: errorStatus(e, 401) });
  }

  if (!llmConfigured()) return Response.json({ error: "AI not configured" }, { status: 503 });

  const policy = await resolveAgentPolicy(user);
  if (policy.level === "off") {
    return Response.json({ error: "The agent is not available in this workspace.", reason: policy.reason || "not_granted" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const resume = body.resume === true;
  const message = typeof body.message === "string" ? body.message.slice(0, 8000) : "";
  if (!resume && !message.trim()) return Response.json({ error: "message is required" }, { status: 400 });
  const mode: "docked" | "workspace" = body.mode === "workspace" ? "workspace" : "docked";
  const lang: "en" | "th" = body.lang === "th" ? "th" : "en";
  const ref = normalizeRef(body.context);

  let threadId: string = typeof body.threadId === "string" ? body.threadId : "";
  if (resume && !threadId) return Response.json({ error: "threadId is required to continue a run" }, { status: 400 });

  // Continue belongs to a run that was already counted; a new message is a new run.
  if (message.trim()) {
    try {
      await checkAgentRunBudget(user);
    } catch (e) {
      return Response.json({ error: e instanceof CmsError ? e.message : "Budget check failed" }, { status: errorStatus(e, 403) });
    }
  }

  let existingMessages: any[] = [];
  let checkpoint: RunCheckpoint | null = null;
  if (threadId) {
    try {
      const t = await getAgentThread(threadId);
      existingMessages = Array.isArray(t.messages) ? t.messages : [];
      checkpoint = parseCheckpoint(t.checkpoint);
    } catch {
      if (resume) return Response.json({ error: "Unknown thread" }, { status: 404 });
      threadId = ""; // stale/unknown/not-owned id — start a fresh thread below rather than 404 the whole run
    }
  }
  if (resume && !checkpoint) return Response.json({ error: "This run can no longer be continued." }, { status: 409 });
  if (!threadId) {
    const created = await createAgentThread({ tenantKey: policy.tenantKey, title: message.slice(0, 60), context: ref as any });
    threadId = String(created?.documentId ?? created?.id ?? "");
  }
  const priorText = priorTextFrom(existingMessages);
  // Only the newest stop notice on a thread can be continued.
  const settledMessages = existingMessages.map((m) => (m?.role === "stopped" && m.resumable ? { ...m, resumable: false } : m));

  const runId = randomUUID();
  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const finalThreadId = threadId;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (e: AgentEvent) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(sseLine(e))); } catch { closed = true; }
      };
      const ping = setInterval(() => { if (!closed) { try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { closed = true; } } }, 15_000);
      // The stop notice waits until the checkpoint is saved, so Continue is only offered when it will work.
      const held: { stop: StoppedEvent | null } = { stop: null };
      const emit = (e: AgentEvent) => {
        if (e.type === "stopped") held.stop = e;
        else send(e);
      };
      try {
        const result = await runAgent(
          { user, policy, runId, threadId: finalThreadId, mode, lang, ref, priorText, message, resume: checkpoint, signal: abort.signal },
          emit
        );
        const saved = result.checkpoint ? fitCheckpoint(result.checkpoint, MAX_CHECKPOINT_BYTES, { stripReasoning: true }) : null;
        const persisted = await appendMessages(finalThreadId, settledMessages, buildPersistMessages(message, result, Boolean(saved)), {
          runState: saved ? "paused" : result.aborted ? "idle" : "done",
          lastRunId: runId,
          usage: { promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens },
          checkpoint: saved,
        }).then(() => true, () => false);
        if (held.stop) send({ ...held.stop, resumable: Boolean(saved) && persisted });
        send({ type: "done", runId, applied: result.applied.length ? result.applied : undefined });
      } catch (e: any) {
        send({ type: "error", code: "internal", message: e?.message || "Unexpected error" });
      } finally {
        clearInterval(ping);
        closed = true;
        try { controller.close(); } catch {}
      }
    },
    cancel() { abort.abort(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
