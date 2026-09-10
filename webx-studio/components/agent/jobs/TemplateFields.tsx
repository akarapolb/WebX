"use client";
// The template picker and parameter fields for background jobs
// (lib/agent/jobs/templates.ts), shared by starting a job
// (TemplateLauncher.tsx) and scheduling one (SchedulesView.tsx).
import { useEffect, useId, useMemo, useState } from "react";
import type { AgentLevel } from "@/lib/agent/types";
import Icon from "../../Icon";
import { useTenant } from "../../TenantProvider";
import { useAgent } from "../AgentProvider";
import { LEVEL_KEY } from "../shared";
import { fill } from "./common";

export type TemplateKey = "bulk_create" | "bulk_translate" | "audit_all" | "custom";
type T = (k: string) => string;

export const TEMPLATE_META: { key: TemplateKey; icon: string; level: AgentLevel; schedulable: boolean }[] = [
  { key: "bulk_create", icon: "doc", level: "draft", schedulable: false },
  { key: "bulk_translate", icon: "split", level: "draft", schedulable: true },
  { key: "audit_all", icon: "shield", level: "read", schedulable: true },
  { key: "custom", icon: "spark", level: "read", schedulable: true },
];
export const LEVEL_RANK: Record<AgentLevel, number> = { off: 0, read: 1, suggest: 2, draft: 3, draft_submit: 4 };
const MAX_CHOICES: Record<"bulk_translate" | "audit_all", number[]> = { bulk_translate: [10, 25, 50, 100, 200], audit_all: [25, 50, 100, 250, 500] };
export const defaultMax = (k: TemplateKey) => (k === "audit_all" ? 100 : 50);

export type FieldValues = {
  contentTypes: string[];
  contentType: string;
  perType: number;
  brief: string;
  submit: boolean;
  targetLocale: "en" | "th";
  q: string;
  updatedSince: string;
  /** Schedules: each run covers only entries changed since the previous run. */
  sinceLastRun: boolean;
  max: number;
  goal: string;
};

export const emptyFields = (): FieldValues => ({
  contentTypes: [], contentType: "", perType: 1, brief: "", submit: false, targetLocale: "en", q: "", updatedSince: "", sinceLastRun: false, max: 50, goal: "",
});

/** Form values from saved parameters (a schedule being edited). */
export function fieldsFromParams(key: TemplateKey, p: Record<string, any> | null | undefined): FieldValues {
  const x = p || {};
  const v = emptyFields();
  if (Array.isArray(x.contentTypes)) v.contentTypes = x.contentTypes;
  if (typeof x.contentType === "string") v.contentType = x.contentType;
  if (x.targetLocale === "en" || x.targetLocale === "th") v.targetLocale = x.targetLocale;
  if (typeof x.q === "string") v.q = x.q;
  if (typeof x.goal === "string") v.goal = x.goal;
  v.max = typeof x.max === "number" ? x.max : defaultMax(key);
  v.sinceLastRun = Boolean(x.sinceLastRun);
  return v;
}

export function paramsFor(key: TemplateKey | "", v: FieldValues, mode: "start" | "schedule"): Record<string, any> | null {
  const since = mode === "schedule" ? { sinceLastRun: v.sinceLastRun } : { updatedSince: v.updatedSince || undefined };
  switch (key) {
    case "bulk_create": return { contentTypes: v.contentTypes, perType: v.perType, brief: v.brief, submit: v.submit };
    case "bulk_translate": return { contentType: v.contentType, targetLocale: v.targetLocale, q: v.q.trim() || undefined, max: v.max, ...since };
    case "audit_all": return { contentTypes: v.contentTypes, max: v.max, ...since };
    case "custom": return { goal: v.goal };
    default: return null;
  }
}

export function fieldsReady(key: TemplateKey | "", v: FieldValues): boolean {
  if (key === "custom") return v.goal.trim().length > 0;
  if (key === "bulk_translate") return Boolean(v.contentType);
  return key !== "" && v.contentTypes.length > 0;
}

/** The content types the agent may work with in this workspace; null while loading. */
export function useJobContentTypes(): { uid: string; label: string }[] | null {
  const { currentKey } = useTenant();
  const agent = useAgent();
  const [types, setTypes] = useState<{ uid: string; label: string }[] | null>(null);
  useEffect(() => {
    if (!currentKey) return;
    let live = true;
    fetch("/api/cms/roles/content-types?tenant=" + encodeURIComponent(currentKey))
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => live && setTypes(Array.isArray(list) ? list : []))
      .catch(() => live && setTypes([]));
    return () => {
      live = false;
    };
  }, [currentKey]);
  const only = agent.policy?.contentTypes;
  return useMemo(() => (types === null ? null : types.filter((x) => !only || only.includes(x.uid))), [types, only]);
}

