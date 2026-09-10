"use client";
// Starting a background job from a template (lib/agent/jobs/templates.ts):
// pick a template, fill in its form, preview what it will do, then start it.
// Bulk templates must be previewed first; that preview is the confirmation.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AgentLevel } from "@/lib/agent/types";
import Icon from "../../Icon";
import { useLang } from "../../LangProvider";
import { useTenant } from "../../TenantProvider";
import { useAgent } from "../AgentProvider";
import { LEVEL_KEY } from "../shared";
import { announceJobsChanged, fill, fmtNum, readError } from "./common";

type Key = "bulk_create" | "bulk_translate" | "audit_all" | "custom";
type Preview = {
  template: Key; title: string; requiredLevel: AgentLevel; count: number;
  items: { title: string; detail?: string }[]; estimatedTokens: number | null; tokenBudget: number;
};

const TEMPLATES: { key: Key; icon: string; level: AgentLevel }[] = [
  { key: "bulk_create", icon: "doc", level: "draft" },
  { key: "bulk_translate", icon: "split", level: "draft" },
  { key: "audit_all", icon: "shield", level: "read" },
  { key: "custom", icon: "spark", level: "read" },
];
const RANK: Record<AgentLevel, number> = { off: 0, read: 1, suggest: 2, draft: 3, draft_submit: 4 };
const MAX_CHOICES: Record<"bulk_translate" | "audit_all", number[]> = { bulk_translate: [10, 25, 50, 100, 200], audit_all: [25, 50, 100, 250, 500] };

