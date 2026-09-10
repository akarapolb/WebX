"use client";
import { useEffect, useState, useCallback } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { cms, CmsError } from "@/lib/cms";
import { useAgentContext } from "./agent/useAgentContext";

type Review = { id: number; documentId?: string; documentRef: string; contentType?: string; title?: string; stage: string; kind?: string; payload?: any; assignee?: string; requestedBy?: string; note?: string; history?: any[]; updatedAt?: string };
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
  const [flash, setFlash] = useState("");

  // Read-only context — lets the panel show "Reviews board" as a context
  // chip while this page is open. No write handlers: submit_for_review
  // (lib/agent/tools.ts) already works regardless of which page is open,
  // and there is deliberately no list_reviews tool yet — the underlying
  // governed.list("api::review.review", ...) has no tenant filter today
  // (REVIEW_UID isn't in governance.ts's SCOPED/WP_SCOPED sets), a
  // pre-existing cross-tenant leak this component itself also inherits;
  // exposing that same query to the agent was cut from Milestone 1 rather
  // than handed a bug to propagate further.
  useAgentContext({ kind: "board" }, {}, []);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data } = await cms.entries.list<Review>(RV_UID, { sort: "updatedAt:DESC", pageSize: 200 });
      setReviews(data);
    } catch (e) {
      if (e instanceof CmsError && e.status === 403) setErr(t("c.noPerm"));
      else if (e instanceof CmsError) setErr("Could not load reviews (HTTP " + e.status + ").");
      else setErr("Cannot reach the backend.");
    }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => {
    load();
    cms.auth.me().then((u) => { if (u?.email) setMe(u.email); }).catch(() => {});
  }, [load]);

  async function move(rv: Review, to: string) {
    setBusy(rv.id);
    const hist = Array.isArray(rv.history) ? rv.history : [];
    const entry = { from: rv.stage, to, by: me, at: new Date().toISOString() };
    const id = String(rv.documentId ?? rv.id);
    try {
      if (to === "published" && rv.contentType && rv.documentRef) {
        await cms.publish.publish(rv.contentType, rv.documentRef).catch(() => {});
      }
      await cms.entries.update(RV_UID, id, { stage: to, history: [...hist, entry] });
      await load();
    } catch {} finally { setBusy(null); }
  }
  // Translation reviews: write the proposed fields into the target-locale entry
  // (creates/updates that locale's draft). Stays unpublished — a human publishes.
  async function applyTranslation(rv: Review) {
    const f = rv.payload?.fields, loc = rv.payload?.targetLocale;
    if (!f || !loc || !rv.contentType || !rv.documentRef) return;
    setBusy(rv.id); setFlash("");
    try {
      await cms.entries.update(rv.contentType, rv.documentRef, f, { locale: loc });
      const hist = Array.isArray(rv.history) ? rv.history : [];
      const id = String(rv.documentId ?? rv.id);
      await cms.entries.update(RV_UID, id, { stage: "approved", history: [...hist, { from: rv.stage, to: "applied:" + loc, by: me, at: new Date().toISOString() }] }).catch(() => {});
      setFlash(t("tr.applied").replace("{loc}", loc.toUpperCase()));
      await load();
    } catch (e) {
      if (e instanceof CmsError) setFlash("Apply failed (HTTP " + e.status + ").");
      else setFlash("Cannot reach the backend.");
    }
    finally { setBusy(null); }
  }

  async function setAssignee(rv: Review, val: string) {
    if (val === (rv.assignee || "")) return;
    const id = String(rv.documentId ?? rv.id);
    try { await cms.entries.update(RV_UID, id, { assignee: val }); } catch {}
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
      {flash && <div className="panel"><span className="badge b-ok"><Icon name="check" /></span><span style={{ marginLeft: 10 }}>{flash}</span></div>}

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
                      <div className="rv-cmeta"><span className="mono">{shortType(rv.contentType)}</span>{rv.kind === "translation" ? <span className="badge b-acc" style={{ marginLeft: 6 }}><Icon name="spark" />{t("tr.badge").replace("{loc}", String(rv.payload?.targetLocale || "").toUpperCase())}</span> : null}{rv.requestedBy ? <span className="muted"> · {rv.requestedBy}</span> : null}</div>
                      {rv.note ? <div className="rv-note">{rv.note}</div> : null}
                      <input className="rv-assignee" placeholder={t("rv.assignee")} defaultValue={rv.assignee || ""} onBlur={(e) => setAssignee(rv, e.target.value)} />
                      <div className="rv-actions">
                        {rv.kind === "translation" && rv.payload?.fields ? (
                          <button className="rv-btn ok" disabled={busy === rv.id} onClick={() => applyTranslation(rv)}>{t("tr.apply").replace("{loc}", String(rv.payload?.targetLocale || "").toUpperCase())}</button>
                        ) : null}
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
