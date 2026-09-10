"use client";
// The docked chat panel — see design/agent-prototype.html for the visual
// language this ports (namespaced .ag-* in app/globals.css) and the Phase 8
// plan for the interaction contract: propose → apply, visible tool-call
// rows, submit-for-review, never publish. Mounted once by Shell.tsx as a
// permanent flex sibling of .page; AgentProvider (app/(app)/layout.tsx)
// holds all the state this only renders. Message list/proposal/tool-call/
// composer rendering itself lives in shared.tsx — the /agent full-page
// workspace (AgentWorkspace.tsx) reuses the exact same pieces rather than a
// second implementation of the same conversation.
import { useState } from "react";
import Icon from "../Icon";
import { useLang } from "../LangProvider";
import { useAgent } from "./AgentProvider";
import { LEVEL_KEY, REASON_KEY, ContextChip, CapabilitiesPopover, MessageList, Composer } from "./shared";

export default function AgentPanel() {
  const { t } = useLang();
  const agent = useAgent();
  const [popOpen, setPopOpen] = useState(false);

  const policy = agent.policy;
  const showEmpty = policy && policy.level === "off";

  return (
    <>
      <aside className={"ag" + (agent.open ? "" : " closed")} aria-hidden={!agent.open}>
        <div className="ag-h">
          <div className="ag-h-spark"><Icon name="spark" /></div>
          <div className="ag-h-meta"><b>{t("ag.title")}</b><small>{t("ag.subtitle")}</small></div>
          <span className="sp" />
          {policy && policy.level !== "off" && <span className="badge ag-badge-level mono">{t(LEVEL_KEY[policy.level])}</span>}
          {policy && policy.level !== "off" && (
            <div style={{ position: "relative" }}>
              <button className="ic-btn" title={t("ag.capabilities")} onClick={() => setPopOpen((o) => !o)}><Icon name="info" /></button>
              {popOpen && <CapabilitiesPopover policy={policy} t={t} onClose={() => setPopOpen(false)} />}
            </div>
          )}
          <a className="ic-btn" title={t("ag.workspace")} href="/agent" data-testid="agent-open-workspace"><Icon name="expand" /></a>
          <button className="ic-btn" title={t("ag.newChat")} onClick={agent.newThread}><Icon name="plus" /></button>
          <button className="ic-btn" title={t("ag.close")} onClick={agent.close} data-testid="agent-close"><Icon name="close" /></button>
        </div>

        {!policy && <div className="ag-empty muted">{t("ag.loading")}</div>}

        {showEmpty && (
          <div className="ag-empty" data-testid="agent-empty">
            <Icon name="spark" />
            <p>{t(REASON_KEY[policy!.reason || ""] || "ag.emptyGeneric")}</p>
            {policy!.reason === "plan" && <a className="btn btn--g btn-sm" href="/billing">{t("ag.upgrade")}</a>}
          </div>
        )}

        {policy && policy.level !== "off" && (
          <>
            <MessageList t={t} />
            <ContextChip t={t} />
            <Composer t={t} />
          </>
        )}
      </aside>
      {!agent.open && policy && policy.level !== "off" && (
        <button className="ag-fab" onClick={agent.toggle} title={t("ag.toggleTitle")}><Icon name="spark" /><span>{t("ag.toggleTitle")}</span></button>
      )}
    </>
  );
}
