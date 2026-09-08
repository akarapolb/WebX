"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";
import { cms, CmsError } from "@/lib/cms";

type Row = Record<string, any>;
// Phase 7 — engine-aware: a WordPress-engine session (ORST/RoyalSociety) now
// has these natively in WordPress (wp:complaint/wp:application/
// wp:contact-message), not Strapi. Was previously silently broken for those
// sessions (hardcoded Strapi uids the wordpress adapter didn't recognize —
// swallowed by the catch block below into an always-empty "no submissions"
// list). DGA/PEA (Strapi-engine) keep using the same uids as before,
// unchanged.
function tabsFor(engine: "strapi" | "wordpress") {
  return engine === "wordpress"
    ? [
        { uid: "wp:complaint", key: "f.complaint" },
        { uid: "wp:application", key: "f.application" },
        { uid: "wp:contact-message", key: "f.contact" },
      ]
    : [
        { uid: "api::complaint.complaint", key: "f.complaint" },
        { uid: "api::application.application", key: "f.application" },
        { uid: "api::contact-message.contact-message", key: "f.contact" },
      ];
}

function subjectOf(e: Row): string {
  for (const k of ["subject", "ref", "name", "fullname", "title"]) if (typeof e[k] === "string" && e[k].trim()) return e[k];
  return "#" + (e.documentId ?? e.id ?? "—");
}
function fromOf(e: Row): string {
  if (e.anonymous) return "anonymous (PDPA)";
  return e.email || e.name || e.phone || "—";
}
function fmt(s?: string) { try { return s ? new Date(s).toLocaleString() : "—"; } catch { return "—"; } }

export default function FormsInbox() {
  const { t } = useLang();
  const { engine } = useTenant();
  const TABS = useMemo(() => tabsFor(engine), [engine]);
  const [tab, setTab] = useState(TABS[0].uid);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async (uid: string) => {
    setLoading(true); setErr("");
    try {
      const { data, total } = await cms.entries.list<Row>(uid, { page: 1, pageSize: 25, sort: "createdAt:DESC" });
      setRows(data); setTotal(total ?? data.length);
    } catch (e) {
      if (e instanceof CmsError && e.status === 403) { setErr(t("c.noPerm")); setRows([]); }
      else if (e instanceof CmsError) { setRows([]); }
      else setErr("Cannot reach the backend.");
    }
    finally { setLoading(false); }
  }, [t]);

  // Re-pick a valid tab (and reload) whenever the engine itself changes —
  // e.g. switching workspace from a WordPress-engine tenant to a
  // Strapi-engine one while already on this page.
  useEffect(() => { setTab(TABS[0].uid); }, [TABS]);
  useEffect(() => { load(tab); }, [tab, load]);

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.forms")}</h1><p>{t("f.sub")}</p></div>
      </div>

      <div className="cbar">
        <div className="seg">
          {TABS.map((x) => (
            <button key={x.uid} className={tab === x.uid ? "on" : ""} onClick={() => setTab(x.uid)}>
              {t(x.key)}{tab === x.uid && total != null ? " · " + total : ""}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="panel"><span className="badge b-warn"><span className="dot" />!</span><span className="muted" style={{ marginLeft: 10 }}>{err}</span></div>}

      {!err && (
        <div className="panel" style={{ padding: "8px 0", minHeight: 200 }}>
          {loading && <div className="muted" style={{ padding: 20 }}>{t("f.loading")}</div>}
          {!loading && rows.length === 0 && <div className="muted" style={{ padding: 24, textAlign: "center" }}>{t("f.empty")}</div>}
          {!loading && rows.length > 0 && (
            <table className="tbl">
              <thead><tr><th>{t("f.colItem")}</th><th>{t("f.colFrom")}</th><th>{t("f.colDate")}</th><th>{t("f.colStatus")}</th></tr></thead>
              <tbody>
                {rows.map((e) => {
                  const done = e.handled === true || (typeof e.stage === "number" && e.stage > 0);
                  return (
                    <tr key={e.documentId ?? e.id}>
                      <td><b>{subjectOf(e)}</b></td>
                      <td className="mono" style={{ fontSize: 12 }}>{fromOf(e)}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{fmt(e.createdAt)}</td>
                      <td>{done
                        ? <span className="badge b-ok"><span className="dot" />{t("f.handled")}</span>
                        : <span className="badge b-warn"><span className="dot" />{t("f.pending")}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="notice"><Icon name="shield" /> {t("c.bffnote")}</div>
    </>
  );
}
