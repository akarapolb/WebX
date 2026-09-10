import "server-only";
import { chat } from "@/lib/llm";
import { withAgentActor } from "@/lib/cms/governance";
import { executeTool, toolIsWrite, toolSpecs } from "../tools";
import { systemPrompt } from "../prompts";
import type { AgentEvent, AgentRunContext } from "../types";
import type { EngineClock, EngineDeps } from "./types";

export const realClock: EngineClock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(signal.reason ?? new Error("aborted"));
      }, { once: true });
    }),
};

export function serverDeps(ctx: AgentRunContext, emit: (e: AgentEvent) => void, extra: Partial<EngineDeps> = {}): EngineDeps {
  return {
    chat,
    clock: realClock,
    emit,
    systemPrompt: () => systemPrompt(ctx),
    tools: {
      specs: () => toolSpecs(ctx),
      isWrite: toolIsWrite,
      execute: (call) => withAgentActor(ctx.runId, () => executeTool(ctx, call.function.name, call.function.arguments)),
    },
    ...extra,
  };
}