export function TemplatePicker({ value, onChange, level, label, t, schedulableOnly }: {
  value: TemplateKey | ""; onChange: (k: TemplateKey | "") => void; level: AgentLevel; label: string; t: T; schedulableOnly?: boolean;
}) {
  return (
    <div className="agj-tpls" role="radiogroup" aria-label={label}>
      {TEMPLATE_META.filter((x) => !schedulableOnly || x.schedulable).map((x) => {
        const ok = LEVEL_RANK[level] >= LEVEL_RANK[x.level];
        const needs = fill(t("aj.needsLevel"), { l: t(LEVEL_KEY[x.level]) });
        return (
          <button key={x.key} type="button" role="radio" aria-checked={value === x.key} disabled={!ok}
            className={"agj-tpl" + (value === x.key ? " on" : "")} onClick={() => onChange(value === x.key ? "" : x.key)}
            title={ok ? undefined : needs} data-testid={"agent-job-tpl-" + x.key}>
            <Icon name={x.icon} />
            <b>{t("aj.t_" + x.key)}</b>
            <span>{ok ? t("aj.d_" + x.key) : needs}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The fields for one template, laid out in an .agj-form grid. */
export function TemplateFields({ template, values: v, onChange, types, level, mode, t }: {
  template: TemplateKey; values: FieldValues; onChange: (v: FieldValues) => void;
  types: { uid: string; label: string }[] | null; level: AgentLevel; mode: "start" | "schedule"; t: T;
}) {
  const labelId = useId();
  const set = (patch: Partial<FieldValues>) => onChange({ ...v, ...patch });
  const allowed = types || [];

  return (
    <>
      {(template === "bulk_create" || template === "audit_all") && (
        <div className="agj-field full">
          <span id={labelId}>{t("aj.contentTypes")}</span>
          {types === null ? (
            <span className="agj-note">{t("aj.loading")}</span>
          ) : allowed.length === 0 ? (
            <span className="agj-note">{t("aj.noTypes")}</span>
          ) : (
            <div className="agj-chips" role="group" aria-labelledby={labelId}>
              {allowed.map((x) => {
                const on = v.contentTypes.includes(x.uid);
                return (
                  <button key={x.uid} type="button" className={"agj-chip" + (on ? " on" : "")} aria-pressed={on}
                    onClick={() => set({ contentTypes: on ? v.contentTypes.filter((u) => u !== x.uid) : [...v.contentTypes, x.uid] })}>
                    {x.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {template === "bulk_create" && (
        <>
          <label className="agj-field">
            <span>{t("aj.perType")}</span>
            <select className="agj-in" value={v.perType} onChange={(e) => set({ perType: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="agj-field agj-check">
            <input type="checkbox" checked={v.submit} disabled={LEVEL_RANK[level] < LEVEL_RANK.draft_submit} onChange={(e) => set({ submit: e.target.checked })} />
            <span>{t("aj.submit")}</span>
          </label>
          <label className="agj-field full">
            <span>{t("aj.brief")}</span>
            <textarea className="agj-in" rows={3} maxLength={2000} value={v.brief} placeholder={t("aj.briefPh")} onChange={(e) => set({ brief: e.target.value })} />
          </label>
        </>
      )}

      {template === "bulk_translate" && (
        <>
          <label className="agj-field">
            <span>{t("aj.contentType")}</span>
            <select className="agj-in" value={v.contentType} onChange={(e) => set({ contentType: e.target.value })} data-testid="agent-job-ctype">
              <option value="">{t("aj.pickType")}</option>
              {allowed.map((x) => <option key={x.uid} value={x.uid}>{x.label}</option>)}
            </select>
          </label>
          <label className="agj-field">
            <span>{t("aj.targetLocale")}</span>
            <select className="agj-in" value={v.targetLocale} onChange={(e) => set({ targetLocale: e.target.value as "en" | "th" })}>
              <option value="en">{t("aj.langEn")}</option>
              <option value="th">{t("aj.langTh")}</option>
            </select>
          </label>
          <label className="agj-field full">
            <span>{t("aj.search")}</span>
            <input className="agj-in" type="text" value={v.q} maxLength={200} onChange={(e) => set({ q: e.target.value })} />
          </label>
        </>
      )}

      {(template === "bulk_translate" || template === "audit_all") && (
        <>
          {mode === "schedule" ? (
            <label className="agj-field agj-check">
              <input type="checkbox" checked={v.sinceLastRun} onChange={(e) => set({ sinceLastRun: e.target.checked })} />
              <span>{t("aj.sch_sinceLastRun")}</span>
            </label>
          ) : (
            <label className="agj-field">
              <span>{t("aj.updatedSince")}</span>
              <input className="agj-in" type="date" value={v.updatedSince} onChange={(e) => set({ updatedSince: e.target.value })} />
            </label>
          )}
          <label className="agj-field">
            <span>{t("aj.max")}</span>
            <select className="agj-in" value={v.max} onChange={(e) => set({ max: Number(e.target.value) })}>
              {MAX_CHOICES[template].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </>
      )}

      {template === "custom" && (
        <label className="agj-field full">
          <span>{t("aj.goal")}</span>
          <textarea className="agj-in" rows={4} maxLength={8000} value={v.goal} placeholder={t("aj.goalPh")} onChange={(e) => set({ goal: e.target.value })} data-testid="agent-job-goal" />
        </label>
      )}
    </>
  );
}
