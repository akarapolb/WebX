"use client";
// The Schedules tab on /agent: template jobs that start on their own on a
// recurrence (lib/agent/recurrence.ts). Each runs as the person who saved it,
// for 90 days after they last saved it or turned it on; the scheduler's tick
// starts them (lib/agent/jobs/schedules.ts).
import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Recurrence } from "@/lib/agent/recurrence";
import Icon from "../../Icon";
import { useLang } from "../../LangProvider";
import { useAgent } from "../AgentProvider";
import { announceJobsChanged, fill, readError } from "./common";
import {
  defaultMax, emptyFields, fieldsFromParams, fieldsReady, paramsFor, TemplateFields, TemplatePicker, useJobContentTypes,
  type FieldValues, type TemplateKey,
} from "./TemplateFields";

type ScheduleRow = {
  documentId: string; name: string; template: TemplateKey; params?: Record<string, any> | null; lang?: "en" | "th";
  recurrence: Recurrence; enabled: boolean; nextRunAt?: string | null; lastRunAt?: string | null; lastJobId?: string | null;
  consecutiveFailures?: number; lastSkipReason?: string | null; disabledReason?: string | null; ownerEmail: string;
  authorizedUntil?: string | null;
};
type T = (k: string) => string;

const REASONS = new Set(["owner_revoked", "policy_changed", "plan", "reauthorize", "failures", "template", "user"]);
const SKIPS = new Set(["previous_running", "nothing_to_do", "plan_limit"]);
const FREQS: Recurrence["freq"][] = ["daily", "weekly", "monthly"];
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const pad = (n: number) => String(n).padStart(2, "0");
const JSON_HEADERS = { "Content-Type": "application/json" };

function weekdayName(d: number, lang: string): string {
  // 2023-01-01 was a Sunday.
  return new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { weekday: "short", timeZone: "UTC" }).format(Date.UTC(2023, 0, 1 + d));
}

export function describeRecurrence(r: Pick<Recurrence, "freq" | "hour" | "minute" | "byWeekday" | "byMonthDay">, t: T, lang: string): string {
  const time = `${pad(r.hour)}:${pad(r.minute)}`;
  if (r.freq === "weekly") {
    const days = WEEK.filter((d) => r.byWeekday?.includes(d)).map((d) => weekdayName(d, lang)).join(", ");
    return fill(t("aj.sch_rec_weekly"), { days, time });
  }
  if (r.freq === "monthly") return fill(t("aj.sch_rec_monthly"), { day: r.byMonthDay ?? 1, time });
  return fill(t("aj.sch_rec_daily"), { time });
}

function fmtIn(iso: string, tz: string | undefined, lang: string): string {
  try {
    return new Date(iso).toLocaleString(lang === "th" ? "th-TH" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: tz || "Asia/Bangkok" });
  } catch {
    return iso;
  }
}

