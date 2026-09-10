"use client";
import { useEffect } from "react";
import { useAgentOptional, type EditorHandlers } from "./AgentProvider";
import type { AgentContextRef } from "@/lib/agent/types";

/** Registers the calling editor's context ref + write handlers with the
 * docked agent panel for as long as it's mounted with these `deps` —
 * unregisters on unmount or whenever `deps` changes (same contract as
 * useEffect's own dependency array; pass the primitive fields the ref is
 * built from, e.g. [uid, docId, locale], not the ref object itself, since a
 * fresh object literal every render would otherwise re-register on every
 * render for no reason).
 *
 * Safe to call with `ref: null` (nothing to register yet — e.g. while an
 * entry is still loading) and safe to call outside an AgentProvider (a
 * no-op via useAgentOptional()). */
export function useAgentContext(ref: AgentContextRef | null, handlers: EditorHandlers, deps: React.DependencyList) {
  const agent = useAgentOptional();
  useEffect(() => {
    if (!agent || !ref) return undefined;
    return agent.register(ref, handlers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
