"use client";
// One background job: its state and controls, checklist, results and
// activity. Polls /api/agent/jobs/:id/events?after=<seq> every 2s while the
// job is queued or running, every 10s while paused, and stops once it ends.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { AgentLevel, PlanItem } from "@/lib/agent/types";
import Icon from "../../Icon";
import { useLang } from "../../LangProvider";
import { LEVEL_KEY } from "../shared";
import {
  announceJobsChanged, fill, fmtNum, fmtTime, fmtWhen, isActiveJob, isFinishedJob, readError, StatusPill,
  type JobEventView, type JobRow,
} from "./common";

type T = (k: string) => string;
type Action = "pause" | "resume" | "cancel" | "answer";

const MAX_EVENTS = 400;
const WHY = new Set(["owner_revoked", "policy_changed", "plan", "stuck_crash", "user", "partial_budget", "partial_stuck", "incomplete"]);

function whyKey(j: JobRow): string | null {
  const k = j.runState === "paused" && j.stateReason !== "needs_input" ? j.stateReason : j.runState === "done" && j.outcome !== "completed" ? j.outcome : null;
  return k && WHY.has(k) ? "aj.why_" + k : null;
}

export default function JobDetail({ id }: { id: string }) {
  const { t, lang } = useLang();
  const [job, setJob] = useState<JobRow | null>(null);
  const [events, setEvents] = useState<JobEventView[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<Action | "">("");
  const [answer, setAnswer] = useState("");
  const after = useRef(0);

  useEffect(() => {
    after.current = 0;
    setEvents([]);
    setJob(null);
  }, [id]);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/agent/jobs/${encodeURIComponent(id)}/events?after=${after.current}`, { cache: "no-store" });
      if (!r.ok) throw new Error(await readError(r, t("aj.error")));
      const j = await r.json();
      const fresh: JobEventView[] = Array.isArray(j.events) ? j.events.filter((e: JobEventView) => Number(e.seq) > after.current) : [];
      if (fresh.length) {
        after.current = Math.max(after.current, ...fresh.map((e) => Number(e.seq) || 0));
        setEvents((prev) => [...prev, ...fresh].slice(-MAX_EVENTS));
      }
      setJob(j.job);
      setErr("");
    } catch (e: any) {
      setErr(e?.message || t("aj.error"));
    }
  }, [id, t]);

  const finished = job ? isFinishedJob(job) : false;
  const running = job ? isActiveJob(job) : true;
  useEffect(() => {
    void poll();
    if (finished) return;
    const timer = setInterval(() => {
      if (!document.hidden) void poll();
    }, running ? 2_000 : 10_000);
    return () => clearInterval(timer);
  }, [poll, finished, running]);

  async function control(action: Action, text?: string) {
    if (action === "cancel" && !window.confirm(t("aj.cancelConfirm"))) return;
    setBusy(action);
    setErr("");
    try {
      const r = await fetch(`/api/agent/jobs/${encodeURIComponent(id)}/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(text ? { answer: text } : {}),
      });
      if (!r.ok) throw new Error(await readError(r, t("aj.error")));
      if (action === "answer") setAnswer("");
      announceJobsChanged();
      await poll();
    } catch (e: any) {
      setErr(e?.message || t("aj.error"));
    } finally {
      setBusy("");
    }
  }

  if (!job) {
    return (
      <div className="agj" data-testid="agent-job-detail">
        <BackLink t={t} />
        <section className="panel">
          {err ? <p className="agj-err" role="alert">{err}</p> : <p className="agj-note">{t("aj.loading")}</p>}
        </section>
      </div>
    );
  }

  const plan = job.progress?.plan ?? null;
  const question = job.runState === "paused" && job.stateReason === "needs_input" ? job.progress?.question ?? null : null;
  const why = whyKey(job);
  const detail = job.runState === "done" && job.stateReason ? job.stateReason : "";
  const canPause = isActiveJob(job) && !job.pauseRequestedAt && !job.cancelRequestedAt;
  const canResume = job.runState === "paused" && job.stateReason !== "needs_input";
  const canCancel = !finished && !job.cancelRequestedAt;
  const pending = !finished && job.runState !== "paused" && (job.cancelRequestedAt ? "aj.cancelling" : job.pauseRequestedAt ? "aj.pausing" : "");

  return (
    <div className="agj" data-testid="agent-job-detail">
      <BackLink t={t} />

      <section className="panel agj-head">
        <div className="agj-head-t">
          <h2>{job.title || t("aj.untitled")}</h2>
          <div className="agj-meta">
            <span>{t("aj.t_" + (job.template || "custom"))}</span>
            <span className="mono">{job.ownerEmail}</span>
            <span>{t("aj.created")} {fmtWhen(job.createdAt, lang)}</span>
          </div>
        </div>
        <div className="agj-actions">
          <StatusPill job={job} t={t} />
          {canPause && <button type="button" className="btn btn--g btn-sm" onClick={() => control("pause")} disabled={busy !== ""} data-testid="agent-job-pause">{t("aj.pause")}</button>}
          {canResume && <button type="button" className="btn btn--p btn-sm" onClick={() => control("resume")} disabled={busy !== ""} data-testid="agent-job-resume">{t("aj.resume")}</button>}
          {canCancel && <button type="button" className="btn btn--g btn-sm agj-danger" onClick={() => control("cancel")} disabled={busy !== ""} data-testid="agent-job-cancel">{t("aj.cancel")}</button>}
        </div>
      </section>

      {pending && <p className="agj-note">{t(pending)}</p>}
      {why && (
        <p className="agj-banner warn" data-testid="agent-job-why">
          {t(why)}
          {detail && <small>{detail}</small>}
        </p>
      )}
      {job.runState === "failed" && job.lastError && <p className="agj-banner bad" role="alert">{job.lastError}</p>}
      {err && <p className="agj-err" role="alert">{err}</p>}

      {question && (
        <section className="agj-q" data-testid="agent-job-question">
          <div className="ag-q-h"><Icon name="msg" />{t("ag.question")}</div>
          <p>{question.question}</p>
          {question.options.length > 0 && (
            <div className="ag-q-opts">
              {question.options.map((o) => (
                <button key={o} type="button" className="btn btn--g btn-sm" onClick={() => control("answer", o)} disabled={busy !== ""}>{o}</button>
              ))}
            </div>
          )}
          <form className="agj-q-row" onSubmit={(e) => { e.preventDefault(); if (answer.trim()) void control("answer", answer.trim()); }}>
            <input className="agj-in" value={answer} maxLength={2000} placeholder={t("aj.answerPh")} aria-label={t("aj.answerPh")} onChange={(e) => setAnswer(e.target.value)} />
            <button type="submit" className="btn btn--p btn-sm" disabled={busy !== "" || !answer.trim()}>{t("aj.answer")}</button>
          </form>
        </section>
      )}

      <div className="agj-detail">
        <div className="agj-main">
          {plan && plan.length > 0 && <Checklist items={plan} t={t} />}
          <Results job={job} t={t} />
          <section className="panel">
            <div className="panel-h"><h3>{t("aj.timeline")}</h3></div>
            <Timeline events={events} t={t} lang={lang} />
          </section>
        </div>
        <aside className="panel agj-side">
          <Stats job={job} t={t} lang={lang} />
        </aside>
      </div>
    </div>
  );
}