export default function SchedulesView({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t, lang } = useLang();
  const agent = useAgent();
  const router = useRouter();
  const [rows, setRows] = useState<ScheduleRow[] | null>(null);
  const [editing, setEditing] = useState<ScheduleRow | "new" | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/agent/schedules", { cache: "no-store" });
      if (!r.ok) throw new Error(await readError(r, t("aj.error")));
      const list = await r.json();
      setRows(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setErr(e?.message || t("aj.error"));
      setRows((cur) => cur ?? []);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function request(s: ScheduleRow, what: string, init: RequestInit, path = ""): Promise<any | null> {
    setBusy(s.documentId + what);
    setErr("");
    try {
      const r = await fetch(`/api/agent/schedules/${encodeURIComponent(s.documentId)}${path}`, init);
      if (!r.ok) throw new Error(await readError(r, t("aj.error")));
      return (await r.json().catch(() => ({}))) ?? {};
    } catch (e: any) {
      setErr(e?.message || t("aj.error"));
      return null;
    } finally {
      setBusy("");
    }
  }

  async function toggle(s: ScheduleRow) {
    if (await request(s, "toggle", { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ enabled: !s.enabled }) })) await load();
  }

  async function runNow(s: ScheduleRow) {
    const job = await request(s, "run", { method: "POST" }, "/run");
    if (job?.documentId) {
      announceJobsChanged();
      router.push("/agent/jobs/" + encodeURIComponent(job.documentId));
    }
  }

  async function remove(s: ScheduleRow) {
    if (!window.confirm(t("aj.sch_deleteConfirm"))) return;
    if (await request(s, "delete", { method: "DELETE" })) await load();
  }

  const policy = agent.policy;
  const off = Boolean(policy && (!policy.background || !policy.schedules));

  return (
    <div className="agj" data-testid="agent-schedules">
      {off && (
        <section className="panel agj-off" data-testid="agent-schedules-off">
          <p>{t(policy?.background ? "aj.sch_off" : "aj.off")}</p>
          <p className="agj-note">{t("aj.offHint")}</p>
          {onOpenSettings && <button type="button" className="btn btn--g btn-sm" onClick={onOpenSettings}>{t("aw.tabSettings")}</button>}
        </section>
      )}

      {editing && !off && (
        <ScheduleForm
          key={editing === "new" ? "new" : editing.documentId}
          initial={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}

      <section className="panel">
        <div className="panel-h">
          <h3>{t("aj.sch_title")}</h3>
          {!off && !editing && (
            <button type="button" className="btn btn--p btn-sm" onClick={() => setEditing("new")} data-testid="agent-schedule-new">
              <Icon name="plus" />{t("aj.sch_new")}
            </button>
          )}
        </div>
        <p className="agj-note agj-lead">{t("aj.sch_hint")}</p>
        {err && <p className="agj-err" role="alert">{err}</p>}
        {rows === null ? (
          <p className="agj-note">{t("aj.loading")}</p>
        ) : rows.length === 0 ? (
          <p className="agj-note">{t("aj.sch_empty")}</p>
        ) : (
          <table className="tbl" data-testid="agent-schedules-list">
            <thead>
              <tr><th>{t("aj.sch_name")}</th><th>{t("aj.sch_when")}</th><th>{t("aj.sch_next")}</th><th>{t("aj.sch_last")}</th><th>{t("aj.colState")}</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const note = s.enabled
                  ? s.lastSkipReason && SKIPS.has(s.lastSkipReason) ? "aj.sch_skip_" + s.lastSkipReason : ""
                  : s.disabledReason && REASONS.has(s.disabledReason) ? "aj.sch_why_" + s.disabledReason : "";
                const tz = s.recurrence?.tz;
                return (
                  <tr key={s.documentId} data-testid={"agent-schedule-" + s.documentId}>
                    <td>
                      <div className="agj-row-t">
                        <b>{s.name}</b>
                        <small>{t("aj.t_" + s.template)} · {s.ownerEmail}</small>
                      </div>
                    </td>
                    <td className="agj-cell-sm">{s.recurrence ? describeRecurrence(s.recurrence, t, lang) : "—"}</td>
                    <td className="agj-cell-sm">{s.enabled && s.nextRunAt ? fmtIn(s.nextRunAt, tz, lang) : "—"}</td>
                    <td className="agj-cell-sm">
                      {!s.lastRunAt ? t("aj.sch_never") : s.lastJobId
                        ? <Link href={"/agent/jobs/" + encodeURIComponent(s.lastJobId)}>{fmtIn(s.lastRunAt, tz, lang)}</Link>
                        : fmtIn(s.lastRunAt, tz, lang)}
                    </td>
                    <td>
                      <span className={"agj-st " + (s.enabled ? "ok" : "mute")} data-testid="agent-schedule-state" data-state={s.enabled ? "on" : "off"}>
                        <i aria-hidden="true" />{t(s.enabled ? "aj.sch_on" : "aj.sch_offState")}
                      </span>
                      {note && <small className="agj-sch-note">{t(note)}</small>}
                    </td>
                    <td>
                      <div className="agj-row-actions">
                        {(s.enabled || !off) && (
                          <button type="button" className="btn btn--g btn-sm" onClick={() => toggle(s)} disabled={busy !== ""} data-testid="agent-schedule-toggle">
                            {t(s.enabled ? "aj.sch_turnOff" : "aj.sch_turnOn")}
                          </button>
                        )}
                        {s.enabled && !off && (
                          <button type="button" className="btn btn--g btn-sm" onClick={() => runNow(s)} disabled={busy !== ""} data-testid="agent-schedule-run">
                            {t("aj.sch_runNow")}
                          </button>
                        )}
                        {!off && (
                          <button type="button" className="btn btn--g btn-sm" onClick={() => setEditing(s)} disabled={busy !== "" || Boolean(editing)}>
                            {t("aj.sch_edit")}
                          </button>
                        )}
                        <button type="button" className="btn btn--g btn-sm agj-danger" onClick={() => remove(s)} disabled={busy !== ""}>
                          {t("aj.sch_delete")}
                        </button>
                      </div>
                    </td>
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

function ScheduleForm({ initial, onCancel, onSaved }: { initial: ScheduleRow | null; onCancel: () => void; onSaved: () => void }) {
  const { t, lang } = useLang();
  const agent = useAgent();
  const level = agent.policy?.level ?? "off";
  const types = useJobContentTypes();
  const daysLabel = useId();

  const [name, setName] = useState(initial?.name ?? "");
  const [key, setKey] = useState<TemplateKey | "">(initial?.template ?? "");
  const [values, setValues] = useState<FieldValues>(() => (initial ? fieldsFromParams(initial.template, initial.params) : emptyFields()));
  const [freq, setFreq] = useState<Recurrence["freq"]>(initial?.recurrence.freq ?? "weekly");
  const [days, setDays] = useState<number[]>(initial?.recurrence.byWeekday ?? [1]);
  const [monthDay, setMonthDay] = useState(initial?.recurrence.byMonthDay ?? 1);
  const [hour, setHour] = useState(initial?.recurrence.hour ?? 9);
  const [minute, setMinute] = useState<number>(initial?.recurrence.minute ?? 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const recurrence = {
    freq, hour, minute: minute as Recurrence["minute"], tz: initial?.recurrence.tz ?? "Asia/Bangkok",
    ...(freq === "weekly" ? { byWeekday: days } : {}), ...(freq === "monthly" ? { byMonthDay: monthDay } : {}),
  };
  const ready = name.trim().length > 0 && fieldsReady(key, values) && (freq !== "weekly" || days.length > 0);

  function choose(k: TemplateKey | "") {
    setKey(k);
    if (k) setValues((v) => ({ ...v, max: defaultMax(k) }));
  }

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const body = { name: name.trim(), template: key, params: paramsFor(key, values, "schedule"), recurrence, lang };
      const r = await fetch(initial ? `/api/agent/schedules/${encodeURIComponent(initial.documentId)}` : "/api/agent/schedules", {
        method: initial ? "PUT" : "POST", headers: JSON_HEADERS, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await readError(r, t("aj.error")));
      onSaved();
    } catch (e: any) {
      setErr(e?.message || t("aj.error"));
      setBusy(false);
    }
  }

  return (
    <section className="panel" data-testid="agent-schedule-form">
      <div className="panel-h"><h3>{initial ? initial.name : t("aj.sch_new")}</h3></div>
      <div className="agj-form agj-form-top">
        <label className="agj-field full">
          <span>{t("aj.sch_name")}</span>
          <input className="agj-in" type="text" value={name} maxLength={120} placeholder={t("aj.sch_namePh")} onChange={(e) => setName(e.target.value)} data-testid="agent-schedule-name" />
        </label>

        <div className="agj-field full">
          <span>{t("aj.sch_job")}</span>
          <TemplatePicker value={key} onChange={choose} level={level} label={t("aj.sch_job")} t={t} schedulableOnly />
        </div>
        {key && <TemplateFields template={key} values={values} onChange={setValues} types={types} level={level} mode="schedule" t={t} />}

        <div className="agj-field">
          <span>{t("aj.sch_freq")}</span>
          <div className="seg agj-seg" role="radiogroup" aria-label={t("aj.sch_freq")}>
            {FREQS.map((f) => (
              <button key={f} type="button" role="radio" aria-checked={freq === f} className={freq === f ? "on" : ""} onClick={() => setFreq(f)} data-testid={"agent-schedule-freq-" + f}>
                {t("aj.sch_" + f)}
              </button>
            ))}
          </div>
        </div>
        <div className="agj-field">
          <span>{t("aj.sch_time")}</span>
          <div className="agj-time">
            <select className="agj-in" aria-label={t("aj.sch_hour")} value={hour} onChange={(e) => setHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad(h)}</option>)}
            </select>
            <span aria-hidden="true">:</span>
            <select className="agj-in" aria-label={t("aj.sch_minute")} value={minute} onChange={(e) => setMinute(Number(e.target.value))}>
              {[0, 15, 30, 45].map((m) => <option key={m} value={m}>{pad(m)}</option>)}
            </select>
          </div>
        </div>

        {freq === "weekly" && (
          <div className="agj-field full">
            <span id={daysLabel}>{t("aj.sch_days")}</span>
            <div className="agj-chips" role="group" aria-labelledby={daysLabel}>
              {WEEK.map((d) => {
                const on = days.includes(d);
                return (
                  <button key={d} type="button" className={"agj-chip" + (on ? " on" : "")} aria-pressed={on}
                    onClick={() => setDays((cur) => (on ? cur.filter((x) => x !== d) : [...cur, d]))}>
                    {weekdayName(d, lang)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {freq === "monthly" && (
          <label className="agj-field">
            <span>{t("aj.sch_monthDay")}</span>
            <select className="agj-in" value={monthDay} onChange={(e) => setMonthDay(Number(e.target.value))}>
              {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </label>
        )}

        <p className="agj-note full" data-testid="agent-schedule-summary">{describeRecurrence(recurrence, t, lang)}</p>
        <div className="agj-actions full">
          {err ? <span className="agj-err" role="alert">{err}</span> : <span className="agj-note">{t("aj.sch_authNote")}</span>}
          <button type="button" className="btn btn--g btn-sm" onClick={onCancel} disabled={busy}>{t("aj.sch_cancel")}</button>
          <button type="button" className="btn btn--p btn-sm" onClick={save} disabled={!ready || busy} data-testid="agent-schedule-save">{t("aj.sch_save")}</button>
        </div>
      </div>
    </section>
  );
}
