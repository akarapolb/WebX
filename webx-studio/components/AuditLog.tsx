"use client";
import { useEffect, useState, useCallback } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { cms, CmsError } from "@/lib/cms";

type Log = { id: number; action?: string; contentType?: string; entryId?: string; adminEmail?: string; tenantKey?: string; at?: string; actor?: string; targetRef?: string; createdAt?: string };
const AL_UID = "api::audit-log.audit-log";
const shortType = (c?: string) => (c || "").replace(/^api::/, "").replace(/\.[^.]+$/, "");
const badgeOf = (a?: string) =>
  a === "delete" || a === "remove_user" || a === "mfa_disable" || a === "delete_api_token" || a === "custom_role_delete" || a === "custom_role_unassign" ? "b-warn"
  : a === "publish" || a === "mfa_enable" ? "b-ok"
  : a === "create" || a === "create_user" || a === "signup" || a === "create_api_token" || a === "sso_jit_provision" || a === "custom_role_create" || a === "custom_role_assign" ? "b-acc"
  : "b-mut";

export default function AuditLog() {
  const { t, lang } = useLang();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data } = await cms.entries.list<Log>(AL_UID, { sort: "createdAt:DESC", pageSize: 100 });
      setLogs(data);
    } catch (e) {
      if (e instanceof CmsError && e.status === 403) setErr(t("c.noPerm"));
      else if (e instanceof CmsError) setErr("Could not load logs (HTTP " + e.status + ").");
      else setErr("Cannot reach the backend.");
    }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const fmt = (iso?: string) => { if (!iso) return ""; try { return new Date(iso).toLocaleString(lang === "th" ? "th-TH" : "en-GB", { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; } };
  const actions = ["create", "update", "publish", "unpublish", "delete", "create_user", "remove_user", "rebuild_public_site", "signup", "mfa_enable", "mfa_disable", "create_api_token", "delete_api_token", "sso_config_update", "sso_jit_provision", "custom_role_create", "custom_role_update", "custom_role_delete", "custom_role_assign", "custom_role_unassign"];
  const shown = filter ? logs.filter((l) => l.action === filter) : logs;

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.audit")}</h1><p>{t("al.sub")}</p></div>
        <div className="vh-act">
          <select className="vb-sel" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t("al.action")}>
            <option value="">{t("al.all")}</option>
            {actions.map((a) => <option key={a} value={a}>{t("al.a_" + a)}</option>)}
          </select>
          <button className="btn btn--g" onClick={load}><Icon name="undo" />{t("al.refresh")}</button>
        </div>
      </div>

      {err && <div className="panel"><span className="badge b-warn"><span className="dot" />!</span><span className="muted" style={{ marginLeft: 10 }}>{err}</span></div>}

      {!err && (
        <div className="panel" style={{ padding: "8px 0", minHeight: 200 }}>
          {loading && <div className="muted" style={{ padding: 20 }}>{t("al.loading")}</div>}
          {!loading && shown.length === 0 && <div className="muted" style={{ padding: 20 }}>{t("al.empty")}</div>}
          {!loading && shown.length > 0 && (
            <table className="tbl">
              <thead><tr><th>{t("al.time")}</th><th>{t("al.actor")}</th><th>{t("al.action")}</th><th>{t("al.target")}</th></tr></thead>
              <tbody>
                {shown.map((l) => {
                  const tgt = l.entryId || l.targetRef || "";
                  return (
                    <tr key={l.id}>
                      <td className="muted mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmt(l.at || l.createdAt)}</td>
                      <td><b>{l.adminEmail || l.actor || "—"}</b></td>
                      <td><span className={"badge " + badgeOf(l.action)}><span className="dot" />{t("al.a_" + l.action)}</span></td>
                      <td><span className="mono" style={{ fontSize: 12 }}>{shortType(l.contentType)}{tgt ? <span className="muted"> {"·"} {String(tgt).slice(0, 10)}</span> : null}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="notice"><Icon name="shield" /> {t("al.note")}</div>
    </>
  );
}
