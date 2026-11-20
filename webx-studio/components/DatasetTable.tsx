"use client";
// No-code editor for a Dataset (api::dataset.dataset): the column dictionary
// (`fields`) and the records (`rows`) are JSON in Strapi, which an editor
// should never have to type. This shows them as a spreadsheet-like table:
// edit cells, add/remove rows and columns, name columns in Thai and English,
// or paste a block copied from Excel/Google Sheets (tab- or comma-separated,
// first line = column keys or names) to replace the rows in one go.
import { useState } from "react";
import { useLang } from "./LangProvider";

export type DsField = { key: string; label?: { th?: string; en?: string }; type?: "string" | "number" | "integer"; unit?: string; valueLabels?: Record<string, any> };
export type DsRow = Record<string, any>;

const TYPES: DsField["type"][] = ["string", "number", "integer"];

function coerce(v: string, type?: DsField["type"]): any {
  const s = v.trim();
  if (s === "") return null;
  if (type === "number" || type === "integer") {
    const n = Number(s.replace(/,/g, ""));
    if (!isFinite(n)) return s;
    return type === "integer" ? Math.round(n) : n;
  }
  return s;
}

/** Split pasted spreadsheet text into a grid (tabs win over commas; quotes honoured). */
export function parseGrid(text: string): string[][] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  const sep = lines.some((l) => l.includes("\t")) ? "\t" : ",";
  return lines.map((line) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === sep) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  });
}

