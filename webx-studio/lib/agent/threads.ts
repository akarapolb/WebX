// Thin wrapper around governance.ts's own agent-thread functions (the actual
// Strapi access — see that file's "Agent threads" section for why it has to
// live there). This module only adds the one thing that's genuinely
// lib/agent's own concern: trimming a growing message list before it's
// persisted, so a long-running chat doesn't grow the row without bound.
import "server-only";
import {
  listAgentThreads, getAgentThread, createAgentThread, updateAgentThread, deleteAgentThread, agentThreadView,
  type AgentThreadPatch,
} from "@/lib/cms/governance";

const MAX_MESSAGES = 40;

export function trimMessages(messages: any[]): any[] {
  return messages.length > MAX_MESSAGES ? messages.slice(messages.length - MAX_MESSAGES) : messages;
}

export async function appendMessages(threadId: string, existing: any[], next: any[], patch?: Omit<AgentThreadPatch, "messages">) {
  return updateAgentThread(threadId, { messages: trimMessages([...existing, ...next]), ...patch });
}

export { listAgentThreads, getAgentThread, createAgentThread, updateAgentThread, deleteAgentThread, agentThreadView };
