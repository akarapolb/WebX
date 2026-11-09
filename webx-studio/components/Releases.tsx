"use client";
import { useEffect, useState, useCallback } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { cms, CmsError } from "@/lib/cms";
import { publicPagePath, publicPageUrl } from "@/lib/publicUrl";

// `path` — where this entry lives on the public site, recorded when the
// release publishes (see resolvePath). Absent for a non-page content type,
// and for anything published before this was added.
type Item = { contentType: string; documentRef: string; title?: string; path?: string };
type Release = { id: number; documentId?: string; name: string; state: string; scheduledAt?: string; publishedAt?: string; items?: Item[]; updatedAt?: string };
const RL_UID = "api::release.release";
const shortType = (c?: string) => (c || "").replace(/^api::/, "").replace(/\.[^.]+$/, "");
// The same env var BlockTypeEditor already reads, with the same dev default —
// the public site is a separate origin, so a stored path has to be joined
// onto it rather than linked relative to the admin.
const PUBLIC_SITE = (process.env.NEXT_PUBLIC_PUBLIC_SITE_URL || "http://localhost:3100").replace(/\/$/, "");

export default function Releases() {
  const { t, lang } = useLang();
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [sched, setSched] = useState<Record<number, string>>({});
  // Everything published by the Publish button (or the agent), not only what went out in a release.
  type Pub = { key: string; contentType: string; id: string; title: string; path: string | null; at?: string; by?: string; agent: boolean };
  const [pubs, setPubs] = useState<Pub[]>([]);

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

  const loadPubs = useCallback(async () => {
    try {
      const { data } = await cms.entries.list<any>("api::audit-log.audit-log", { sort: "createdAt:DESC", pageSize: 80, filter: [{ field: "action", op: "contains", value: "publish" }] });
      const seen = new Set<string>();
      const rows = data.filter((l: any) => /(^|_)publish$/.test(String(l.action || "")) && l.contentType && l.entryId != null)
        .filter((l: any) => { const k = l.contentType + "|" + l.entryId; if (seen.has(k)) return false; seen.add(k); return true; })
        .slice(0, 20);
      const out: Pub[] = await Promise.all(rows.map(async (l: any) => {
        let title = String(l.entryId), path: string | null = null;
        try { const e: any = await cms.entries.get(l.contentType, String(l.entryId)); if (e) { title = e.title || e.name || e.question || title; path = publicPagePath(l.contentType, e); } } catch {}
        return { key: l.contentType + "|" + l.entryId, contentType: l.contentType, id: String(l.entryId), title, path, at: l.at || l.createdAt, by: l.adminEmail, agent: String(l.action).startsWith("agent_") };
      }));
      setPubs(out);
    } catch { /* the list is a convenience; the releases above do not depend on it */ }
  }, []);
  useEffect(() => { loadPubs(); }, [loadPubs]);

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
  /**
   * Where this item can be read on the public site, resolved at publish time
   * because that's the only moment we know it's actually live — and because
   * looking it up here means releases created before this existed still get
   * links the next time they publish, with no backfill.
   *
   * A lookup failure is never allowed to fail the publish: the item has
   * already gone out by this point, and a missing link is a far smaller
   * problem than a release wrongly marked failed.
   */
  async function resolvePath(it: Item): Promise<string | null> {
    try {
      const entry = await cms.entries.get<any>(it.contentType, it.documentRef);
      return publicPagePath(it.contentType, entry);
    } catch { return null; }
  }
  async function publishNow(r: Release) {
    setBusy(r.id); setActionMsg("");
    try {
      // Used to swallow every per-item failure and always mark the release
      // "done" regardless — a release where nothing actually published
      // looked identical in this UI to one that fully succeeded. Now
      // tracked per item, same fix as the scheduler's own processDueReleases.
      const failedItems: string[] = [];
      // Rebuilt rather than mutated so a failed publish leaves the stored
      // items exactly as they were.
      const publishedItems: Item[] = [];
      for (const it of r.items || []) {
        if (!it.contentType || !it.documentRef) { publishedItems.push(it); continue; }
        try {
          await cms.publish.publish(it.contentType, it.documentRef);
          publishedItems.push({ ...it, path: (await resolvePath(it)) ?? it.path });
        } catch (e: any) {
          publishedItems.push(it);
          failedItems.push((it.title || it.documentRef) + (e instanceof CmsError ? `: ${e.message}` : ""));
        }
      }
      if (failedItems.length) {
        await put(r, { state: "failed", note: `${failedItems.length} item(s) failed to publish:\n${failedItems.join("\n")}` });
        setActionMsg(`${failedItems.length} of ${(r.items || []).length} item(s) failed to publish — see the release's note.`);
      } else {
        await put(r, { state: "done", publishedAt: new Date().toISOString(), items: publishedItems });
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
                    {/* Only once it has actually published — a link shown on a
                        draft release would point at content no visitor can see
                        yet. Recorded per item, so a release mixing a page with
                        a collection entry links the page and stays quiet about
                        the rest. */}
                    {r.state === "done" && it.path && (
                      <a className="rl-link" href={publicPageUrl(PUBLIC_SITE, it.path)} target="_blank" rel="noopener noreferrer"
                        title={publicPageUrl(PUBLIC_SITE, it.path)}>
                        <Icon name="eye" />{it.path}
                      </a>
                    )}
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

      {!err && pubs.length > 0 && (
        <div className="rl-card" style={{ marginTop: 14 }} data-testid="recent-publishes">
          <div className="rl-head"><b>{t("rl.recent")}</b><span className="rl-count">{pubs.length}</span></div>
          <p className="muted" style={{ fontSize: 12, margin: "2px 0 8px" }}>{t("rl.recent.sub")}</p>
          <div className="rl-items">
            {pubs.map((p) => (
              <div className="rl-item" key={p.key}>
                <span className="rl-itype mono">{shortType(p.contentType)}</span>
                <span className="rl-ititle">{p.title}</span>
                <span className="muted" style={{ fontSize: 11.5 }}>{fmt(p.at)}{p.by ? " · " + (p.agent ? "agent · " : "") + p.by : ""}</span>
                {p.path && (
                  <a className="rl-link" href={publicPageUrl(PUBLIC_SITE, p.path)} target="_blank" rel="noopener noreferrer" title={publicPageUrl(PUBLIC_SITE, p.path)}>
                    <Icon name="eye" />{p.path}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="notice"><Icon name="calendar" /> {t("rl.note")}</div>
    </>
  );
}
