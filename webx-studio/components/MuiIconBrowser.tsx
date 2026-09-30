"use client";
// Browse the Material icon set (@mui/icons-material) and pick one.
//
// The catalogue itself never reaches the browser: /api/icons/mui searches it
// server-side and returns a page of matches with just those icons' path data.
// Picking one hands its markup back to the caller, which stores it on a single
// Icon record — so a page only ever carries the icons it actually uses, rather
// than the sprite every page inlines growing by two thousand glyphs.
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";

export type MuiPick = { name: string; svg: string; viewBox: string };
type Row = { name: string; svg: string };

export default function MuiIconBrowser({ onPick, onClose }: { onPick: (p: MuiPick) => void; onClose: () => void }) {
  const { t } = useLang();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [viewBox, setViewBox] = useState("0 0 24 24");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  // Debounced so typing a word doesn't fire a request per keystroke, and
  // aborted so a slow earlier query can't land after a later one and show
  // results for something the user has already typed past.
  useEffect(() => {
    const ac = new AbortController();
    const id = setTimeout(async () => {
      setLoading(true); setErr(false);
      try {
        const r = await fetch("/api/icons/mui?limit=120&q=" + encodeURIComponent(q), { signal: ac.signal });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        setRows(j.icons || []);
        setViewBox(j.viewBox || "0 0 24 24");
        setTotal(j.total || 0);
      } catch (e: any) {
        if (e?.name !== "AbortError") { setErr(true); setRows([]); }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, q ? 220 : 0);
    return () => { clearTimeout(id); ac.abort(); };
  }, [q]);

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="mib">
      <div className="mib-head">
        <input ref={inputRef} className="mib-q" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t("ic.searchmui")} aria-label={t("ic.searchmui")}
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); }} />
        <button className="ic-btn" onClick={onClose} aria-label={t("c.close")}><Icon name="close" /></button>
      </div>

      {err ? <div className="muted mib-note">{t("ic.muierr")}</div>
        : loading ? <div className="muted mib-note">{t("vb.loading")}</div>
        : rows.length === 0 ? <div className="muted mib-note">{t("ic.nomatch")}</div>
        : (
          <>
            <div className="mib-grid">
              {rows.map((r) => (
                <button key={r.name} className="mib-i" title={r.name}
                  onClick={() => onPick({ name: r.name, svg: r.svg, viewBox })}>
                  <svg viewBox={viewBox} aria-hidden="true" dangerouslySetInnerHTML={{ __html: r.svg }} />
                  <span>{r.name}</span>
                </button>
              ))}
            </div>
            {/* Says so plainly rather than paginating: a search is the way
                through 2,000 icons, and a "load more" would mostly be used to
                scroll past ones nobody wanted. */}
            {total > rows.length && <div className="muted mib-note">{t("ic.more").replace("{n}", String(total - rows.length))}</div>}
          </>
        )}
    </div>
  );
}
