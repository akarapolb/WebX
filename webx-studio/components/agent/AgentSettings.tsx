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

const LEVELS: AgentLevel[] = ["off", "read", "suggest", "draft", "draft_submit"];
const LEVEL_KEY: Record<AgentLevel, string> = {
  off: "ag.levelOff", read: "ag.levelRead", suggest: "ag.levelSuggest", draft: "ag.levelDraft", draft_submit: "ag.levelDraft_submit",
};
const LEVEL_DESC_KEY: Record<AgentLevel, string> = {
  off: "as.descOff", read: "as.descRead", suggest: "as.descSuggest", draft: "as.descDraft", draft_submit: "as.descDraftSubmit",
};

type Settings = { level: AgentLevel; tools?: string[]; contentTypes?: string[]; model?: string; local?: boolean };

export default function AgentSettings() {
  const { t } = useLang();
  const { currentKey } = useTenant();
  const tenant = currentKey && currentKey !== "workspace" ? currentKey : "";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [level, setLevel] = useState<AgentLevel>("off");
  const [local, setLocal] = useState(false);
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
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
    } catch { setErr("Cannot reach the backend."); }
    finally { setLoading(false); }
  }, [tenant]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/agent/policy?tenant=" + encodeURIComponent(tenant), {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, local, model: model.trim() || undefined }),
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
          <input type="checkbox" checked={local} onChange={(e) => setLocal(e.target.checked)} />
          {t("as.local")}
        </span>
        <small className="muted">{t("as.localHint")}</small>
      </label>

      <label className="vb-fld" style={{ marginBottom: 18 }}>
        <span>{t("as.model")}</span>
        <input className="rv-assignee" style={{ width: "100%" }} value={model} onChange={(e) => setModel(e.target.value)} placeholder={t("as.modelPh")} disabled={local} />
        <small className="muted">{t("as.modelHint")}</small>
      </label>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn--p" onClick={save} disabled={saving} data-testid="agent-settings-save">
          <Icon name="save" />{saving ? t("as.saving") : t("as.save")}
        </button>
      </div>
    </div>
  );
}
