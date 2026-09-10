"use client";
// The Jobs tab on /agent: start a job from a template, and the jobs in this
// workspace you can see (your own; a workspace administrator sees everyone's).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLang } from "../../LangProvider";
import { useAgent } from "../AgentProvider";
import TemplateLauncher from "./TemplateLauncher";
import { fmtWhen, isActiveJob, JOBS_CHANGED, ProgressBar, readError, StatusPill, type JobRow } from "./common";

export default function JobsView({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t, lang } = useLang();
  const agent = useAgent();
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/agent/jobs", { cache: "no-store" });
      if (!r.ok) throw new Error(await readError(r, t("aj.error")));
      const list = await r.json();
      setJobs(Array.isArray(list) ? list : []);
      setErr("");
    } catch (e: any) {
      setErr(e?.message || t("aj.error"));
      setJobs((cur) => cur ?? []);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Every 3s while a job is queued or running, otherwise every 15s; not while the tab is hidden.
  const active = Boolean(jobs?.some(isActiveJob));
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) void load();
    }, active ? 3_000 : 15_000);
    const onChange = () => void load();
    window.addEventListener(JOBS_CHANGED, onChange);
    return () => {
      clearInterval(id);
      window.removeEventListener(JOBS_CHANGED, onChange);
    };
  }, [active, load]);

  const off = Boolean(agent.policy && !agent.policy.background);

  return (
    <div className="agj" data-testid="agent-jobs">
      {off ? (
        <section className="panel agj-off" data-testid="agent-jobs-off">
          <p>{t("aj.off")}</p>
          <p className="agj-note">{t("aj.offHint")}</p>
          {onOpenSettings && <button type="button" className="btn btn--g btn-sm" onClick={onOpenSettings}>{t("aw.tabSettings")}</button>}
        </section>
      ) : (
        <section className="panel">
          <div className="panel-h"><h3>{t("aj.new")}</h3></div>
          <p className="agj-note agj-lead">{t("aj.newHint")}</p>
          <TemplateLauncher />
        </section>
      )}

      <section className="panel">
        <div className="panel-h">
          <h3>{t("aj.list")}</h3>
          {jobs && jobs.length > 0 && <span className="sub">{jobs.length}</span>}
        </div>
        {err && <p className="agj-err" role="alert">{err}</p>}
        {jobs === null ? (
          <p className="agj-note">{t("aj.loading")}</p>
        ) : jobs.length === 0 ? (
          <p className="agj-note">{t("aj.empty")}</p>
        ) : (
          <table className="tbl" data-testid="agent-jobs-list">
            <thead>
              <tr><th>{t("aj.colJob")}</th><th>{t("aj.colState")}</th><th>{t("aj.colProgress")}</th><th>{t("aj.colOwner")}</th><th>{t("aj.colUpdated")}</th></tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const href = "/agent/jobs/" + encodeURIComponent(j.documentId);
                return (
                  <tr key={j.documentId} className="row" onClick={() => router.push(href)} data-testid={"agent-job-row-" + j.documentId}>
                    <td>
                      <div className="agj-row-t">
                        <Link href={href} onClick={(e) => e.stopPropagation()}>{j.title || t("aj.untitled")}</Link>
                        <small>{t("aj.t_" + (j.template || "custom"))}</small>
                      </div>
                    </td>
                    <td><StatusPill job={j} t={t} /></td>
                    <td><ProgressBar job={j} /></td>
                    <td className="mono agj-cell-sm">{j.ownerEmail}</td>
                    <td className="mono agj-cell-sm">{fmtWhen(j.updatedAt, lang)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
