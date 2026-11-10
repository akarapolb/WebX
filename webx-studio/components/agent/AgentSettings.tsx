"use client";
// Workspace-admin-only settings screen for the WebX Agent's own autonomy
// default — GET/PUT /api/agent/policy?tenant= (governance.ts's
// getAgentPolicy/saveAgentPolicy, gated by assertCanActOnTenant; distinct
// from /api/agent/status, which resolves what the CURRENT caller can do —
// see AgentProvider's own comment on that split). A non-admin editor
// viewing this tab simply gets the 403 this route already returns, shown
// as a plain error state — same pattern FieldAccess.tsx/CustomRoles.tsx
// already use for their own admin-only screens.
import { useEffect, useState, useCallback } from "react";
import Icon from "../Icon";
import { useLang } from "../LangProvider";
import { useTenant } from "../TenantProvider";
import type { AgentLevel } from "@/lib/agent/types";
import { modelLabel, mocksFor } from "@/lib/modelLabels";
import AddModelDialog from "./AddModelDialog";

const LEVELS: AgentLevel[] = ["off", "read", "suggest", "draft", "draft_submit"];
const LEVEL_KEY: Record<AgentLevel, string> = {
  off: "ag.levelOff", read: "ag.levelRead", suggest: "ag.levelSuggest", draft: "ag.levelDraft", draft_submit: "ag.levelDraft_submit",
};
const LEVEL_DESC_KEY: Record<AgentLevel, string> = {
  off: "as.descOff", read: "as.descRead", suggest: "as.descSuggest", draft: "as.descDraft", draft_submit: "as.descDraftSubmit",
};

type Settings = {
  level: AgentLevel; tools?: string[]; contentTypes?: string[]; model?: string; local?: boolean;
  background?: boolean; schedules?: boolean;
};

