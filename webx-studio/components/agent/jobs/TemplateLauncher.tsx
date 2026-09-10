"use client";
// Starting a background job from a template (lib/agent/jobs/templates.ts):
// pick a template, fill in its form, preview what it will do, then start it.
// Bulk templates must be previewed first; that preview is the confirmation.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AgentLevel } from "@/lib/agent/types";
import { useLang } from "../../LangProvider";
import { useAgent } from "../AgentProvider";
import { announceJobsChanged, fill, fmtNum, readError } from "./common";
import {
  defaultMax, emptyFields, fieldsReady, paramsFor, TemplateFields, TemplatePicker, useJobContentTypes,
  type FieldValues, type TemplateKey,
} from "./TemplateFields";

type Preview = {
  template: TemplateKey; title: string; requiredLevel: AgentLevel; count: number;
  items: { title: string; detail?: string }[]; estimatedTokens: number | null; tokenBudget: number;
};

export default function TemplateLauncher() {
  const { t, lang } = useLang();
  const agent = useAgent();
  const router = useRouter();
  const level = agent.policy?.level ?? "off";
  const types = useJobContentTypes();

  const [key, setKey] = useState<TemplateKey | "">("");
  const [values, setValues] = useState<FieldValues>(emptyFields);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "start">("");
  const [err, setErr] = useState("");

  const params = useMemo(() => paramsFor(key, values, "start"), [key, values]);

  // Any change makes an earlier preview stale.
  useEffect(() => {
    setPreview(null);
    setErr("");
  }, [params]);

  const ready = fieldsReady(key, values);
  const needsPreview = key !== "" && key !== "custom";
  const previewEmpty = Boolean(preview && preview.template !== "bulk_create" && !preview.count);

  function choose(k: TemplateKey | "") {
    setKey(k);
    if (k) setValues((v) => ({ ...v, max: defaultMax(k) }));
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

  return (
    <div className="agj-launch">
      <TemplatePicker value={key} onChange={choose} level={level} label={t("aj.new")} t={t} />

      {key && (
        <div className="agj-form" data-testid="agent-job-form">
          <TemplateFields template={key} values={values} onChange={setValues} types={types} level={level} mode="start" t={t} />

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