function BackLink({ t }: { t: T }) {
  return <Link href="/agent/jobs" className="agj-back"><span aria-hidden="true">←</span>{t("aj.back")}</Link>;
}

function Checklist({ items, t }: { items: PlanItem[]; t: T }) {
  const done = items.filter((i) => i.status === "done").length;
  return (
    <section className="ag-plan agj-plan" data-testid="agent-job-plan">
      <div className="ag-plan-h"><Icon name="check" />{t("ag.plan")}<span className="ag-plan-n">{done}/{items.length}</span></div>
      <div className="ag-plan-bar"><i style={{ width: Math.round((done / items.length) * 100) + "%" }} /></div>
      <ol>
        {items.map((i) => (
          <li key={i.id} className={"ag-plan-i " + i.status} data-status={i.status}>
            <span className="ag-plan-st" aria-hidden="true" />
            <span className="ag-plan-t">
              {i.title}
              <span className="agj-sr"> ({t("ag.planStatus_" + i.status)})</span>
              {i.note ? <small>{i.note}</small> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function EntryLink({ uid, id, t }: { uid: string; id: string; t: T }) {
  return (
    <Link className="btn btn--g btn-sm" href={`/content?type=${encodeURIComponent(uid)}&open=${encodeURIComponent(id)}`}>{t("aj.open")}</Link>
  );
}

function Results({ job, t }: { job: JobRow; t: T }) {
  const r = job.result;
  if (!r) return null;
  const items: any[] = Array.isArray(r.items) ? r.items : [];
  const applied: { uid: string; id: string }[] = Array.isArray(r.applied) ? r.applied : [];
  const withFindings = items.filter((x) => Array.isArray(x.findings) && x.findings.length);
  if (!r.finalText && !items.length && !applied.length) return null;

  return (
    <section className="panel" data-testid="agent-job-results">
      <div className="panel-h"><h3>{t("aj.results")}</h3></div>
      {r.finalText && <div className="agj-report">{r.finalText}</div>}

      {job.template === "audit_all" && items.length > 0 && (
        withFindings.length === 0 ? <p className="agj-note">{t("aj.noFindings")}</p> : (
          <table className="tbl agj-tbl">
            <thead><tr><th>{t("aj.entry")}</th><th>{t("aj.findings")}</th><th /></tr></thead>
            <tbody>
              {withFindings.map((x) => (
                <tr key={x.uid + " " + x.id}>
                  <td><b>{x.title || x.id}</b></td>
                  <td>
                    <ul className="agj-findings">
                      {x.findings.map((f: any, k: number) => (
                        <li key={k}><span className={"agj-sev " + f.severity}>{f.severity}</span> {f.message}</li>
                      ))}
                    </ul>
                  </td>
                  <td><EntryLink uid={x.uid} id={x.id} t={t} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {job.template === "bulk_translate" && items.length > 0 && (
        <table className="tbl agj-tbl">
          <thead><tr><th>{t("aj.entry")}</th><th>{t("aj.outcome")}</th><th /></tr></thead>
          <tbody>
            {items.map((x) => (
              <tr key={x.uid + " " + x.id}>
                <td><b>{x.title || x.id}</b></td>
                <td className={x.ok || x.skipped ? "" : "agj-bad"}>{x.summary}</td>
                <td><EntryLink uid={x.uid} id={x.id} t={t} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {applied.length > 0 && (
        <>
          <div className="agw-side-h agj-sub">{t("aj.written")} · {applied.length}</div>
          <ul className="agj-written" data-testid="agent-job-written">
            {applied.map((a) => (
              <li key={a.uid + " " + a.id}>
                <span className="mono">{a.uid.replace(/^(api::|wp:)/, "")}</span>
                <span className="mono agj-cell-sm">{a.id}</span>
                <EntryLink uid={a.uid} id={a.id} t={t} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

type Row = { seq: number; at: string; tone: "" | "ok" | "bad" | "note" | "text"; label?: string; text: string };

function describe(e: JobEventView, names: Map<string, string>, t: T): Row | null {
  const base = { seq: e.seq, at: e.at };
  switch (e.type) {
    case "tool_result": return { ...base, tone: e.ok ? "ok" : "bad", label: names.get(e.id), text: String(e.summary ?? "") };
    case "text": return e.content ? { ...base, tone: "text", text: String(e.content) } : null;
    case "plan": return { ...base, tone: "note", text: fill(t("aj.ev_plan"), { n: Array.isArray(e.items) ? e.items.length : 0 }) };
    case "plan_item":
      return { ...base, tone: e.status === "done" ? "ok" : e.status === "blocked" ? "bad" : "", text: `${e.id}: ${t("ag.planStatus_" + e.status)}${e.note ? ` (${e.note})` : ""}` };
    case "verification": return { ...base, tone: e.ok ? "ok" : "note", text: fill(t("aj.ev_verify"), { r: String(e.report ?? "") }) };
    case "question": return { ...base, tone: "note", text: fill(t("aj.ev_question"), { q: String(e.question ?? "") }) };
    case "retry": return { ...base, tone: "note", text: t("aj.ev_retry") };
    case "compaction": return { ...base, tone: "", text: t("aj.ev_compaction") };
    case "stopped": return { ...base, tone: "note", text: fill(t("aj.ev_stopped"), { r: String(e.message || e.reason || "") }) };
    case "error": return { ...base, tone: "bad", text: String(e.message ?? "") };
    default: return null;
  }
}

function Timeline({ events, t, lang }: { events: JobEventView[]; t: T; lang: string }) {
  const rows = useMemo(() => {
    const names = new Map<string, string>();
    for (const e of events) if (e.type === "tool_call" && e.id) names.set(e.id, e.name);
    return events.map((e) => describe(e, names, t)).filter((r): r is Row => r !== null);
  }, [events, t]);
  if (!rows.length) return <p className="agj-note">{t("aj.noEvents")}</p>;
  return (
    <ol className="agj-tl" data-testid="agent-job-timeline">
      {rows.map((r) => (
        <li key={r.seq} className={"agj-ev " + r.tone}>
          <time dateTime={r.at}>{fmtTime(r.at, lang)}</time>
          <span className="agj-ev-dot" aria-hidden="true" />
          <span className="agj-ev-tx">{r.label && <code>{r.label}</code>}{r.label ? " " : ""}{r.text}</span>
        </li>
      ))}
    </ol>
  );
}

function Stats({ job, t, lang }: { job: JobRow; t: T; lang: string }) {
  const p = job.progress;
  const rows: [string, string][] = [
    [t("aj.tokens"), job.budget?.maxTokens ? `${fmtNum(job.tokensUsed, lang)} / ${fmtNum(job.budget.maxTokens, lang)}` : fmtNum(job.tokensUsed, lang)],
  ];
  if (p?.turns) rows.push([t("aj.turns"), fmtNum(p.turns, lang)]);
  if (p?.toolCalls) rows.push([t("aj.toolCalls"), fmtNum(p.toolCalls, lang)]);
  if (typeof p?.total === "number") rows.push([t("aj.items"), `${fmtNum(p.done, lang)} / ${fmtNum(p.total, lang)}`]);
  if (job.requiredLevel) rows.push([t("aj.level"), t(LEVEL_KEY[job.requiredLevel as AgentLevel] ?? job.requiredLevel)]);
  if (job.startedAt) rows.push([t("aj.started"), fmtWhen(job.startedAt, lang)]);
  if (job.finishedAt) rows.push([t("aj.finished"), fmtWhen(job.finishedAt, lang)]);
  return (
    <>
      <div className="agw-side-h">{t("aj.stats")}</div>
      <dl className="agj-dl">
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </>
  );
}
