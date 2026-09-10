"use client";
// The full-page agent workspace: /agent (chat), /agent/jobs and
// /agent/jobs/:id (background jobs), and the agent's settings. It shares the
// live conversation with the docked panel (AgentProvider is one global
// provider; MessageList/Composer from shared.tsx are the same components), so
// a run started in the panel keeps streaming here and vice versa.
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "../Icon";
import { useLang } from "../LangProvider";
import { useAgent } from "./AgentProvider";
import { LEVEL_KEY, REASON_KEY, CapabilitiesPopover, MessageList, Composer } from "./shared";
import AgentSettings from "./AgentSettings";
import JobDetail from "./jobs/JobDetail";
import JobsView from "./jobs/JobsView";

type ThreadRow = { id: number; documentId?: string; title?: string; runState?: string; updatedAt?: string; context?: any };
type Tab = "chat" | "jobs" | "settings";

function fmt(iso?: string, lang?: string) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString(lang === "th" ? "th-TH" : "en-GB", { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; }
}

function ThreadList({ t, lang }: { t: (k: string) => string; lang: string }) {
  const agent = useAgent();
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/agent/threads");
      const j = await r.json().catch(() => []);
      setThreads(Array.isArray(j) ? j : []);
    } catch { setThreads([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // A finished run (done event) may have created a brand-new thread — pick
  // that up in the list without the user having to manually refresh.
  useEffect(() => { if (!agent.running) load(); }, [agent.running, load]);

  async function remove(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await fetch("/api/agent/threads/" + encodeURIComponent(id), { method: "DELETE" });
      if (agent.threadId === id) agent.newThread();
      await load();
    } catch {}
  }

  return (
    <aside className="agw-threads">
      <button className="btn btn--p agw-new" onClick={agent.newThread} data-testid="agent-workspace-new">
        <Icon name="plus" />{t("ag.newChat")}
      </button>
      <div className="agw-thread-list">
        {loading && <div className="muted" style={{ padding: 12, fontSize: 12.5 }}>{t("ag.loading")}</div>}
        {!loading && threads.length === 0 && <div className="muted" style={{ padding: 12, fontSize: 12.5 }}>{t("aw.noThreads")}</div>}
        {threads.map((th) => {
          const id = String(th.documentId ?? th.id);
          const on = agent.threadId === id;
          return (
            <button key={id} className={"agw-thread" + (on ? " on" : "")} onClick={() => agent.loadThread(id)} data-testid={"agent-thread-" + id}>
              <span className="agw-thread-t">{th.title || t("aw.untitled")}</span>
              <span className="agw-thread-m mono">{fmt(th.updatedAt, lang)}</span>
              <button className="agw-thread-del" title={t("aw.delete")} onClick={(e) => remove(id, e)}><Icon name="trash" /></button>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function RunSidebar({ t }: { t: (k: string) => string }) {
  const agent = useAgent();
  const [popOpen, setPopOpen] = useState(false);
  const policy = agent.policy;
  const ref = agent.ref;
  const ctxLabel =
    ref.kind === "entry" ? t("ag.contextEntry") + " · " + ref.uid.replace(/^(api::|wp:)/, "") :
    ref.kind === "page" ? "Page · " + ref.uid.replace(/^(api::|wp:)/, "") :
    ref.kind === "board" ? t("ag.contextBoard") : t("aw.noContext");

  return (
    <aside className="agw-side">
      {policy && policy.level !== "off" && (
        <div className="agw-side-block">
          <div className="agw-side-h">{t("aw.autonomy")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="badge ag-badge-level mono">{t(LEVEL_KEY[policy.level])}</span>
            <div style={{ position: "relative" }}>
              <button className="ic-btn" title={t("ag.capabilities")} onClick={() => setPopOpen((o) => !o)}><Icon name="info" /></button>
              {popOpen && <CapabilitiesPopover policy={policy} t={t} onClose={() => setPopOpen(false)} />}
            </div>
          </div>
        </div>
      )}
      <div className="agw-side-block">
        <div className="agw-side-h">{t("aw.context")}</div>
        <span className="ctx mono">{ctxLabel}</span>
      </div>
      {(agent.usage.promptTokens + agent.usage.completionTokens) > 0 && (
        <div className="agw-side-block">
          <div className="agw-side-h">{t("aw.usage")}</div>
          <span className="mono" style={{ fontSize: 12.5 }}>{agent.usage.promptTokens + agent.usage.completionTokens} tok ({agent.usage.promptTokens} in / {agent.usage.completionTokens} out)</span>
        </div>
      )}
      {policy?.background && (
        <div className="agw-side-block">
          <div className="agw-side-h">{t("aw.tabJobs")}</div>
          <p className="agj-note" style={{ marginBottom: 10 }}>{t("aj.newHint")}</p>
          <Link className="btn btn--g btn-sm" href="/agent/jobs"><Icon name="plus" />{t("aj.new")}</Link>
        </div>
      )}
    </aside>
  );
}

export default function AgentWorkspace({ view = "chat", jobId }: { view?: "chat" | "jobs"; jobId?: string }) {
  const { t, lang } = useLang();
  const agent = useAgent();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(view);
  useEffect(() => { setTab(view); }, [view, jobId]);
  const policy = agent.policy;
  const showEmpty = policy && policy.level === "off";

  // Chat and Jobs are routes (a job's page has its own URL); Settings is a tab on either.
  function openTab(next: Tab) {
    if (next === "settings" || (next === view && !(next === "jobs" && jobId))) {
      setTab(next);
      return;
    }
    router.push(next === "jobs" ? "/agent/jobs" : "/agent");
  }

  return (
    <div className="agw">
      <div className="vh">
        <div><h1>{t("nav.agent")}</h1><p>{t("aw.sub")}</p></div>
        <div className="agw-tabs seg">
          <button className={tab === "chat" ? "on" : ""} aria-pressed={tab === "chat"} onClick={() => openTab("chat")} data-testid="agent-tab-chat"><Icon name="msg" />{t("aw.tabChat")}</button>
          <button className={tab === "jobs" ? "on" : ""} aria-pressed={tab === "jobs"} onClick={() => openTab("jobs")} data-testid="agent-tab-jobs"><Icon name="activity" />{t("aw.tabJobs")}</button>
          <button className={tab === "settings" ? "on" : ""} aria-pressed={tab === "settings"} onClick={() => openTab("settings")}><Icon name="lock" />{t("aw.tabSettings")}</button>
        </div>
      </div>

      {tab === "settings" ? (
        <AgentSettings />
      ) : !policy ? (
        <div className="panel"><span className="muted">{t("ag.loading")}</span></div>
      ) : showEmpty ? (
        <div className="panel" style={{ textAlign: "center", padding: 40 }} data-testid="agent-workspace-empty">
          <Icon name="spark" />
          <p>{t(REASON_KEY[policy.reason || ""] || "ag.emptyGeneric")}</p>
          {policy.reason === "plan" && <a className="btn btn--g btn-sm" href="/billing">{t("ag.upgrade")}</a>}
          {policy.reason === "not_granted" && <button className="btn btn--g btn-sm" onClick={() => setTab("settings")}>{t("aw.tabSettings")}</button>}
        </div>
      ) : tab === "jobs" ? (
        jobId ? <JobDetail id={jobId} /> : <JobsView onOpenSettings={() => setTab("settings")} />
      ) : (
        <div className="agw-body">
          <ThreadList t={t} lang={lang} />
          <div className="agw-conv">
            <MessageList t={t} className="agw-msgs" />
            <Composer t={t} />
          </div>
          <RunSidebar t={t} />
        </div>
      )}
    </div>
  );
}