export default function TemplateLauncher() {
  const { t, lang } = useLang();
  const { currentKey } = useTenant();
  const agent = useAgent();
  const router = useRouter();
  const level = agent.policy?.level ?? "off";

  const [key, setKey] = useState<Key | "">("");
  const [types, setTypes] = useState<{ uid: string; label: string }[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [ctype, setCtype] = useState("");
  const [perType, setPerType] = useState(1);
  const [brief, setBrief] = useState("");
  const [submit, setSubmit] = useState(false);
  const [target, setTarget] = useState<"en" | "th">("en");
  const [q, setQ] = useState("");
  const [since, setSince] = useState("");
  const [max, setMax] = useState(50);
  const [goal, setGoal] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "start">("");
  const [err, setErr] = useState("");

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

  const allowed = useMemo(() => {
    const only = agent.policy?.contentTypes;
    return (types || []).filter((x) => !only || only.includes(x.uid));
  }, [types, agent.policy?.contentTypes]);

  const params = useMemo(() => {
    switch (key) {
      case "bulk_create": return { contentTypes: picked, perType, brief, submit };
      case "bulk_translate": return { contentType: ctype, targetLocale: target, q: q.trim() || undefined, updatedSince: since || undefined, max };
      case "audit_all": return { contentTypes: picked, updatedSince: since || undefined, max };
      case "custom": return { goal };
      default: return null;
    }
  }, [key, picked, perType, brief, submit, ctype, target, q, since, max, goal]);

  // Any change makes an earlier preview stale.
  useEffect(() => {
    setPreview(null);
    setErr("");
  }, [params]);

  const ready = key === "custom" ? goal.trim().length > 0 : key === "bulk_translate" ? Boolean(ctype) : picked.length > 0;
  const needsPreview = key !== "" && key !== "custom";
  const previewEmpty = Boolean(preview && preview.template !== "bulk_create" && !preview.count);

  function choose(k: Key) {
    setKey((cur) => (cur === k ? "" : k));
    if (k === "audit_all") setMax(100);
    if (k === "bulk_translate") setMax(50);
  }

  async function post(path: string) {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: key, params, lang }) });
    if (!r.ok) throw new Error(await readError(r, t("aj.error")));
    return r.json();
  }

  async function runPreview() {
    setBusy("preview");
    setErr("");
    try {
      setPreview(await post("/api/agent/jobs/preview"));
    } catch (e: any) {
      setErr(e?.message || t("aj.error"));
    } finally {
      setBusy("");
    }
  }

  async function start() {
    setBusy("start");
    setErr("");
    try {
      const job = await post("/api/agent/jobs");
      announceJobsChanged();
      router.push("/agent/jobs/" + encodeURIComponent(job.documentId));
    } catch (e: any) {
      setErr(e?.message || t("aj.error"));
      setBusy("");
    }
  }

  const typePicker = (
    <div className="agj-field full">
      <span id="agj-types-l">{t("aj.contentTypes")}</span>
      {types === null ? (
        <span className="agj-note">{t("aj.loading")}</span>
      ) : allowed.length === 0 ? (
        <span className="agj-note">{t("aj.noTypes")}</span>
      ) : (
        <div className="agj-chips" role="group" aria-labelledby="agj-types-l">
          {allowed.map((x) => {
            const on = picked.includes(x.uid);
            return (
              <button key={x.uid} type="button" className={"agj-chip" + (on ? " on" : "")} aria-pressed={on}
                onClick={() => setPicked((p) => (on ? p.filter((u) => u !== x.uid) : [...p, x.uid]))}>
                {x.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="agj-launch">
      <div className="agj-tpls" role="radiogroup" aria-label={t("aj.new")}>
        {TEMPLATES.map((x) => {
          const ok = RANK[level] >= RANK[x.level];
          return (
            <button key={x.key} type="button" role="radio" aria-checked={key === x.key} disabled={!ok}
              className={"agj-tpl" + (key === x.key ? " on" : "")} onClick={() => choose(x.key)}
              title={ok ? undefined : fill(t("aj.needsLevel"), { l: t(LEVEL_KEY[x.level]) })} data-testid={"agent-job-tpl-" + x.key}>
              <Icon name={x.icon} />
              <b>{t("aj.t_" + x.key)}</b>
              <span>{ok ? t("aj.d_" + x.key) : fill(t("aj.needsLevel"), { l: t(LEVEL_KEY[x.level]) })}</span>
            </button>
          );
        })}
      </div>

      {key && (
        <div className="agj-form" data-testid="agent-job-form">
          {(key === "bulk_create" || key === "audit_all") && typePicker}

          {key === "bulk_create" && (
            <>
              <label className="agj-field">
                <span>{t("aj.perType")}</span>
                <select className="agj-in" value={perType} onChange={(e) => setPerType(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="agj-field agj-check">
                <input type="checkbox" checked={submit} disabled={RANK[level] < RANK.draft_submit} onChange={(e) => setSubmit(e.target.checked)} />
                <span>{t("aj.submit")}</span>
              </label>
              <label className="agj-field full">
                <span>{t("aj.brief")}</span>
                <textarea className="agj-in" rows={3} maxLength={2000} value={brief} placeholder={t("aj.briefPh")} onChange={(e) => setBrief(e.target.value)} />
              </label>
            </>
          )}

          {key === "bulk_translate" && (
            <>
              <label className="agj-field">
                <span>{t("aj.contentType")}</span>
                <select className="agj-in" value={ctype} onChange={(e) => setCtype(e.target.value)} data-testid="agent-job-ctype">
                  <option value="">{t("aj.pickType")}</option>
                  {allowed.map((x) => <option key={x.uid} value={x.uid}>{x.label}</option>)}
                </select>
              </label>
              <label className="agj-field">
                <span>{t("aj.targetLocale")}</span>
                <select className="agj-in" value={target} onChange={(e) => setTarget(e.target.value as "en" | "th")}>
                  <option value="en">{t("aj.langEn")}</option>
                  <option value="th">{t("aj.langTh")}</option>
                </select>
              </label>
              <label className="agj-field full">
                <span>{t("aj.search")}</span>
                <input className="agj-in" type="text" value={q} maxLength={200} onChange={(e) => setQ(e.target.value)} />
              </label>
            </>
          )}

          {(key === "bulk_translate" || key === "audit_all") && (
            <>
              <label className="agj-field">
                <span>{t("aj.updatedSince")}</span>
                <input className="agj-in" type="date" value={since} onChange={(e) => setSince(e.target.value)} />
              </label>
              <label className="agj-field">
                <span>{t("aj.max")}</span>
                <select className="agj-in" value={max} onChange={(e) => setMax(Number(e.target.value))}>
                  {MAX_CHOICES[key].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </>
          )}

          {key === "custom" && (
            <label className="agj-field full">
              <span>{t("aj.goal")}</span>
              <textarea className="agj-in" rows={4} maxLength={8000} value={goal} placeholder={t("aj.goalPh")} onChange={(e) => setGoal(e.target.value)} data-testid="agent-job-goal" />
            </label>
          )}

          {preview && (
            <div className="agj-prev full" data-testid="agent-job-preview" aria-live="polite">
              <div className="agj-prev-h">
                {preview.template === "bulk_create"
                  ? fill(t("aj.previewDrafts"), { n: preview.count })
                  : preview.count ? fill(t("aj.previewItems"), { n: preview.count }) : t("aj.previewNone")}
              </div>
              {preview.items.length > 0 && (
                <ul>
                  {preview.items.map((it, i) => (
                    <li key={i}>{it.title}{it.detail ? <small> · {it.detail}</small> : null}</li>
                  ))}
                  {preview.count > preview.items.length && <li className="agj-note">{fill(t("aj.previewMore"), { n: preview.count - preview.items.length })}</li>}
                </ul>
              )}
              {preview.estimatedTokens !== null && preview.count > 0 && (
                <div className={"agj-note" + (preview.estimatedTokens > preview.tokenBudget ? " warn" : "")}>
                  {preview.estimatedTokens === 0
                    ? t("aj.noAiTokens")
                    : fill(t(preview.estimatedTokens > preview.tokenBudget ? "aj.estimateOver" : "aj.estimate"), {
                        n: fmtNum(preview.estimatedTokens, lang), b: fmtNum(preview.tokenBudget, lang),
                      })}
                </div>
              )}
            </div>
          )}

          <div className="agj-actions full">
            {err ? <span className="agj-err" role="alert">{err}</span> : needsPreview && !preview ? <span className="agj-note">{t("aj.previewFirst")}</span> : null}
            {needsPreview && (
              <button type="button" className="btn btn--g btn-sm" onClick={runPreview} disabled={!ready || busy !== ""} data-testid="agent-job-preview-btn">
                {t("aj.preview")}
              </button>
            )}
            <button type="button" className="btn btn--p btn-sm" onClick={start}
              disabled={!ready || busy !== "" || (needsPreview && (!preview || previewEmpty))} data-testid="agent-job-start">
              {t("aj.start")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