export default function DatasetTable({ fields, rows, verified, onChange, readOnly }: {
  fields: DsField[]; rows: DsRow[]; verified: boolean;
  onChange: (next: { fields: DsField[]; rows: DsRow[]; verified: boolean }) => void; readOnly?: boolean;
}) {
  const { t } = useLang();
  const [paste, setPaste] = useState<string | null>(null);
  const [pasteMsg, setPasteMsg] = useState("");
  const set = (f: DsField[], r: DsRow[], v = verified) => onChange({ fields: f, rows: r, verified: v });

  const setCell = (ri: number, key: string, v: string) => {
    const type = fields.find((f) => f.key === key)?.type;
    set(fields, rows.map((r, i) => (i === ri ? { ...r, [key]: coerce(v, type) } : r)));
  };
  const setField = (fi: number, patch: Partial<DsField>) => {
    const old = fields[fi];
    const next = fields.map((f, i) => (i === fi ? { ...f, ...patch } : f));
    // Renaming a key carries every row's value across.
    const r = patch.key !== undefined && patch.key !== old.key
      ? rows.map((row) => { const { [old.key]: v, ...rest } = row; return { ...rest, [patch.key as string]: v }; })
      : rows;
    set(next, r);
  };
  const addRow = () => set(fields, [...rows, Object.fromEntries(fields.map((f) => [f.key, null]))]);
  const delRow = (ri: number) => set(fields, rows.filter((_, i) => i !== ri));
  const addCol = () => {
    let n = fields.length + 1, key = "col" + n;
    while (fields.some((f) => f.key === key)) key = "col" + ++n;
    set([...fields, { key, label: { th: "", en: "" }, type: "string" }], rows.map((r) => ({ ...r, [key]: null })));
  };
  const delCol = (fi: number) => {
    const key = fields[fi].key;
    if (!confirm(t("ds.delcol").replace("{c}", key))) return;
    set(fields.filter((_, i) => i !== fi), rows.map((r) => { const { [key]: _drop, ...rest } = r; return rest; }));
  };
  const applyPaste = () => {
    const grid = parseGrid(paste || "");
    if (grid.length < 2) { setPasteMsg(t("ds.paste.short")); return; }
    const head = grid[0].map((h) => h.trim());
    const match = (h: string) => fields.find((f) => f.key === h || f.label?.th === h || f.label?.en === h);
    const cols: DsField[] = head.map((h, i) => match(h) || { key: h.replace(/\W+/g, "_").toLowerCase() || "col" + (i + 1), label: { th: h, en: h }, type: "string" });
    // Columns that look numeric in every row become numbers.
    cols.forEach((c, i) => {
      if (match(head[i])) return;
      const vals = grid.slice(1).map((r) => (r[i] ?? "").trim()).filter(Boolean);
      if (vals.length && vals.every((v) => isFinite(Number(v.replace(/,/g, ""))))) c.type = vals.every((v) => /^-?\d+$/.test(v)) ? "integer" : "number";
    });
    const keep = fields.filter((f) => !cols.some((c) => c.key === f.key));
    const nextFields = [...cols, ...keep];
    const nextRows = grid.slice(1).map((r) => Object.fromEntries(cols.map((c, i) => [c.key, coerce(r[i] ?? "", c.type)])));
    set(nextFields, nextRows);
    setPaste(null); setPasteMsg(t("ds.paste.done").replace("{n}", String(nextRows.length)));
  };

  const cellStr = (v: any) => (v == null ? "" : String(v));
  return (
    <div className="fld" data-testid="dataset-table">
      <label>{t("ds.title")}</label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 500, margin: "4px 0 10px" }}>
        <input type="checkbox" checked={verified} disabled={readOnly} onChange={(e) => set(fields, rows, e.target.checked)} style={{ width: "auto" }} />
        {t("ds.verified")}
      </label>
      <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 9 }}>
        <table className="ds-grid">
          <thead>
            <tr>
              {fields.map((f, fi) => (
                <th key={fi}>
                  <input aria-label={t("ds.col.th")} placeholder={t("ds.col.th")} value={f.label?.th || ""} disabled={readOnly}
                    onChange={(e) => setField(fi, { label: { ...f.label, th: e.target.value } })} />
                  <input aria-label={t("ds.col.en")} placeholder={t("ds.col.en")} value={f.label?.en || ""} disabled={readOnly}
                    onChange={(e) => setField(fi, { label: { ...f.label, en: e.target.value } })} />
                  <div style={{ display: "flex", gap: 4 }}>
                    <input aria-label={t("ds.col.key")} title={t("ds.col.key")} value={f.key} disabled={readOnly} style={{ fontFamily: "ui-monospace, Consolas, monospace" }}
                      onChange={(e) => setField(fi, { key: e.target.value.replace(/[^\w-]/g, "") })} />
                    <select aria-label={t("ds.col.type")} value={f.type || "string"} disabled={readOnly} onChange={(e) => setField(fi, { type: e.target.value as DsField["type"] })}>
                      {TYPES.map((ty) => <option key={ty} value={ty}>{t("ds.type." + ty)}</option>)}
                    </select>
                    {!readOnly && <button type="button" className="ds-x" aria-label={t("ds.delcol.btn")} title={t("ds.delcol.btn")} onClick={() => delCol(fi)}>×</button>}
                  </div>
                </th>
              ))}
              <th style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {fields.map((f) => (
                  <td key={f.key}>
                    <input value={cellStr(r[f.key])} disabled={readOnly} inputMode={f.type === "string" ? undefined : "decimal"}
                      aria-label={(f.label?.th || f.key) + " " + (ri + 1)} onChange={(e) => setCell(ri, f.key, e.target.value)}
                      style={f.type !== "string" ? { textAlign: "right" } : undefined} />
                  </td>
                ))}
                <td>{!readOnly && <button type="button" className="ds-x" aria-label={t("ds.delrow")} title={t("ds.delrow")} onClick={() => delRow(ri)}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button type="button" className="btn btn--g" onClick={addRow}>+ {t("ds.addrow")}</button>
          <button type="button" className="btn btn--g" onClick={addCol}>+ {t("ds.addcol")}</button>
          <button type="button" className="btn btn--g" onClick={() => { setPaste(""); setPasteMsg(""); }}>{t("ds.paste")}</button>
          <span className="muted" style={{ alignSelf: "center", fontSize: 12 }}>{t("ds.count").replace("{n}", String(rows.length))}</span>
        </div>
      )}
      {pasteMsg && <div className="muted" style={{ fontSize: 12, marginTop: 6 }} role="status">{pasteMsg}</div>}
      {paste !== null && (
        <div style={{ marginTop: 8 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{t("ds.paste.hint")}</div>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} style={{ minHeight: 120, fontFamily: "ui-monospace, Consolas, monospace", fontSize: 12 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button type="button" className="btn btn--p" onClick={applyPaste}>{t("ds.paste.apply")}</button>
            <button type="button" className="btn btn--g" onClick={() => setPaste(null)}>{t("ds.paste.cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
