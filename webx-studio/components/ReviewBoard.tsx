"use client";
import { useEffect, useState, useCallback } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";

type Review = { id: number; documentId?: string; documentRef: string; contentType?: string; title?: string; stage: string; assignee?: string; requestedBy?: string; note?: string; history?: any[]; updatedAt?: string };
const RV_UID = "api::review.review";
const STAGES = ["in_review", "changes", "approved", "published"];
const shortType = (c?: string) => (c || "").replace(/^api::/, "").replace(/\.[^.]+$/, "");

export default function ReviewBoard() {
  const { t } = useLang();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [me, setMe] = useState("admin");
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/strapi/content-manager/collection-types/" + RV_UID + "?sort=updatedAt:DESC&pageSize=200");
      if (r.status === 403) { setErr(t("c.noPerm")); setLoading(false); return; }
      if (!r.ok) { setErr("Could not load reviews (HTTP " + r.status + ")."); setLoading(false); return; }
      const j = await r.json();
      setReviews(j.results ?? j.data ?? []);
    } catch { setErr("Cannot reach the backend."); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => {
    load();
    fetch("/api/strapi/admin/users/me").then((r) => (r.ok ? r.json() : null)).then((j) => { const u = j?.data ?? j; if (u?.email) setMe(u.email); }).catch(() => {});
  }, [load]);

  async function move(rv: Review, to: string) {
    setBusy(rv.id);
    const hist = Array.isArray(rv.history) ? rv.history : [];
    const entry = { from: rv.stage, to, by: me, at: new Date().toISOString() };
    const id = rv.documentId ?? rv.id;
    try {
      if (to === "published" && rv.contentType && rv.documentRef) {
        await fetch("/api/strapi/content-manager/collection-types/" + rv.contentType + "/" + rv.documentRef + "/actions/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
      }
      await fetch("/api/strapi/content-manager/collection-types/" + RV_UID + "/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: to, history: [...hist, entry] }) });
      await load();
    } catch {} finally { setBusy(null); }
  }
  async function setAssignee(rv: Review, val: string) {
    if (val === (rv.assignee || "")) return;
    const id = rv.documentId ?? rv.id;
    try { await fetch("/api/strapi/content-manager/collection-types/" + RV_UID + "/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignee: val }) }); } catch {}
  }

  const actionsFor = (stage: string): { to: string; label: string; cls: string }[] => {
    switch (stage) {
      case "in_review": return [{ to: "approved", label: t("rv.approve"), cls: "ok" }, { to: "changes", label: t("rv.reqchanges"), cls: "warn" }];
      case "changes": return [{ to: "in_review", label: t("rv.resubmit"), cls: "acc" }];
      case "approved": return [{ to: "published", label: t("rv.publish"), cls: "ok" }, { to: "changes", label: t("rv.reqchanges"), cls: "warn" }];
      case "published": return [{ to: "in_review", label: t("rv.reopen"), cls: "mut" }];
      default: return [];
    }
  };

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.reviews")}</h1><p>{t("rv.sub")}</p></div>
        <div className="vh-act"><button className="btn btn--g" onClick={load}><Icon name="undo" />{t("al.refresh")}</button></div>
      </div>

      {err && <div className="panel"><span className="badge b-warn"><span className="dot" />!</span><span className="muted" style={{ marginLeft: 10 }}>{err}</span></div>}

      {!err && (
        <div className="rv-board">
          {STAGES.map((st) => {
            const items = reviews.filter((r) => r.stage === st);
            return (
              <div className="rv-col" key={st}>
                <div className="rv-colh"><span className={"rv-dot s-" + st} />{t("rv.s_" + st)}<span className="rv-count">{items.length}</span></div>
                <div className="rv-cards">
                  {!loading && items.length === 0 && <div className="rv-empty">{t("rv.empty")}</div>}
                  {items.map((rv) => (
                    <div className="rv-card" key={rv.id}>
                      <b>{rv.title || rv.documentRef}</b>
                      <div className="rv-cmeta"><span className="mono">{shortType(rv.contentType)}</span>{rv.requestedBy ? <span className="muted"> · {rv.requestedBy}</span> : null}</div>
                      {rv.note ? <div className="rv-note">{rv.note}</div> : null}
                      <input className="rv-assignee" placeholder={t("rv.assignee")} defaultValue={rv.assignee || ""} onBlur={(e) => setAssignee(rv, e.target.value)} />
                      <div className="rv-actions">
                        {actionsFor(rv.stage).map((a) => (
                          <button key={a.to} className={"rv-btn " + a.cls} disabled={busy === rv.id} onClick={() => move(rv, a.to)}>{a.label}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="notice"><Icon name="shield" /> {t("rv.note")}</div>
    </>
  );
}
