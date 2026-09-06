"use client";
// Structured editor for tenant.footerColumns — a plain JSON blob field
// (strapi-cms/src/api/tenant/content-types/tenant/schema.json), same
// "treat it as an opaque blob, PUT the whole thing" precedent Branding.tsx
// already established for brand/template/watermark/liveChat. Up/down
// buttons for reordering (not drag-and-drop) — this is a two-level nested
// structure (columns containing links), where robust nested DnD is more
// failure-prone to build well than the effort justifies here.
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";

type Link = { label: { th?: string; en?: string }; url?: string };
type Column = { heading: { th?: string; en?: string }; links: Link[] };

function move<T>(arr: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const n = arr.slice();
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}

export default function FooterEditor({ tenantKey }: { tenantKey?: string }) {
  const { t } = useLang();
  const [cols, setCols] = useState<Column[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const j = await fetch("/api/strapi/api/console/context").then((r) => (r.ok ? r.json() : null));
        const list = j?.tenants ?? j?.data?.tenants ?? [];
        const tn = list.find((x: any) => x.key === tenantKey) ?? list[0];
        setCols(Array.isArray(tn?.footerColumns) ? tn.footerColumns : []);
      } catch {}
    })();
  }, [tenantKey]);

  function addCol() { setCols((c) => [...c, { heading: { th: "" }, links: [] }]); }
  function rmCol(i: number) { setCols((c) => c.filter((_, k) => k !== i)); }
  function setHeading(i: number, th: string) { setCols((c) => c.map((col, k) => (k === i ? { ...col, heading: { ...col.heading, th } } : col))); }
  function addLink(i: number) { setCols((c) => c.map((col, k) => (k === i ? { ...col, links: [...col.links, { label: { th: "" }, url: "" }] } : col))); }
  function rmLink(i: number, j: number) { setCols((c) => c.map((col, k) => (k === i ? { ...col, links: col.links.filter((_, l) => l !== j) } : col))); }
  function setLink(i: number, j: number, patch: Partial<Link>) {
    setCols((c) => c.map((col, k) => (k === i ? { ...col, links: col.links.map((ln, l) => (l === j ? { ...ln, ...patch, label: patch.label ? { ...ln.label, ...patch.label } : ln.label } : ln)) } : col)));
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/strapi/api/console/branding" + (tenantKey ? "?tenant=" + encodeURIComponent(tenantKey) : ""), {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ footerColumns: cols }),
      });
      setMsg(r.ok ? { t: t("ft.saved"), ok: true } : { t: "Save failed (HTTP " + r.status + ")", ok: false });
      if (r.ok) fetch("/api/cms/public-site/rebuild", { method: "POST" }).catch(() => {});
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-h">
          <div><h3>{t("br.tab_footer")}</h3><span className="sub">{t("ft.sub")}</span></div>
          <button className="btn btn--p" onClick={save} disabled={saving}><Icon name="save" />{saving ? t("ft.saving") : t("ft.save")}</button>
        </div>
        {msg && <div style={{ marginBottom: 10 }}><span className={"toast-in " + (msg.ok ? "ok" : "bad")}>{msg.t}</span></div>}

        {cols.length === 0 && <div className="muted" style={{ padding: 12 }}>{t("ft.empty")}</div>}

        {cols.map((col, i) => (
          <div key={i} className="panel" style={{ marginBottom: 12, background: "var(--sunk)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div className="fld" style={{ flex: 1, margin: 0 }}>
                <label>{t("ft.heading")}</label>
                <input value={col.heading?.th || ""} onChange={(e) => setHeading(i, e.target.value)} placeholder="สำหรับประชาชน" />
              </div>
              <button className="ic-btn" title="Up" onClick={() => setCols((c) => move(c, i, -1))} disabled={i === 0}><Icon name="chevron-up" /></button>
              <button className="ic-btn" title="Down" onClick={() => setCols((c) => move(c, i, 1))} disabled={i === cols.length - 1}><Icon name="chevron-down" /></button>
              <button className="ic-btn" style={{ color: "var(--bad)" }} onClick={() => rmCol(i)}><Icon name="trash" /></button>
            </div>

            {col.links.map((ln, j) => (
              <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input style={{ flex: 1, background: "var(--panel)", border: "1px solid var(--line2)", borderRadius: 9, padding: "9px 11px", fontSize: 13, color: "var(--ink)" }}
                  value={ln.label?.th || ""} onChange={(e) => setLink(i, j, { label: { th: e.target.value } })} placeholder={t("ft.linklabel")} />
                <input style={{ flex: 1, background: "var(--panel)", border: "1px solid var(--line2)", borderRadius: 9, padding: "9px 11px", fontSize: 13, color: "var(--ink)" }}
                  value={ln.url || ""} onChange={(e) => setLink(i, j, { url: e.target.value })} placeholder={t("ft.linkurl")} />
                <button className="ic-btn" title="Up" onClick={() => setCols((c) => c.map((cc, k) => (k === i ? { ...cc, links: move(cc.links, j, -1) } : cc)))} disabled={j === 0}><Icon name="chevron-up" /></button>
                <button className="ic-btn" title="Down" onClick={() => setCols((c) => c.map((cc, k) => (k === i ? { ...cc, links: move(cc.links, j, 1) } : cc)))} disabled={j === col.links.length - 1}><Icon name="chevron-down" /></button>
                <button className="ic-btn" style={{ color: "var(--bad)" }} onClick={() => rmLink(i, j)}><Icon name="trash" /></button>
              </div>
            ))}
            <button className="vb-add-btn" onClick={() => addLink(i)}><Icon name="plus" />{t("ft.addlink")}</button>
          </div>
        ))}

        <button className="vb-add-btn" onClick={addCol}><Icon name="plus" />{t("ft.addcol")}</button>
      </div>
    </>
  );
}
