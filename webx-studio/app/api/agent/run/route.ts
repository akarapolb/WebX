// The agent's streaming entry point. Auth/policy/plan-cap checks return
// plain HTTP status codes BEFORE the SSE stream opens (a 403 mid-stream
// would be an awkward, non-standard shape) — only once all three pass does
// this open a text/event-stream response and hand off to runAgent.
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUser, resolveAgentPolicy, checkAgentRunBudget } from "@/lib/cms/governance";
import { CmsError } from "@/lib/cms/types";
import { llmConfigured } from "@/lib/llm";
import { runAgent, type ChatMsg, type RunResult } from "@/lib/agent/runtime";
import { getAgentThread, createAgentThread, appendMessages } from "@/lib/agent/threads";
import type { AgentContextRef, AgentEvent } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

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

const MAX_HISTORY_TURNS = 16;

function priorTextFrom(messages: any[]): ChatMsg[] {
  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content }));
}

function buildPersistMessages(userMessage: string, result: RunResult): any[] {
  const out: any[] = [{ role: "user", content: userMessage }];
  if (result.toolSteps.length) out.push({ role: "tools", steps: result.toolSteps });
  for (const p of result.proposals) out.push({ role: "proposal", proposal: p });
  if (result.finalText) out.push({ role: "assistant", content: result.finalText });
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
  try {
    await checkAgentRunBudget(user);
  } catch (e) {
    return Response.json({ error: e instanceof CmsError ? e.message : "Budget check failed" }, { status: errorStatus(e, 403) });
  }

  const body = await req.json().catch(() => ({} as any));
  const message = typeof body.message === "string" ? body.message.slice(0, 8000) : "";
  if (!message.trim()) return Response.json({ error: "message is required" }, { status: 400 });
  const mode: "docked" | "workspace" = body.mode === "workspace" ? "workspace" : "docked";
  const lang: "en" | "th" = body.lang === "th" ? "th" : "en";
  const ref = normalizeRef(body.context);

  let threadId: string = typeof body.threadId === "string" ? body.threadId : "";
  let existingMessages: any[] = [];
  if (threadId) {
    try {
      const t = await getAgentThread(threadId);
      existingMessages = Array.isArray(t.messages) ? t.messages : [];
    } catch {
      threadId = ""; // stale/unknown/not-owned id — start a fresh thread below rather than 404 the whole run
    }
  }
  if (!threadId) {
    const created = await createAgentThread({ tenantKey: policy.tenantKey, title: message.slice(0, 60), context: ref as any });
    threadId = String(created?.documentId ?? created?.id ?? "");
  }
  const priorText = priorTextFrom(existingMessages);

  const runId = randomUUID();
  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const finalThreadId = threadId;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (e: AgentEvent) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(sseLine(e))); } catch { closed = true; }
      };
      const ping = setInterval(() => { if (!closed) { try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { closed = true; } } }, 15_000);
      try {
        const result = await runAgent(
          { user, policy, runId, threadId: finalThreadId, mode, lang, ref, priorText, message, signal: abort.signal },
          emit
        );
        await appendMessages(finalThreadId, existingMessages, buildPersistMessages(message, result), {
          runState: result.aborted ? "idle" : "done", lastRunId: runId,
          usage: { promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens },
        }).catch(() => {});
        emit({ type: "done", runId, applied: result.applied.length ? result.applied : undefined });
      } catch (e: any) {
        emit({ type: "error", code: "internal", message: e?.message || "Unexpected error" });
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
