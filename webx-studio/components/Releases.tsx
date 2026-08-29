"use client";
import { useEffect, useState, useCallback } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { cms, CmsError } from "@/lib/cms";

type Item = { contentType: string; documentRef: string; title?: string };
type Release = { id: number; documentId?: string; name: string; state: string; scheduledAt?: string; publishedAt?: string; items?: Item[]; updatedAt?: string };
const RL_UID = "api::release.release";
const shortType = (c?: string) => (c || "").replace(/^api::/, "").replace(/\.[^.]+$/, "");

export default function Releases() {
  const { t, lang } = useLang();
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [sched, setSched] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data } = await cms.entries.list<Release>(RL_UID, { sort: "updatedAt:DESC", pageSize: 100 });
      setReleases(data);
    } catch (e) {
      if (e instanceof CmsError && e.status === 403) setErr(t("c.noPerm"));
      else if (e instanceof CmsError) setErr("Could not load releases (HTTP " + e.status + ").");
      else setErr("Cannot reach the backend.");
    }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const idOf = (r: Release) => String(r.documentId ?? r.id);
  async function put(r: Release, data: any) {
    await cms.entries.update(RL_UID, idOf(r), data);
  }
  async function create() {
    if (!newName.trim()) return;
    try {
      await cms.entries.create(RL_UID, { name: newName.trim(), state: "draft", items: [] });
      setNewName(""); await load();
    } catch {}
  }
  async function publishNow(r: Release) {
    setBusy(r.id); setActionMsg("");
    try {
      // Used to swallow every per-item failure and always mark the release
      // "done" regardless — a release where nothing actually published
      // looked identical in this UI to one that fully succeeded. Now
      // tracked per item, same fix as the scheduler's own processDueReleases.
      const failedItems: string[] = [];
      for (const it of r.items || []) {
        if (!it.contentType || !it.documentRef) continue;
        try { await cms.publish.publish(it.contentType, it.documentRef); }
        catch (e: any) { failedItems.push((it.title || it.documentRef) + (e instanceof CmsError ? `: ${e.message}` : "")); }
      }
      if (failedItems.length) {
        await put(r, { state: "failed", note: `${failedItems.length} item(s) failed to publish:\n${failedItems.join("\n")}` });
        setActionMsg(`${failedItems.length} of ${(r.items || []).length} item(s) failed to publish — see the release's note.`);
      } else {
        await put(r, { state: "done", publishedAt: new Date().toISOString() });
      }
      await load();
    } catch {} finally { setBusy(null); }
  }
  async function schedule(r: Release) {
    const v = sched[r.id]; if (!v) return;
    setBusy(r.id);
    try { await put(r, { state: "scheduled", scheduledAt: new Date(v).toISOString() }); await load(); } catch {} finally { setBusy(null); }
  }
  async function unschedule(r: Release) { setBusy(r.id); try { await put(r, { state: "draft", scheduledAt: null }); await load(); } catch {} finally { setBusy(null); } }
  async function removeItem(r: Release, idx: number) { setBusy(r.id); const items = (r.items || []).filter((_, i) => i !== idx); try { await put(r, { items }); await load(); } catch {} finally { setBusy(null); } }
  async function del(r: Release) { setBusy(r.id); try { await cms.entries.remove(RL_UID, idOf(r)); await load(); } catch {} finally { setBusy(null); } }

  const fmt = (iso?: string) => { if (!iso) return ""; try { return new Date(iso).toLocaleString(lang === "th" ? "th-TH" : "en-GB", { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; } };
  const stBadge = (s: string) => (s === "done" ? "b-ok" : s === "failed" ? "b-warn" : s === "scheduled" ? "b-acc" : "b-mut");

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.releases")}</h1><p>{t("rl.sub")}</p></div>
        <div className="vh-act">
          <input className="vb-sel" style={{ minWidth: 180 }} placeholder={t("rl.newname")} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
          <button className="btn btn--p" onClick={create} disabled={!newName.trim()}><Icon name="plus" />{t("rl.new")}</button>
        </div>
      </div>

      {err && <div className="panel"><span className="badge b-warn"><span className="dot" />!</span><span className="muted" style={{ marginLeft: 10 }}>{err}</span></div>}
      {!err && actionMsg && <div className="panel"><span className="badge b-warn"><span className="dot" />!</span><span className="muted" style={{ marginLeft: 10 }}>{actionMsg}</span></div>}

      {!err && (
        <div className="rl-list">
          {!loading && releases.length === 0 && <div className="muted" style={{ padding: 16 }}>{t("rl.empty")}</div>}
          {releases.map((r) => (
            <div className="rl-card" key={r.id}>
              <div className="rl-head">
                <b>{r.name}</b>
                <span className={"badge " + stBadge(r.state)}><span className="dot" />{t("rl.s_" + r.state)}</span>
                {r.state === "scheduled" && r.scheduledAt ? <span className="muted" style={{ fontSize: 12 }}>· {fmt(r.scheduledAt)}</span> : null}
                {r.state === "done" && r.publishedAt ? <span className="muted" style={{ fontSize: 12 }}>· {fmt(r.publishedAt)}</span> : null}
                <span className="rl-count">{(r.items || []).length} {t("rl.items")}</span>
              </div>
              <div className="rl-items">
                {(r.items || []).length === 0 && <div className="muted" style={{ fontSize: 12, padding: "2px 0 4px" }}>{t("rl.noitems")}</div>}
                {(r.items || []).map((it, i) => (
                  <div className="rl-item" key={i}>
                    <span className="rl-itype mono">{shortType(it.contentType)}</span>
                    <span className="rl-ititle">{it.title || it.documentRef}</span>
                    {r.state !== "done" && <button className="rl-x" onClick={() => removeItem(r, i)} aria-label="remove">×</button>}
                  </div>
                ))}
              </div>
              {r.state !== "done" && (
                <div className="rl-actions">
                  <button className="btn btn--p" disabled={busy === r.id || (r.items || []).length === 0} onClick={() => publishNow(r)}><Icon name="spark" />{t("rl.publishnow")}</button>
                  <input type="datetime-local" className="rl-dt" value={sched[r.id] ?? ""} onChange={(e) => setSched((s) => ({ ...s, [r.id]: e.target.value }))} />
                  {r.state === "scheduled"
                    ? <button className="btn btn--g" disabled={busy === r.id} onClick={() => unschedule(r)}>{t("rl.cancelsched")}</button>
                    : <button className="btn btn--g" disabled={busy === r.id || !sched[r.id]} onClick={() => schedule(r)}><Icon name="calendar" />{t("rl.schedule")}</button>}
                  <button className="btn btn--g" style={{ marginLeft: "auto" }} disabled={busy === r.id} onClick={() => del(r)} aria-label="delete"><Icon name="trash" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="notice"><Icon name="calendar" /> {t("rl.note")}</div>
    </>
  );
}