export default function AgentSettings() {
  const { t } = useLang();
  const { currentKey } = useTenant();
  const tenant = currentKey && currentKey !== "workspace" ? currentKey : "";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [level, setLevel] = useState<AgentLevel>("off");
  const [local, setLocal] = useState(false);
  const [model, setModel] = useState("");
  const [background, setBackground] = useState(false);
  const [schedules, setSchedules] = useState(false);
  const [saving, setSaving] = useState(false);
  type GwModel = { alias: string; model: string; provider: string; host: string; kind: "chat" | "embedding"; custom?: boolean };
  const [gw, setGw] = useState<{ models: GwModel[]; defaultModel: string; embedModel: string; reachable: boolean; canAdd?: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const [modelMsg, setModelMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!tenant) { setLoading(false); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/agent/policy?tenant=" + encodeURIComponent(tenant));
      const j = await r.json().catch(() => null);
      if (!r.ok) { setErr(j?.error || ("HTTP " + r.status)); return; }
      const s = j as Settings;
      setLevel(LEVELS.includes(s.level) ? s.level : "off");
      setLocal(Boolean(s.local));
      setModel(s.model || "");
      setBackground(Boolean(s.background));
      setSchedules(Boolean(s.schedules));
    } catch { setErr("Cannot reach the backend."); }
    finally { setLoading(false); }
  }, [tenant]);
  useEffect(() => { load(); }, [load]);
  // The models the AI gateway really serves, not a guess typed from memory.
  const loadModels = useCallback(() => fetch("/api/ai/models").then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) setGw(j); }).catch(() => {}), []);
  useEffect(() => { loadModels(); }, [loadModels]);
  async function removeModel(alias: string) {
    if (!window.confirm(t("am.confirmRemove").replace("{a}", alias))) return;
    setModelMsg(null);
    const r = await fetch("/api/ai/models?tenant=" + encodeURIComponent(tenant) + "&alias=" + encodeURIComponent(alias), { method: "DELETE" }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (r?.ok) { if (model === alias) setModel(""); await loadModels(); setModelMsg({ t: t("am.removed"), ok: true }); }
    else setModelMsg({ t: j?.error || t("am.failed"), ok: false });
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/agent/policy?tenant=" + encodeURIComponent(tenant), {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, local, model: model.trim() || undefined, background, schedules: background && schedules }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ t: j.error || "Save failed", ok: false }); return; }
      setMsg({ t: t("as.saved"), ok: true });
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setSaving(false); }
  }

  if (!tenant) return <div className="panel"><span className="muted">{t("as.noTenant")}</span></div>;
  if (loading) return <div className="panel"><span className="muted">{t("ag.loading")}</span></div>;
  if (err) return <div className="panel"><span className="badge b-warn"><span className="dot" />!</span><span style={{ marginLeft: 10 }}>{err}</span></div>;

  return (
    <div className="panel" style={{ maxWidth: 640 }}>
      {adding && gw && (
        <AddModelDialog tenant={tenant} canAdd={Boolean(gw.canAdd)} existingAliases={gw.models.map((m) => m.alias)}
          onClose={() => setAdding(false)}
          onAdded={async (a) => { setAdding(false); await loadModels(); setModelMsg({ t: t("am.added").replace("{a}", a), ok: true }); }} />
      )}
      <h3 style={{ marginTop: 0 }}>{t("as.title")}</h3>
      <p className="muted" style={{ marginTop: -6 }}>{t("as.sub")}</p>

      {msg && <div className={"toast-in " + (msg.ok ? "ok" : "bad")} style={{ marginBottom: 12 }}>{msg.t}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        {LEVELS.map((lv) => (
          <label key={lv} className={"as-level" + (level === lv ? " on" : "")} data-testid={"as-level-" + lv}>
            <input type="radio" name="agentLevel" checked={level === lv} onChange={() => setLevel(lv)} />
            <span>
              <b>{t(LEVEL_KEY[lv])}</b>
              <small>{t(LEVEL_DESC_KEY[lv])}</small>
            </span>
          </label>
        ))}
        <label className="as-level as-level--off" aria-disabled="true">
          <input type="radio" disabled />
          <span><b style={{ textDecoration: "line-through" }}>{t("as.publish")}</b><small>{t("as.publishNote")}</small></span>
        </label>
      </div>

      <label className="vb-fld" style={{ marginBottom: 14 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} data-testid="as-background" />
          {t("as.background")}
        </span>
        <small className="muted">{t("as.backgroundHint")}</small>
      </label>

      <label className="vb-fld" style={{ marginBottom: 14, opacity: background ? 1 : 0.55 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={background && schedules} disabled={!background} onChange={(e) => setSchedules(e.target.checked)} data-testid="as-schedules" />
          {t("as.schedules")}
        </span>
        <small className="muted">{t("as.schedulesHint")}</small>
      </label>

      <label className="vb-fld" style={{ marginBottom: 14 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={local} onChange={(e) => setLocal(e.target.checked)} />
          {t("as.local")}
        </span>
        <small className="muted">{t("as.localHint")}</small>
      </label>

      <div className="vb-fld" style={{ marginBottom: 18 }} data-testid="as-models">
        <span>{t("as.models")}</span>
        {gw && !gw.reachable && <small className="auth-err">{t("as.modelsDown")}</small>}
        {gw && gw.models.length > 0 && (
          <table className="tbl as-models">
            <thead><tr><th>{t("as.m.alias")}</th><th>{t("as.m.model")}</th><th>{t("as.m.role")}</th></tr></thead>
            <tbody>
              {gw.models.map((m) => {
                const mine = model.trim() === m.alias;
                return (
                  <tr key={m.alias} data-testid={"as-model-" + m.alias}>
                    <td><b>{modelLabel(m)}</b> <span className="mono muted" style={{ fontSize: 11 }}>{m.alias}</span></td>
                    <td className="mono" style={{ fontSize: 12 }}>{m.model}{m.host ? " · " + m.host : ""}</td>
                    <td>
                      {m.alias === gw.defaultModel && <span className="badge b-ok"><span className="dot" />{t("as.m.default")}</span>}{" "}
                      {m.kind === "embedding" && <span className="badge b-mut"><span className="dot" />{t("as.m.embed")}</span>}{" "}
                      {mine && <span className="badge b-acc"><span className="dot" />{t("as.m.mine")}</span>}
                      {m.custom && <button type="button" className="btn btn--g" style={{ padding: "3px 8px", marginLeft: 6 }} onClick={() => removeModel(m.alias)} aria-label={t("am.remove")} title={t("am.remove")} data-testid={"as-remove-" + m.alias}><Icon name="trash" /></button>}
                    </td>
                  </tr>
                );
              })}
              {mocksFor(gw.models).map((m) => (
                <tr key={m.alias} style={{ opacity: 0.6 }} data-testid={"as-model-" + m.alias}>
                  <td><b>{m.label}</b></td>
                  <td className="mono" style={{ fontSize: 12 }}>—</td>
                  <td><span className="badge b-mut"><span className="dot" />{t("as.m.mock")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <span style={{ marginTop: 10 }}>{t("as.model")}</span>
        {gw && gw.models.length > 0 ? (
          <select className="rv-assignee" style={{ width: "100%" }} value={model} onChange={(e) => setModel(e.target.value)} disabled={local} data-testid="as-model-select">
            <option value="">{t("as.modelDefault").replace("{m}", gw.defaultModel)}</option>
            {gw.models.filter((m) => m.kind === "chat").map((m) => <option key={m.alias} value={m.alias}>{modelLabel(m)} · {m.alias} — {m.model}</option>)}
            {model && !gw.models.some((m) => m.alias === model) && <option value={model}>{model}</option>}
          </select>
        ) : (
          <input className="rv-assignee" style={{ width: "100%" }} value={model} onChange={(e) => setModel(e.target.value)} placeholder={t("as.modelPh")} disabled={local} />
        )}
        <small className="muted">{t("as.modelHint")}</small>
        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn btn--g" onClick={() => { setModelMsg(null); setAdding(true); }} data-testid="as-add-model"><Icon name="plus" />{t("as.addModel")}</button>
          {gw && !gw.canAdd && <small className="muted" style={{ display: "block", marginTop: 6 }}>{t("as.addModelWhy")}</small>}
          {modelMsg && <small className={modelMsg.ok ? "muted" : "auth-err"} style={{ display: "block", marginTop: 6 }}>{modelMsg.t}</small>}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn--p" onClick={save} disabled={saving} data-testid="agent-settings-save">
          <Icon name="save" />{saving ? t("as.saving") : t("as.save")}
        </button>
      </div>
    </div>
  );
}
