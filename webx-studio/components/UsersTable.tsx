"use client";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { cms, CmsError, type AdminUser } from "@/lib/cms";

export default function UsersTable() {
  const { t } = useLang();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setUsers(await cms.auth.listUsers());
      } catch (e) {
        if (e instanceof CmsError && e.status === 403) setErr(t("c.noPerm"));
        else if (e instanceof CmsError) setErr("Could not load users (HTTP " + e.status + ").");
        else setErr("Cannot reach the backend.");
      }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.users")}</h1><p>{t("u.sub")}</p></div>
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
    </>
  );
}
