"use client";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";
import { cms, CmsError, type AdminUser } from "@/lib/cms";

const lbl: any = { display: "block", fontSize: 12, color: "var(--muted)", margin: "10px 0 4px" };

export default function UsersTable() {
  const { t } = useLang();
  const { currentKey } = useTenant();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    if (!currentKey) return;
    setLoading(true); setErr("");
    try {
      setUsers(await cms.auth.listUsers(currentKey));
    } catch (e) {
      if (e instanceof CmsError && e.status === 403) setErr(t("c.noPerm"));
      else if (e instanceof CmsError) setErr("Could not load users (HTTP " + e.status + ").");
      else setErr("Cannot reach the backend.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.users")}</h1><p>{t("u.sub")}</p></div>
        <button className="btn btn--p" onClick={() => setShowAdd(true)} disabled={!currentKey}><Icon name="plus" /> {t("u.add")}</button>
      </div>

      {err && <div className="panel"><span className="badge b-warn"><span className="dot" />!</span><span className="muted" style={{ marginLeft: 10 }}>{err}</span></div>}

      {!err && (
        <div className="panel" style={{ padding: "8px 0", minHeight: 200 }}>
          {loading && <div className="muted" style={{ padding: 20 }}>{t("u.loading")}</div>}
          {!loading && (
            <table className="tbl">
              <thead><tr><th>{t("u.colUser")}</th><th>{t("u.colRole")}</th><th>{t("u.colStatus")}</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <b>{[u.firstname, u.lastname].filter(Boolean).join(" ") || "—"}</b>
                      <div className="muted mono" style={{ fontSize: 11, marginTop: 3 }}>{u.email}</div>
                    </td>
                    <td>{(u.roles ?? []).map((r) => <span key={r} className="badge b-acc" style={{ marginRight: 6 }}>{r}</span>)}</td>
                    <td>{u.isActive
                      ? <span className="badge b-ok"><span className="dot" />{t("u.active")}</span>
                      : <span className="badge b-mut"><span className="dot" />{t("u.inactive")}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="notice"><Icon name="shield" /> {t("u.note")}</div>

      {showAdd && currentKey && <AddUserModal tenantKey={currentKey} onClose={() => setShowAdd(false)} onCreated={load} />}
    </>
  );
}

function AddUserModal({ tenantKey, onClose, onCreated }: { tenantKey: string; onClose: () => void; onCreated: () => void }) {
  const { t } = useLang();
  const [roles, setRoles] = useState<{ id: any; name: string }[]>([]);
  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ user: AdminUser; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    cms.auth.listRoles(tenantKey).then(setRoles).catch(() => {});
  }, [tenantKey]);

  async function submit() {
    if (!firstname.trim() || !email.trim() || !roleId) { setErr(t("u.needFields")); return; }
    setBusy(true); setErr("");
    try {
      const r = await cms.auth.create(tenantKey, { firstname: firstname.trim(), lastname: lastname.trim(), email: email.trim(), roleId });
      setResult(r);
    } catch (e) {
      if (e instanceof CmsError) setErr(t("u.createFail") + " (HTTP " + e.status + ")");
      else setErr("Cannot reach the backend.");
    } finally { setBusy(false); }
  }

  function copyPassword() {
    if (!result) return;
    navigator.clipboard?.writeText(result.tempPassword).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  function finish() {
    onCreated();
    onClose();
  }

  return (
    <div className="scrim" style={{ zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={result ? undefined : onClose}>
      <div className="panel" style={{ maxWidth: 440, width: "92%" }} onClick={(e) => e.stopPropagation()}>
        {!result && (
          <>
            <h3 style={{ marginTop: 0 }}><Icon name="plus" /> {t("u.addTitle")}</h3>
            <p className="muted" style={{ marginTop: 0 }}>{t("u.addSub")}</p>
            {err && <div className="badge b-warn" style={{ display: "inline-flex", marginBottom: 8 }}><span className="dot" />{err}</div>}

            <label style={lbl}>{t("u.firstname")}</label>
            <input className="rv-assignee" style={{ width: "100%" }} value={firstname} onChange={(e) => setFirstname(e.target.value)} autoFocus />

            <label style={lbl}>{t("u.lastname")}</label>
            <input className="rv-assignee" style={{ width: "100%" }} value={lastname} onChange={(e) => setLastname(e.target.value)} />

            <label style={lbl}>{t("u.email")}</label>
            <input className="rv-assignee" style={{ width: "100%" }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@org.go.th" />

            <label style={lbl}>{t("u.role")}</label>
            <select className="vb-sel" style={{ width: "100%" }} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">{t("u.pickrole")}</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn btn--g" onClick={onClose} disabled={busy}>{t("e.cancel")}</button>
              <button className="btn btn--p" onClick={submit} disabled={busy}>{busy ? t("u.creatingUser") : t("u.createBtn")}</button>
            </div>
          </>
        )}

        {result && (
          <>
            <h3 style={{ marginTop: 0 }}><Icon name="lock" /> {t("u.tempTitle")}</h3>
            <p className="muted" style={{ marginTop: 0 }}>{t("u.tempSub")}</p>
            <div className="mono" style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              background: "var(--panel-2, rgba(255,255,255,0.06))", border: "1px solid var(--line, rgba(255,255,255,0.12))",
              borderRadius: 8, padding: "10px 12px", fontSize: 15, margin: "12px 0",
            }}>
              <span>{result.tempPassword}</span>
              <button className="btn btn--g" style={{ padding: "4px 10px" }} onClick={copyPassword}>
                <Icon name={copied ? "check" : "copy"} /> {copied ? t("u.copied") : t("u.copy")}
              </button>
            </div>
            <div className="badge b-warn" style={{ display: "inline-flex", marginBottom: 16 }}>
              <span className="dot" />{result.user.email}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn--p" onClick={finish}>{t("u.done")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
