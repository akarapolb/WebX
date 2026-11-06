"use client";
// Under a review-mode reply: the entries the agent just created or changed, each with its status and the next
// step as buttons, so nobody has to open the Reviews page. In review → Approve (or Request changes) → Publish;
// no review yet → Publish. Publishing goes through the same call the editor's Publish button uses (so the user's
// own permission, the tenant and any open review are still checked), and the site rebuilds as usual.
import { useCallback, useEffect, useState } from "react";
import Icon from "../Icon";
import { cms, CmsError } from "@/lib/cms";

const RV_UID = "api::review.review";
type Review = { id: string; stage: string; history: any[] };
type Row = { uid: string; id: string; title: string; published: boolean; review: Review | null; state: "loading" | "ready" | "gone"; busy: boolean; msg?: { t: string; ok: boolean } };

const titleOf = (e: any): string => {
  for (const k of ["title", "name", "subject", "question", "label"]) if (typeof e?.[k] === "string" && e[k].trim()) return e[k];
  return "#" + (e?.documentId ?? e?.id ?? "");
};
const STAGE_KEY: Record<string, string> = {
  in_review: "ag.res.s.in_review", changes: "ag.res.s.changes", approved: "ag.res.s.approved", published: "ag.res.s.published",
};

export function ResultsCard({ targets, t }: { targets: { uid: string; id: string }[]; t: (k: string) => string }) {
  const [rows, setRows] = useState<Row[]>(() => targets.map((x) => ({ ...x, title: "", published: false, review: null, state: "loading", busy: false })));
  const [me, setMe] = useState("");

  const load = useCallback(async (x: { uid: string; id: string }): Promise<Partial<Row>> => {
    try {
      const e: any = await cms.entries.get(x.uid, x.id);
      if (!e) return { state: "gone" };
      const rv = await cms.entries.list<any>(RV_UID, {
        pageSize: 1, sort: "updatedAt:DESC",
        filter: [{ field: "documentRef", op: "eq", value: x.id }, { field: "contentType", op: "eq", value: x.uid }],
      }).then((r) => r.data[0]).catch(() => undefined);
      return {
        title: titleOf(e), published: e.status === "published" || Boolean(e.publishedAt), state: "ready",
        review: rv ? { id: String(rv.documentId ?? rv.id), stage: String(rv.stage || ""), history: Array.isArray(rv.history) ? rv.history : [] } : null,
      };
    } catch { return { state: "gone" }; }
  }, []);

  useEffect(() => {
    let live = true;
    cms.auth.me().then((u) => { if (live && u?.email) setMe(u.email); }).catch(() => {});
    targets.forEach(async (x) => {
      const patch = await load(x);
      if (live) setRows((rs) => rs.map((r) => (r.uid === x.uid && r.id === x.id ? { ...r, ...patch } : r)));
    });
    return () => { live = false; };
  }, [targets, load]);

  const update = (r: Row, patch: Partial<Row>) => setRows((rs) => rs.map((x) => (x.uid === r.uid && x.id === r.id ? { ...x, ...patch } : x)));
  const reason = (e: unknown) => (e instanceof CmsError ? (e.message && e.message !== String(e.status) ? e.message : "HTTP " + e.status) : "Cannot reach the backend.");

  async function setStage(r: Row, to: "approved" | "changes" | "published") {
    if (!r.review) return;
    const entry = { from: r.review.stage, to, by: me || "agent-chat", at: new Date().toISOString() };
    await cms.entries.update(RV_UID, r.review.id, { stage: to, history: [...r.review.history, entry] });
  }

  async function act(r: Row, kind: "approve" | "changes" | "publish" | "both") {
    update(r, { busy: true, msg: undefined });
    try {
      let cur = r;
      if (kind === "approve" || kind === "both") {
        await setStage(cur, "approved");
        cur = { ...cur, ...(await load(cur)) } as Row; // the review as it is now, so its history keeps every step
      }
      if (kind === "changes") await setStage(cur, "changes");
      if (kind === "publish" || kind === "both") {
        await cms.publish.publish(cur.uid, cur.id);
        if (cur.review) await setStage(cur, "published").catch(() => {});
      }
      const fresh = await load(r);
      update(r, { ...fresh, busy: false, msg: kind === "publish" || kind === "both" ? { t: t("ag.res.publishedOk"), ok: true } : undefined });
    } catch (e) {
      const fresh = await load(r);
      update(r, { ...fresh, busy: false, msg: { t: t("ag.res.failed") + ": " + reason(e), ok: false } });
    }
  }

  const visible = rows.filter((r) => r.state !== "gone");
  if (!visible.length) return null;
  return (
    <div className="ag-card ag-res" data-testid="agent-results">
      <div className="ag-card-h"><Icon name="check" /><span>{t("ag.res.title")}</span></div>
      {visible.map((r) => {
        const stage = r.review?.stage || "";
        const waiting = stage === "in_review";
        const changes = stage === "changes";
        return (
          <div className="ag-res-row" key={r.uid + r.id} data-testid="agent-result-row">
            <div className="ag-res-main">
              <b>{r.state === "loading" ? "…" : r.title}</b>
              <span className="badge b-mut ag-res-badge"><span className="dot" />{t(STAGE_KEY[stage] || (r.published ? "ag.res.s.published" : "ag.res.s.draft"))}</span>
            </div>
            {r.state === "ready" && (
              <div className="ag-res-act">
                {waiting && (
                  <>
                    <button className="btn btn--p" disabled={r.busy} onClick={() => act(r, "both")} data-testid="agent-res-approve-publish">{t("ag.res.approvePublish")}</button>
                    <button className="btn btn--g" disabled={r.busy} onClick={() => act(r, "approve")} data-testid="agent-res-approve">{t("ag.res.approve")}</button>
                    <button className="btn btn--g" disabled={r.busy} onClick={() => act(r, "changes")}>{t("ag.res.changes")}</button>
                  </>
                )}
                {!waiting && !changes && (
                  <button className="btn btn--p" disabled={r.busy} onClick={() => act(r, "publish")} data-testid="agent-res-publish">{t("ag.res.publish")}</button>
                )}
              </div>
            )}
            {r.msg && <div className={r.msg.ok ? "muted ag-res-msg" : "auth-err ag-res-msg"}>{r.msg.t}</div>}
          </div>
        );
      })}
    </div>
  );
}
