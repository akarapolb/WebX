"use client";
// Breaking-news fast-publish path (TOR requirement) — the ONE piece of the
// public site that skips the static-rebuild pipeline entirely: public-site/
// components/BreakingNewsBanner.tsx polls Strapi live from the browser, so
// toggling/editing this here is a normal Strapi publish (instant), not a
// 20s-debounced multi-minute `next build` like every other edit in this app.
// Deliberately does NOT call /api/cms/public-site/rebuild on save (contrast
// FooterEditor.tsx, which does — footer content IS baked into the static
// build, this banner never is).
//
// At most one row per tenant, enforced here (not by the Strapi schema,
// which is a plain collectionType like every other tenant-scoped type in
// this app) — this screen always edits "the" row for the current tenant,
// creating one on first save if none exists yet.
import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { cms, CmsError } from "@/lib/cms";

const UID = "api::breaking-news.breaking-news";

type Severity = "info" | "warning" | "critical";
type Alert = { docId: string | null; active: boolean; severity: Severity; message: string; url: string; linkLabel: string };

const EMPTY: Alert = { docId: null, active: false, severity: "warning", message: "", url: "", linkLabel: "อ่านเพิ่มเติม" };

export default function BreakingNewsManager({ tenantKey }: { tenantKey?: string }) {
  const { t } = useLang();
  const [alert, setAlert] = useState<Alert>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!tenantKey) { setAlert(EMPTY); return; }
    try {
      const { data } = await cms.entries.list<any>(UID, {
        filter: [{ field: "tenant.key", op: "eq", value: tenantKey }],
        sort: "updatedAt:desc", pageSize: 1,
      });
      const row = data?.[0];
      setAlert(row
        ? {
            docId: String(row.documentId ?? row.id), active: !!row.active, severity: row.severity || "warning",
            message: row.message || "", url: row.url || "", linkLabel: row.linkLabel || "อ่านเพิ่มเติม",
          }
        : EMPTY);
    } catch {}
  }, [tenantKey]);
  useEffect(() => { load(); }, [load]);

  async function save(patch: Partial<Alert>) {
    const next = { ...alert, ...patch };
    setAlert(next);
    setBusy(true); setMsg(null);
    try {
      const payload = { active: next.active, severity: next.severity, message: next.message, url: next.url, linkLabel: next.linkLabel };
      let docId = next.docId;
      if (docId) {
        await cms.entries.update(UID, docId, payload);
      } else {
        const result: any = await cms.entries.create(UID, payload);
        docId = String(result?.documentId ?? result?.id);
        setAlert((a) => ({ ...a, docId }));
      }
      await cms.publish.publish(UID, docId!);
      setMsg({ t: t("bn.saved"), ok: true });
    } catch (e) {
      setMsg({ t: e instanceof CmsError ? "Save failed (HTTP " + e.status + ")" : "Cannot reach the backend.", ok: false });
    } finally { setBusy(false); }
  }

  const fieldStyle = { width: "100%", background: "var(--panel)", border: "1px solid var(--line2)", borderRadius: 9, padding: "9px 11px", fontSize: 13, color: "var(--ink)" } as const;

  return (
    <div className="panel">
      <div className="panel-h">
        <div><h3>{t("bn.title")}</h3><span className="sub">{t("bn.sub")}</span></div>
      </div>
      {msg && <div style={{ marginBottom: 10 }}><span className={"toast-in " + (msg.ok ? "ok" : "bad")}>{msg.t}</span></div>}

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
        <input type="checkbox" checked={alert.active} disabled={busy || !tenantKey} onChange={(e) => save({ active: e.target.checked })} />
        {t("bn.active")}
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div className="sub" style={{ marginBottom: 4 }}>{t("bn.severity")}</div>
          <select style={fieldStyle} value={alert.severity} disabled={busy || !tenantKey}
            onChange={(e) => save({ severity: e.target.value as Severity })}>
            <option value="info">{t("bn.severity_info")}</option>
            <option value="warning">{t("bn.severity_warning")}</option>
            <option value="critical">{t("bn.severity_critical")}</option>
          </select>
        </div>
        <div>
          <div className="sub" style={{ marginBottom: 4 }}>{t("bn.message")}</div>
          <textarea rows={2} style={{ ...fieldStyle, resize: "vertical", fontFamily: "inherit" }}
            value={alert.message} onChange={(e) => setAlert((a) => ({ ...a, message: e.target.value }))}
            onBlur={() => save({})} disabled={!tenantKey} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="sub" style={{ marginBottom: 4 }}>{t("bn.url")}</div>
            <input style={fieldStyle} value={alert.url} onChange={(e) => setAlert((a) => ({ ...a, url: e.target.value }))}
              onBlur={() => save({})} disabled={!tenantKey} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="sub" style={{ marginBottom: 4 }}>{t("bn.linklabel")}</div>
            <input style={fieldStyle} value={alert.linkLabel} onChange={(e) => setAlert((a) => ({ ...a, linkLabel: e.target.value }))}
              onBlur={() => save({})} disabled={!tenantKey} />
          </div>
        </div>
      </div>
      <p className="sub" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="bell" /> {t("bn.fastnote")}
      </p>
    </div>
  );
}
