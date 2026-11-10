"use client";
// Real centralized media library (TOR gap — search/tag/reuse/crop/caption).
// Before this, every image field in the app was a bare
// `<input type="file">` — upload a new file every time, no way to browse or
// reuse a previously-uploaded asset, no caption/alt-text/tag editing
// anywhere, and (found while building this) uploads had no tenant scoping
// at all — see lib/cms/governance.ts's media wrapper and strapi-cms/src/
// api/media-meta for the backend half of that fix.
//
// Two modes from one component: standalone management page (this file's
// own /media route) and an embeddable picker (`onPick` prop) other screens
// can reuse for "browse library" instead of only ever uploading fresh —
// see VisualBuilder.tsx's image block for the first such integration.
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { cms, CmsError } from "@/lib/cms";
import type { MediaAsset } from "@/lib/cms";

const PAGE_SIZE = 24;

export default function MediaLibrary({ onPick }: { onPick?: (asset: MediaAsset) => void }) {
  const { t } = useLang();
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<MediaAsset | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Picking several files to delete at once (management page only, not the picker): the tick in a card's corner,
  // Shift-click for a run, Ctrl/Cmd-click on a card. While some are picked, a click on a card ticks it too.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const lastTick = useRef<number>(-1);
  const [deleting, setDeleting] = useState<{ done: number; of: number } | null>(null);
  const keyOf = (a: MediaAsset) => a.documentId ?? String(a.id);
  function tick(index: number, range: boolean) {
    // Read where the run starts now: the updater below may run after lastTick has moved on.
    const from = lastTick.current;
    setPicked((prev) => {
      const next = new Set(prev);
      const k = keyOf(items[index]);
      const on = !prev.has(k);
      if (range && from >= 0) {
        const [a, b] = [Math.min(from, index), Math.max(from, index)];
        for (let j = a; j <= b; j++) next.add(keyOf(items[j]));
      } else if (on) next.add(k); else next.delete(k);
      return next;
    });
    lastTick.current = index;
  }
  async function deletePicked() {
    const list = items.filter((a) => picked.has(keyOf(a)));
    if (!list.length) return;
    if (!window.confirm(t("ml.confirmMany").replace("{n}", String(list.length)))) return;
    setMsg(null);
    setDeleting({ done: 0, of: list.length });
    const gone: string[] = [], failed: string[] = [];
    // A few at a time: quick, without flooding the CMS.
    for (let k = 0; k < list.length; k += 4) {
      await Promise.all(list.slice(k, k + 4).map(async (a) => {
        try { await cms.media.remove(keyOf(a)); gone.push(keyOf(a)); } catch { failed.push(a.name || keyOf(a)); }
        setDeleting((d) => (d ? { ...d, done: d.done + 1 } : d));
      }));
    }
    setItems((all) => all.filter((a) => !gone.includes(keyOf(a))));
    setTotal((n) => Math.max(0, n - gone.length));
    setPicked(new Set(failed.length ? list.filter((a) => !gone.includes(keyOf(a))).map(keyOf) : []));
    setDeleting(null);
    setMsg(failed.length
      ? { t: t("ml.deletedSome").replace("{n}", String(gone.length)).replace("{f}", String(failed.length)), ok: false }
      : { t: t("ml.deletedMany").replace("{n}", String(gone.length)), ok: true });
  }

  const load = useCallback(async (opts: { search: string; page: number; append?: boolean }) => {
    setLoading(true);
    try {
      const res = await cms.media.list({ search: opts.search || undefined, page: opts.page, pageSize: PAGE_SIZE });
      setItems((prev) => (opts.append ? [...prev, ...res.data] : res.data));
      setTotal(res.total);
      setPage(opts.page);
    } catch {
      setMsg({ t: "Cannot reach the backend.", ok: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load({ search: query, page: 1 }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function onSearchChange(v: string) {
    setQuery(v);
    setPicked(new Set()); // a new search shows other files: start the picking again
    lastTick.current = -1;
    load({ search: v, page: 1 });
  }

  async function onUploadFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true); setMsg(null);
    try {
      for (const file of Array.from(files)) await cms.media.upload(file);
      await load({ search: query, page: 1 });
      setMsg({ t: t("ml.saved"), ok: true });
    } catch (e) {
      setMsg({ t: e instanceof CmsError ? "Upload failed (HTTP " + e.status + ")" : "Cannot reach the backend.", ok: false });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function saveEdit(patch: { caption?: string; alt?: string; tags?: string }) {
    if (!editing) return;
    const id = editing.documentId ?? String(editing.id);
    try {
      const updated = await cms.media.update(id, patch);
      setEditing(updated);
      setItems((list) => list.map((it) => (it.id === updated.id ? updated : it)));
      setMsg({ t: t("ml.saved"), ok: true });
    } catch {
      setMsg({ t: "Cannot reach the backend.", ok: false });
    }
  }

  async function deleteAsset(asset: MediaAsset) {
    const id = asset.documentId ?? String(asset.id);
    if (!window.confirm(t("ml.confirmOne").replace("{name}", asset.name || id))) return;
    try {
      await cms.media.remove(id);
      setItems((list) => list.filter((it) => it.id !== asset.id));
      setTotal((n) => Math.max(0, n - 1));
      setEditing(null);
    } catch {
      setMsg({ t: "Cannot reach the backend.", ok: false });
    }
  }

  const fieldStyle = { width: "100%", background: "var(--panel)", border: "1px solid var(--line2)", borderRadius: 9, padding: "9px 11px", fontSize: 13, color: "var(--ink)" } as const;
  const hasMore = items.length < total;

  return (
    <div className="panel">
      <div className="panel-h">
        <div><h3>{t("nav.media")}</h3><span className="sub">{t("ml.sub")}</span></div>
        <button className="btn btn--p" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Icon name="img" />{uploading ? t("ml.uploading") : t("ml.upload")}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => onUploadFiles(e.target.files)} />
      </div>

      {msg && <div style={{ marginBottom: 10 }}><span className={"toast-in " + (msg.ok ? "ok" : "bad")}>{msg.t}</span></div>}

      <input style={{ ...fieldStyle, marginBottom: 14 }} placeholder={t("ml.search")} value={query} onChange={(e) => onSearchChange(e.target.value)} />

      {!onPick && items.length > 0 && (
        <div className={"ml-bar" + (picked.size ? " on" : "")} data-testid="ml-bar">
          {picked.size ? (
            <>
              <b>{t("ml.picked").replace("{n}", String(picked.size))}</b>
              <button type="button" className="btn btn--g" onClick={() => setPicked(new Set(items.map(keyOf)))} disabled={!!deleting} data-testid="ml-pick-all">{t("ml.pickAll").replace("{n}", String(items.length))}</button>
              <button type="button" className="btn btn--g" onClick={() => setPicked(new Set())} disabled={!!deleting}>{t("ml.pickNone")}</button>
              <span style={{ flex: 1 }} />
              <button type="button" className="btn ml-del" onClick={deletePicked} disabled={!!deleting} data-testid="ml-delete-picked">
                <Icon name="trash" />{deleting ? t("ml.deleting").replace("{d}", String(deleting.done)).replace("{n}", String(deleting.of)) : t("ml.deletePicked").replace("{n}", String(picked.size))}
              </button>
            </>
          ) : (
            <span className="muted">{t("ml.pickHint")}</span>
          )}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="muted" style={{ padding: 12 }}>{query ? t("ml.noresults") : t("ml.empty")}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
        {items.map((asset, index) => {
          const on = picked.has(keyOf(asset));
          return (
          <div key={asset.id} className={"ml-card" + (on ? " on" : "")} style={{ position: "relative" }}>
          {!onPick && (
            // A button drawn as a tick box: a real checkbox whose click is cancelled (to read Shift) shows the wrong state.
            <button type="button" role="checkbox" aria-checked={on} className={"ml-tick" + (on ? " on" : "")}
              title={t("ml.pickOne")} aria-label={t("ml.pickOne") + ": " + (asset.name || "")} data-testid={"ml-tick-" + index}
              onClick={(e) => { e.stopPropagation(); tick(index, e.shiftKey); }}>
              {on ? "✓" : ""}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              if (onPick) { onPick(asset); return; }
              // Picking: a click (or Ctrl/Cmd/Shift-click any time) ticks instead of opening the file.
              if (picked.size || e.ctrlKey || e.metaKey || e.shiftKey) { tick(index, e.shiftKey); return; }
              setEditing(asset);
            }}
            style={{
              display: "flex", flexDirection: "column", gap: 6, padding: 8, borderRadius: 10, width: "100%",
              border: "1px solid " + (on ? "var(--accent)" : "var(--line2)"), background: on ? "var(--accent-soft)" : "var(--sunk)", cursor: "pointer", textAlign: "left",
            }}
            data-testid={"ml-card-" + index}
          >
            <div style={{ aspectRatio: "1", borderRadius: 8, overflow: "hidden", background: "var(--panel)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {asset.mime?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={asset.thumbnailUrl || asset.url} alt={asset.alt || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <Icon name="doc" />
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.name}</div>
          </button>
          </div>
          );
        })}
      </div>

      {hasMore && (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button className="btn" onClick={() => load({ search: query, page: page + 1, append: true })} disabled={loading}>
            {t("ml.loadmore")}
          </button>
        </div>
      )}

      {editing && !onPick && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={() => setEditing(null)}>
          <div className="panel" style={{ width: 420, maxWidth: "92vw", background: "var(--bg)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
              <div style={{ width: 96, height: 96, borderRadius: 8, overflow: "hidden", background: "var(--sunk)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {editing.mime?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={editing.thumbnailUrl || editing.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <Icon name="doc" />
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: "block", overflowWrap: "break-word" }}>{editing.name}</strong>
                {editing.width && editing.height && <span className="sub">{editing.width}×{editing.height}</span>}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div className="sub" style={{ marginBottom: 4 }}>{t("ml.caption")}</div>
                <input style={fieldStyle} defaultValue={editing.caption || ""} onBlur={(e) => saveEdit({ caption: e.target.value })} />
              </div>
              <div>
                <div className="sub" style={{ marginBottom: 4 }}>{t("ml.alt")}</div>
                <input style={fieldStyle} defaultValue={editing.alt || ""} onBlur={(e) => saveEdit({ alt: e.target.value })} />
              </div>
              <div>
                <div className="sub" style={{ marginBottom: 4 }}>{t("ml.tags")}</div>
                <input style={fieldStyle} defaultValue={editing.tags || ""} onBlur={(e) => saveEdit({ tags: e.target.value })} />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <button className="ic-btn" style={{ color: "var(--bad)" }} onClick={() => deleteAsset(editing)}>
                <Icon name="trash" />{t("ml.delete")}
              </button>
              <button className="btn" onClick={() => setEditing(null)}>{t("ml.close")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
