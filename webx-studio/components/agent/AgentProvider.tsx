"use client";
// Global docked-agent state — mounted once in app/(app)/layout.tsx, between
// TenantProvider and Shell (Shell renders the actual <AgentPanel/>). Holds:
// open/closed state (persisted, localStorage["webx_agent_open"]), the
// resolved autonomy policy for the current tenant, the single active
// editor's context registration (EntryEditor/VisualBuilder/ReviewBoard call
// useAgentContext — see that hook — while mounted), and the SSE run itself
// (useAgentRun). Only one editor can plausibly be "open" at a time in this
// app's UI (EntryEditor is a modal drawer; the Builder is a whole route), so
// a single registration slot — not a stack — is enough.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTenant } from "../TenantProvider";
import { useLang } from "../LangProvider";
import { useAgentRun, chatMsgsFromThread, type ChatMsg } from "./useAgentRun";
import type { AgentContextRef, AgentLevel, AgentProposal, PublishMode } from "@/lib/agent/types";

export type AgentPolicy = {
  level: AgentLevel;
  tools?: string[];
  contentTypes?: string[];
  model?: string;
  local?: boolean;
  reason?: "disabled" | "unscoped" | "plan" | "not_granted";
  /** Background jobs are on for this workspace and its plan includes them. */
  background?: boolean;
  /** Schedules are on too, and the plan includes them. */
  schedules?: boolean;
};

/** What an open editor exposes to the panel — a write handler per proposal
 * kind it knows how to apply, plus a way to reload its own data after the
 * agent writes something for real (done.applied). Every field is optional:
 * ReviewBoard registers a context ref with no handlers at all (read-only). */
export type EditorHandlers = {
  applyFieldPatch?: (key: string, value: any) => void;
  applyProposal?: (p: AgentProposal) => { undo?: () => void } | void;
  refresh?: () => void;
};

type Registration = { ref: AgentContextRef; handlers: EditorHandlers };

/** Whether an open editor's own ref is the exact same document a proposal
 * targets — the only case Apply is allowed to act on (a proposal for entry
 * A must never be applied to whatever entry B happens to be open now).
 * Exported so AgentPanel can disable Apply proactively instead of only
 * discovering the mismatch after a click. */
export function targetMatches(p: AgentProposal, ref: AgentContextRef): boolean {
  if (ref.kind !== "entry" && ref.kind !== "page") return false;
  const r = ref as { uid: string; docId: string };
  return r.uid === p.target.uid && r.docId === p.target.id;
}

type Ctx = {
  open: boolean;
  toggle: () => void;
  close: () => void;
  /** Opens the panel and optionally pre-fills (and, with autosend, sends)
   * the composer — the entry point for "Ask the agent" call sites elsewhere
   * in the app (e.g. the Builder's old single-block AI generator). */
  openWith: (opts: { prompt?: string; autosend?: boolean }) => void;
  policy: AgentPolicy | null;
  ref: AgentContextRef;
  threadId: string | null;
  messages: ChatMsg[];
  running: boolean;
  usage: { promptTokens: number; completionTokens: number };
  send: (text: string, image?: { dataUrl: string; mimeType: string }, file?: { name: string; text: string }) => void;
  /** "review": the agent drafts and a person approves and publishes (buttons under its reply). "auto": it publishes too.
   * Auto needs the top autonomy level; below that this is always "review". */
  publishMode: PublishMode;
  setPublishMode: (m: PublishMode) => void;
  /** Whether this user can choose auto at all (the policy's level is the top one). */
  canAuto: boolean;
  /** The chat models the AI gateway serves, the one this user picked (""= the default), and the name a run will really use. */
  models: { alias: string; model: string; provider: string }[];
  defaultModel: string;
  chosenModel: string;
  setChosenModel: (m: string) => void;
  /** Whether the user may pick: the workspace has not fixed a model and the gateway serves more than one. */
  canChooseModel: boolean;
  effectiveModel: string;
  /** Continues the thread's stopped run from the checkpoint the server saved for it. */
  resume: () => void;
  abort: () => void;
  newThread: () => void;
  /** Loads a past thread's own persisted messages into the current live
   * conversation (replacing it) — the /agent workspace's thread list uses
   * this; the docked panel never needs to (it always starts a fresh
   * conversation via newThread, per the plan's own docked-panel scope). */
  loadThread: (id: string) => Promise<void>;
  setProposalStatus: (id: string, status: "applied" | "undone" | "stale") => void;
  /** Applies a proposal through whichever editor is currently registered
   * (if any), only when its ref matches the proposal's own target exactly
   * and the resolved level still permits a write. Returns the editor's own
   * undo callback on success — AgentPanel is the one place that needs to
   * hold onto it (for the ProposalCard's own Undo button), so it isn't
   * threaded through Ctx/state itself. */
  applyProposal: (p: AgentProposal) => { ok: boolean; reason?: "readOnly" | "notOpen"; undo?: () => void };
  register: (ref: AgentContextRef, handlers: EditorHandlers) => () => void;
  draftPrompt: string;
  setDraftPrompt: (v: string) => void;
  autosendPending: boolean;
  consumeAutosend: () => void;
};

