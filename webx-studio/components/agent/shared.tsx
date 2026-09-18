"use client";
// Pieces shared between the docked panel (AgentPanel.tsx) and the full-page
// workspace (AgentWorkspace.tsx) — both read the SAME AgentProvider state
// (one active run, one active thread; "An in-flight run started in the
// panel keeps streaming here" per the Phase 8 plan), so the message list,
// tool-call/proposal rendering, and composer are one implementation each,
// not two that could drift.
import { useEffect, useRef, useState } from "react";
import Icon from "../Icon";
import { useAgent, targetMatches, type AgentPolicy } from "./AgentProvider";
import ContinueInBackground from "./jobs/ContinueInBackground";
import type { ChatMsg } from "./useAgentRun";
import type { AgentLevel } from "@/lib/agent/types";

export const LEVEL_KEY: Record<AgentLevel, string> = {
  off: "ag.levelOff", read: "ag.levelRead", suggest: "ag.levelSuggest",
  draft: "ag.levelDraft", draft_submit: "ag.levelDraft_submit",
};
export const REASON_KEY: Record<string, string> = {
  plan: "ag.emptyPlan", not_granted: "ag.emptyNotGranted", disabled: "ag.emptyDisabled", unscoped: "ag.emptyUnscoped",
};

export function ToolsGroup({ steps, t }: { steps: Extract<ChatMsg, { kind: "tools" }>["steps"]; t: (k: string) => string }) {
  const done = steps.every((s) => !s.pending);
  return (
    <div className="ag-tools">
      <div className={"ag-tools-h" + (done ? " done" : "")}>
        {!done && <i className="ag-spin" />}
        <span className="mono">{done ? t("ag.toolsUsed") : t("ag.toolsWorking")}</span>
      </div>
      <ul>
        {steps.map((s) => (
          <li key={s.id} className={s.pending ? "" : s.ok ? "ok" : "bad"}>
            <span className="ag-tool-st" />
            <span className="mono">{s.name}</span>
            {!s.pending && s.summary && <span className="ag-tool-n">{s.summary}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProposalCard({ msg, t }: { msg: Extract<ChatMsg, { kind: "proposal" }>; t: (k: string) => string }) {
  const agent = useAgent();
  const undoRef = useRef<(() => void) | null>(null);
  const p = msg.proposal;
  const canTarget = targetMatches(p, agent.ref);
  const readOnly = !agent.policy || agent.policy.level === "off" || agent.policy.level === "read";
  const reason = readOnly ? "ag.readOnlyCannotApply" : !canTarget ? "ag.openToApply" : "";

  function apply() {
    const r = agent.applyProposal(p);
    if (r.ok) {
      undoRef.current = r.undo || null;
      agent.setProposalStatus(msg.id, "applied");
    }
  }
  function undo() {
    undoRef.current?.();
    agent.setProposalStatus(msg.id, "undone");
  }

  const fieldEntries = p.kind === "fields" && p.fields ? Object.entries(p.fields) : [];

  return (
    <div className="ag-card">
      <div className="ag-card-h">
        <Icon name="spark" />
        <span>{p.title}</span>
        <span className="badge ag-badge-acc">{p.kind}</span>
      </div>
      {fieldEntries.length > 0 && (
        <ul>
          {fieldEntries.map(([k, v]) => (
            <li key={k}>
              <span className="ag-card-k mono">{k}</span>
              <span className="ag-card-v">{String(v).slice(0, 220)}</span>
            </li>
          ))}
        </ul>
      )}
      {p.summary && <div className="ag-card-summary">{p.summary}</div>}
      <div className="ag-card-f">
        {msg.status === "pending" && (
          <>
            <button className="btn btn--p btn-sm" onClick={apply} disabled={readOnly || !canTarget}>{t("ag.apply")}</button>
            <button className="btn btn--g btn-sm" onClick={() => agent.setProposalStatus(msg.id, "undone")}>{t("ag.dismiss")}</button>
            {reason && <span className="ag-card-reason">{t(reason)}</span>}
          </>
        )}
        {msg.status === "applied" && (
          <>
            <span className="badge ag-badge-ok"><Icon name="check" />{t("ag.applied")}</span>
            {undoRef.current && <button className="btn btn--g btn-sm" onClick={undo}>{t("ag.undoBtn")}</button>}
          </>
        )}
        {msg.status === "undone" && <span className="badge">{t("ag.undone")}</span>}
      </div>
    </div>
  );
}

export function ContextChip({ t }: { t: (k: string) => string }) {
  const { ref } = useAgent();
  if (ref.kind === "entry") return <div className="ag-ctx"><span className="ctx"><Icon name="doc" />{t("ag.contextEntry")} · {ref.uid.replace(/^(api::|wp:)/, "")}</span></div>;
  if (ref.kind === "board") return <div className="ag-ctx"><span className="ctx"><Icon name="check" />{t("ag.contextBoard")}</span></div>;
  return null;
}

export function CapabilitiesPopover({ policy, t, onClose }: { policy: AgentPolicy; t: (k: string) => string; onClose: () => void }) {
  const lv = policy.level;
  const has = (min: AgentLevel) => {
    const rank: Record<AgentLevel, number> = { off: 0, read: 1, suggest: 2, draft: 3, draft_submit: 4 };
    return rank[lv] >= rank[min];
  };
  return (
    <div className="ag-pop" onMouseLeave={onClose}>
      <h4>{t("ag.capYes")}</h4>
      <ul>
        {has("read") && <li className="ok"><span className="ag-pop-dot" />{t("ag.canRead")}</li>}
        {has("suggest") && <li className="ok"><span className="ag-pop-dot" />{t("ag.canPropose")}</li>}
        {has("draft") && <li className="ok"><span className="ag-pop-dot" />{t("ag.canDraft")}</li>}
        {has("draft_submit") && <li className="ok"><span className="ag-pop-dot" />{t("ag.canSubmit")}</li>}
      </ul>
      <h4>{t("ag.capNo")}</h4>
      <ul>
        <li className="no"><span className="ag-pop-dot" />{t("ag.cannotPublish")}</li>
        <li className="no"><span className="ag-pop-dot" />{t("ag.cannotPerms")}</li>
      </ul>
      <div className="ag-pop-ft">{t("ag.footNote")}</div>
    </div>
  );
}

/** The model's checklist, updated in place as it marks items. */
export function PlanCard({ msg, t }: { msg: Extract<ChatMsg, { kind: "plan" }>; t: (k: string) => string }) {
  const done = msg.items.filter((i) => i.status === "done").length;
  const pct = msg.items.length ? Math.round((done / msg.items.length) * 100) : 0;
  return (
    <div className="ag-plan" data-testid="agent-plan">
      <div className="ag-plan-h">
        <Icon name="check" />
        <span>{t("ag.plan")}</span>
        <span className="ag-plan-n mono">{done}/{msg.items.length}</span>
      </div>
      <div className="ag-plan-bar" aria-hidden><i style={{ width: pct + "%" }} /></div>
      <ol>
        {msg.items.map((it) => (
          <li key={it.id} className={"ag-plan-i " + it.status} data-status={it.status}>
            <span className="ag-plan-st" role="img" aria-label={t("ag.planStatus_" + it.status)} />
            <span className="ag-plan-t">
              {it.title}
              {(it.result || it.note) && <small>{it.result || it.note}</small>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A question the run is waiting on. An option button sends that option as the answer. */
export function QuestionCard({ msg, t }: { msg: Extract<ChatMsg, { kind: "question" }>; t: (k: string) => string }) {
  const agent = useAgent();
  return (
    <div className="ag-q" data-testid="agent-question">
      <div className="ag-q-h"><Icon name="info" /><span>{t("ag.question")}</span></div>
      <p>{msg.question}</p>
      {msg.options.length > 0 && (
        <div className="ag-q-opts">
          {msg.options.map((o) => (
            <button key={o} className="btn btn--g btn-sm" disabled={msg.answered || agent.running} onClick={() => agent.send(o)}>{o}</button>
          ))}
        </div>
      )}
      {!msg.answered && <div className="ag-q-hint muted">{t("ag.answerHint")}</div>}
    </div>
  );
}

/** A run that ended before finishing. The newest one on a thread can be
 * continued from the checkpoint the server saved for it. */
export function StoppedNotice({ msg, t }: { msg: Extract<ChatMsg, { kind: "stopped" }>; t: (k: string) => string }) {
  const agent = useAgent();
  return (
    <div className="ag-stop" data-testid="agent-stopped">
      <Icon name="stop" />
      <span className="ag-stop-tx">{msg.text}</span>
      {msg.resumable && (
        <>
          <button className="btn btn--p btn-sm" onClick={agent.resume} disabled={agent.running} data-testid="agent-continue">{t("ag.continue")}</button>
          <ContinueInBackground />
        </>
      )}
    </div>
  );
}

/** The scrolling message list — identical rendering whichever surface hosts
 * it, driven entirely by AgentProvider's own `messages`/`running` state. */
export function MessageList({ t, className }: { t: (k: string) => string; className?: string }) {
  const agent = useAgent();
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [agent.messages, agent.running]);

  return (
    <div className={className || "ag-body"} ref={bodyRef}>
      {agent.messages.map((m) => {
        if (m.kind === "user") return (
          <div className="ag-msg user" key={m.id}>
            {m.image && <img className="ag-msg-img" src={m.image} alt="" />}
            {!m.image && m.hadImage && <div className="ag-msg-hadimg mono"><Icon name="img" />{t("ag.hadImage")}</div>}
            {m.text && <div className="ag-msg-tx">{m.text}</div>}
          </div>
        );
        if (m.kind === "assistant") return (
          <div className="ag-msg" key={m.id}>
            <div className="ag-msg-av"><Icon name="spark" /></div>
            <div className="ag-msg-tx">{m.text}</div>
          </div>
        );
        if (m.kind === "tools") return <ToolsGroup key={m.id} steps={m.steps} t={t} />;
        if (m.kind === "proposal") return <ProposalCard key={m.id} msg={m} t={t} />;
        if (m.kind === "stopped") return <StoppedNotice key={m.id} msg={m} t={t} />;
        if (m.kind === "plan") return <PlanCard key={m.id} msg={m} t={t} />;
        if (m.kind === "question") return <QuestionCard key={m.id} msg={m} t={t} />;
        if (m.kind === "error") return <div className="ag-msg" key={m.id}><div className="ag-msg-av bad"><Icon name="close" /></div><div className="ag-msg-tx ag-err">{m.text}</div></div>;
        return null;
      })}
      {agent.running && !agent.messages.some((m) => m.kind === "tools") && (
        <div className="ag-msg"><div className="ag-msg-av"><Icon name="spark" /></div><div className="ag-msg-tx muted">{t("ag.thinking")}</div></div>
      )}
    </div>
  );
}

/** The message input — Enter to send (⇧Enter for a newline, IME-composition
 * safe), Send/Stop toggling with `agent.running`, auto-growing height. Reads
 * `draftPrompt`/`autosendPending` off AgentProvider so "Ask the agent" call
 * sites elsewhere (Toolbox's old .vb-ai generator) can prefill + autosend
 * regardless of which surface (docked panel or /agent workspace) is
 * mounted when that happens. */
const MAX_ATTACH_BYTES = 4_000_000; // pre-base64 file size cap — a data URL runs ~33% larger again

export function Composer({ t }: { t: (k: string) => string }) {
  const agent = useAgent();
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ dataUrl: string; mimeType: string } | null>(null);
  const [attachError, setAttachError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const composing = useRef(false);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the exact same file next time
    if (!f) return;
    setAttachError("");
    if (!f.type.startsWith("image/")) { setAttachError(t("ag.attachBadType")); return; }
    if (f.size > MAX_ATTACH_BYTES) { setAttachError(t("ag.attachTooBig")); return; }
    const reader = new FileReader();
    reader.onload = () => setImage({ dataUrl: String(reader.result || ""), mimeType: f.type });
    reader.onerror = () => setAttachError(t("ag.attachTooBig"));
    reader.readAsDataURL(f);
  }

  // Prefill + autosend are applied in ONE effect, off `draftPrompt` itself.
  // They used to be two: the second one gated on `text.trim()`, but
  // openWith() sets draftPrompt and autosendPending in the same render, so
  // that effect read `text` from a closure where setText() hadn't landed yet
  // ("" → never sent), and `[autosendPending]` alone never changed again to
  // re-run it. Net effect: the Builder's own "Ask the agent" button prefilled
  // the composer and then silently did nothing (found live). Reading the
  // prompt straight off draftPrompt sidesteps the stale-state race entirely.
  useEffect(() => {
    const p = agent.draftPrompt;
    if (!p) return;
    agent.setDraftPrompt("");
    if (agent.autosendPending) {
      agent.consumeAutosend();
      if (p.trim()) { setText(""); agent.send(p); return; }
    }
    setText(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.draftPrompt]);

  const policy = agent.policy;
  const disabled = !policy || policy.level === "off";

  function submit() {
    const v = text.trim();
    if ((!v && !image) || agent.running) return;
    setText("");
    const img = image;
    setImage(null);
    agent.send(v, img || undefined);
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !composing.current) { e.preventDefault(); submit(); }
  }
  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }

  return (
    <>
      {image && (
        <div className="ag-attach">
          <img src={image.dataUrl} alt="" />
          <button className="ag-attach-rm" onClick={() => setImage(null)} title={t("ag.attachRemove")} data-testid="agent-attach-remove"><Icon name="close" /></button>
        </div>
      )}
      {attachError && <div className="ag-hint ag-err mono">{attachError}</div>}
      <div className="ag-comp">
        <textarea
          rows={1} value={text} placeholder={t("ag.placeholder")}
          disabled={disabled}
          onChange={(e) => { setText(e.target.value); autoGrow(e.currentTarget); }}
          onKeyDown={onKeyDown}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={() => (composing.current = false)}
          data-testid="agent-composer"
        />
        <div className="ag-comp-row">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} data-testid="agent-attach-input" />
          <button className="ag-attach-btn" onClick={() => fileRef.current?.click()} disabled={disabled || agent.running} title={t("ag.attachImage")} data-testid="agent-attach-button"><Icon name="img" /></button>
          <span className="sp" />
          <span className="ag-model mono">{policy?.model || "Claude"}</span>
          {agent.running
            ? <button className="ag-send" onClick={agent.abort} title={t("ag.stop")} data-testid="agent-stop"><Icon name="stop" /></button>
            : <button className="ag-send" onClick={submit} disabled={(!text.trim() && !image) || disabled} title={t("ag.send")} data-testid="agent-send"><Icon name="up" /></button>}
        </div>
      </div>
      <div className="ag-hint mono"><span>{t("ag.hintSend")}</span><span>{t("ag.hintDraft")}</span></div>
    </>
  );
}
