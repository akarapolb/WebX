"use client";
// The full-page agent workspace (/agent) — Phase 8 Milestone 3. Shares the
// exact same live conversation state as the docked panel (AgentProvider is
// one global provider; MessageList/Composer from shared.tsx are the same
// components) so a run started in the docked panel keeps streaming here if
// the user navigates to this route mid-run, and vice versa. Adds: a thread
// list (past conversations, GET/DELETE /api/agent/threads), a run sidebar
// (autonomy + usage + context), Jobs (templated multi-entry prompts), and
// (admins only) the workspace's own autonomy settings.
import { useEffect, useState, useCallback } from "react";
import Icon from "../Icon";
import { useLang } from "../LangProvider";
import { useTenant } from "../TenantProvider";
import { cms } from "@/lib/cms";
import { useAgent } from "./AgentProvider";
import { LEVEL_KEY, REASON_KEY, CapabilitiesPopover, MessageList, Composer } from "./shared";
import AgentSettings from "./AgentSettings";

type ThreadRow = { id: number; documentId?: string; title?: string; runState?: string; updatedAt?: string; context?: any };

// Bookkeeping types that show up in the raw schema listing (it isn't
// filtered — see governance.ts's own comment on GENERIC_ROUTE_READ_BLOCKED_UIDS)
// but would just error if a job tried to search/translate/audit them
// through the agent's own tools. Same exclusion FieldAccess.tsx's own
// content-type picker already applies, for the identical reason.
const JOB_HIDE = new Set([
  "api::field-policy.field-policy", "api::audit-log.audit-log", "api::page-version.page-version",
  "api::ab-event.ab-event", "api::review.review", "api::release.release", "api::tenant.tenant",
  "api::block-type.block-type", "api::agent-thread.agent-thread", "api::custom-role.custom-role",
  "api::page-template.page-template", "api::consent-log.consent-log", "api::menu-item.menu-item",
]);

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

function JobsPanel({ t }: { t: (k: string) => string }) {
  const agent = useAgent();
  const [types, setTypes] = useState<{ uid: string; name: string }[]>([]);
  const [open, setOpen] = useState<"" | "translate" | "audit">("");
  const [ctype, setCtype] = useState("");
  const [locale, setLocale] = useState("th");

  useEffect(() => {
    cms.schema.listContentTypes()
      .then((list) => setTypes(list.filter((d: any) => !JOB_HIDE.has(d.uid)).map((d: any) => ({ uid: d.uid, name: d.name || d.uid }))))
      .catch(() => {});
  }, []);

  function run() {
    if (!ctype) return;
    const label = types.find((x) => x.uid === ctype)?.name || ctype;
    const msg = open === "translate"
      ? `Job: translate content.\nContent type: ${label} (${ctype}).\nTarget locale: ${locale}.\nFirst list the entries of this type, then translate each one's text fields into ${locale}, then tell me how many you translated and how many failed.`
      : `Job: audit content.\nContent type: ${label} (${ctype}).\nFirst list the entries of this type, then run an accessibility/SEO/freshness/PDPA audit on each one, then summarize the findings grouped by severity.`;
    agent.send(msg);
    setOpen("");
  }

  const disabled = !agent.policy || agent.policy.level === "off" || agent.running;

  return (
    <div className="agw-jobs">
      <div className="agw-side-h">{t("aw.jobs")}</div>
      <div className="agw-job-btns">
        <button className="btn btn--g btn-sm" onClick={() => setOpen(open === "translate" ? "" : "translate")} disabled={disabled}>
          <Icon name="spark" />{t("aw.jobTranslate")}
        </button>
        <button className="btn btn--g btn-sm" onClick={() => setOpen(open === "audit" ? "" : "audit")} disabled={disabled}>
          <Icon name="check" />{t("aw.jobAudit")}
        </button>
      </div>
      {open && (
        <div className="agw-job-form">
          <select className="vb-sel" value={ctype} onChange={(e) => setCtype(e.target.value)}>
            <option value="">{t("aw.jobPickType")}</option>
            {types.map((x) => <option key={x.uid} value={x.uid}>{x.name}</option>)}
          </select>
          {open === "translate" && (
            <select className="vb-sel" value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="th">Thai</option>
              <option value="en">English</option>
            </select>
          )}
          <button className="btn btn--p btn-sm" onClick={run} disabled={!ctype}>{t("aw.jobRun")}</button>
        </div>
      )}
      <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>{t("aw.jobsHint")}</p>
    </div>
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
      <JobsPanel t={t} />
    </aside>
  );
}

export default function AgentWorkspace() {
  const { t, lang } = useLang();
  const { currentKey } = useTenant();
  const agent = useAgent();
  const [tab, setTab] = useState<"chat" | "settings">("chat");
  const policy = agent.policy;
  const showEmpty = policy && policy.level === "off";

  return (
    <div className="agw">
      <div className="vh">
        <div><h1>{t("nav.agent")}</h1><p>{t("aw.sub")}</p></div>
        <div className="agw-tabs seg">
          <button className={tab === "chat" ? "on" : ""} onClick={() => setTab("chat")}><Icon name="msg" />{t("aw.tabChat")}</button>
          <button className={tab === "settings" ? "on" : ""} onClick={() => setTab("settings")}><Icon name="lock" />{t("aw.tabSettings")}</button>
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