const AgentCtx = createContext<Ctx | null>(null);

/** Throws outside a provider — use this from code that only ever renders
 * inside app/(app) (the panel itself, its own sub-components). */
export const useAgent = () => {
  const c = useContext(AgentCtx);
  if (!c) throw new Error("useAgent() called outside <AgentProvider>");
  return c;
};

/** Returns null instead of throwing — for call sites shared with contexts
 * that may not have an AgentProvider mounted (VisualBuilder/EntryEditor are
 * only ever rendered inside app/(app), but staying defensive here costs
 * nothing and matches this codebase's existing "never crash the host page
 * over an optional feature" convention). */
export const useAgentOptional = () => useContext(AgentCtx);

const STORAGE_OPEN = "webx_agent_open";
const STORAGE_MODE = "webx_agent_publish_mode";
const STORAGE_MODEL = "webx_agent_model";

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const { currentKey } = useTenant();
  const { lang } = useLang();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [policy, setPolicy] = useState<AgentPolicy | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [autosendPending, setAutosendPending] = useState(false);
  const [modeChoice, setModeChoice] = useState<PublishMode>("review");
  const [gateway, setGateway] = useState<{ models: { alias: string; model: string; provider: string }[]; defaultModel: string }>({ models: [], defaultModel: "" });
  const [modelPick, setModelPick] = useState("");
  const registrationRef = useRef<Registration | null>(null);
  const [, bumpRegistration] = useState(0);

  useEffect(() => {
    try { setOpen(localStorage.getItem(STORAGE_OPEN) === "1"); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_OPEN, open ? "1" : "0"); } catch {}
  }, [open]);
  useEffect(() => {
    try { if (localStorage.getItem(STORAGE_MODE) === "auto") setModeChoice("auto"); } catch {}
  }, []);
  useEffect(() => {
    try { setModelPick(localStorage.getItem(STORAGE_MODEL) || ""); } catch {}
    let live = true;
    fetch("/api/ai/models").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (live && j) setGateway({ models: (j.models || []).filter((m: any) => m.kind === "chat"), defaultModel: j.defaultModel || "" });
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  const setChosenModel = useCallback((m: string) => {
    setModelPick(m);
    try { if (m) localStorage.setItem(STORAGE_MODEL, m); else localStorage.removeItem(STORAGE_MODEL); } catch {}
  }, []);
  const setPublishMode = useCallback((m: PublishMode) => {
    setModeChoice(m);
    try { localStorage.setItem(STORAGE_MODE, m); } catch {}
  }, []);
  // Auto mode is for the top autonomy level only; a lower level (or no policy yet) always runs in review mode.
  const canAuto = policy?.level === "draft_submit";
  const publishMode: PublishMode = canAuto && modeChoice === "auto" ? "auto" : "review";
  // A model the workspace has fixed wins; otherwise the user's pick, if the gateway still serves it; otherwise the default.
  const canChooseModel = !policy?.model && gateway.models.length > 1;
  const chosenModel = gateway.models.some((m) => m.alias === modelPick) ? modelPick : "";
  const effectiveModel = policy?.model || (canChooseModel && chosenModel) || gateway.defaultModel;

  // The full-page workspace (Milestone 3) IS the agent — the docked panel
  // would be redundant chrome on top of itself there.
  const suppressed = Boolean(pathname?.startsWith("/agent"));

  const handleDone = useCallback((applied: { uid: string; id: string }[] | undefined, tid: string) => {
    if (tid) setThreadId(tid);
    if (applied?.length) registrationRef.current?.handlers.refresh?.();
  }, []);
  const run = useAgentRun(handleDone);

  // Tenant switch: the previous tenant's policy/thread/in-flight run must
  // not leak into the new one.
  useEffect(() => {
    let cancelled = false;
    run.abort();
    run.reset();
    setThreadId(null);
    if (!currentKey) { setPolicy(null); return; }
    // /api/agent/status resolves the CURRENT USER's own runtime policy
    // (governance.ts's resolveAgentPolicy — level/tools/contentTypes/model
    // + `reason`) — distinct from GET /api/agent/policy?tenant=, which is
    // the admin SETTINGS screen's own endpoint (getAgentPolicy, admin-only,
    // no `reason` field) and isn't what a non-admin editor's panel should
    // be calling at all.
    fetch("/api/agent/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setPolicy(j || null); })
      .catch(() => { if (!cancelled) setPolicy(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        if (!suppressed) setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [suppressed]);

  const register = useCallback((ref: AgentContextRef, handlers: EditorHandlers) => {
    const reg: Registration = { ref, handlers };
    registrationRef.current = reg;
    bumpRegistration((n) => n + 1);
    return () => {
      if (registrationRef.current === reg) {
        registrationRef.current = null;
        bumpRegistration((n) => n + 1);
      }
    };
  }, []);

  const ref: AgentContextRef = registrationRef.current?.ref ?? { kind: "none" };

  // The /agent workspace gets the longer 600s wall-clock budget
  // (app/api/agent/run's BUDGET_MS_BY_MODE), the docked panel the 90s one —
  // derived from the route rather than threaded through every send() call
  // site, since "which surface is this" is exactly what `suppressed`
  // already answers.
  const send = useCallback((text: string, image?: { dataUrl: string; mimeType: string }, file?: { name: string; text: string }) => {
    const t = text.trim();
    if ((!t && !image && !file) || run.running || !policy || policy.level === "off") return;
    run.send({ message: t, image, file, publishMode, model: canChooseModel ? chosenModel || undefined : undefined, mode: suppressed ? "workspace" : "docked", lang, context: ref, threadId });
  }, [run, lang, ref, threadId, policy, suppressed, publishMode, canChooseModel, chosenModel]);

  const resume = useCallback(() => {
    if (run.running || !threadId || !policy || policy.level === "off") return;
    run.send({ message: "", resume: true, publishMode, model: canChooseModel ? chosenModel || undefined : undefined, mode: suppressed ? "workspace" : "docked", lang, context: ref, threadId });
  }, [run, lang, ref, threadId, policy, suppressed, publishMode, canChooseModel, chosenModel]);

  const loadThread = useCallback(async (id: string) => {
    run.abort();
    try {
      const r = await fetch("/api/agent/threads/" + encodeURIComponent(id));
      if (!r.ok) return;
      const t = await r.json();
      run.setMessages(chatMsgsFromThread(Array.isArray(t?.messages) ? t.messages : [], Boolean(t?.resumable)));
      setThreadId(id);
    } catch { /* leave the current conversation as-is on failure */ }
  }, [run]);

  const setProposalStatus = useCallback((id: string, status: "applied" | "undone" | "stale") => {
    run.setMessages((m) => m.map((x) => (x.kind === "proposal" && x.id === id ? { ...x, status } : x)));
  }, [run]);

  const applyProposal = useCallback((p: AgentProposal): { ok: boolean; reason?: "readOnly" | "notOpen"; undo?: () => void } => {
    if (!policy || policy.level === "off" || policy.level === "read") return { ok: false, reason: "readOnly" };
    const reg = registrationRef.current;
    if (!reg || !reg.handlers.applyProposal || !targetMatches(p, reg.ref)) return { ok: false, reason: "notOpen" };
    const result = reg.handlers.applyProposal(p);
    return { ok: true, undo: result && "undo" in result ? result.undo : undefined };
  }, [policy]);

  const openWith = useCallback((opts: { prompt?: string; autosend?: boolean }) => {
    setOpen(true);
    if (opts.prompt) setDraftPrompt(opts.prompt);
    if (opts.autosend) setAutosendPending(true);
  }, []);
  const consumeAutosend = useCallback(() => setAutosendPending(false), []);

  const newThread = useCallback(() => {
    run.abort();
    run.reset();
    setThreadId(null);
  }, [run]);

  const value: Ctx = {
    open: open && !suppressed, toggle: () => setOpen((o) => !o), close: () => setOpen(false), openWith,
    policy, ref, threadId, messages: run.messages, running: run.running, usage: run.usage,
    send, publishMode, setPublishMode, canAuto,
    models: gateway.models, defaultModel: gateway.defaultModel, chosenModel, setChosenModel, canChooseModel, effectiveModel, resume, abort: run.abort, newThread, loadThread, setProposalStatus, applyProposal, register,
    draftPrompt, setDraftPrompt, autosendPending, consumeAutosend,
  };

  return <AgentCtx.Provider value={value}>{children}</AgentCtx.Provider>;
}
