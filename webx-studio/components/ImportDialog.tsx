"use client";
// Import a CSV / TSV / JSON file into the content type open on the Content page: choose the file, match
// each column to a field (guessed from the column names, changeable), see which rows have problems, then
// create the rest as drafts. The rows are checked here for the preview and again on the server
// (app/api/cms/import), with the same code (lib/importData.ts). Nothing is published.
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import {
  parseTable, guessMapping, recordFromRow, coerceRecord, ImportParseError, MAX_IMPORT_ROWS, IMPORT_CHUNK,
  type ImportField, type Table, type RowError,
} from "@/lib/importData";

const MAX_FILE_BYTES = 5_000_000;
const FILE_RE = /\.(csv|tsv|txt|json)$/i;

type Outcome = { i: number; status: "created" | "skipped" | "error"; message?: string };

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
function downloadCsv(name: string, lines: string[][]) {
  // A BOM so Excel opens the Thai text as UTF-8.
  const blob = new Blob(["﻿" + lines.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function ImportDialog({
  uid, typeName, prepare, onClose, onDone,
}: {
  uid: string;
  typeName: string;
  /** Before rows are sent: the tenant to attach, or a reason the plan's limit blocks it. */
  prepare: (rowCount: number) => Promise<{ tenant?: string | number; blocked?: string }>;
  onClose: () => void;
  /** Called when the user closes the finished import, with how many entries were created. */
  onDone: (created: number) => void;
}) {
  const { t } = useLang();
  const [fields, setFields] = useState<ImportField[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<Table | null>(null);
  const [mapping, setMapping] = useState<string[]>([]);
  const [skipExisting, setSkipExisting] = useState(true);
  const [pickErr, setPickErr] = useState("");
  const [phase, setPhase] = useState<"setup" | "run" | "done">("setup");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const [haltMsg, setHaltMsg] = useState("");
  const stopRef = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/cms/import-fields?uid=" + encodeURIComponent(uid))
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok || !Array.isArray(j.fields) || !j.fields.length) setLoadErr(r.status === 401 ? t("imp.stopAuth") : t("imp.noFields"));
        else setFields(j.fields as ImportField[]);
      })
      .catch(() => live && setLoadErr(t("imp.stopNet")));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const errText = (e: RowError) => t("imp.e." + e.code).replace("{f}", e.field || "—").replace("{d}", e.detail || "");

  // Every row, checked: what would be created, and what is wrong with the others.
  const checked = useMemo(() => {
    if (!table || !fields) return [];
    return table.rows.map((row, i) => {
      const rec = recordFromRow(row, mapping);
      const { errors } = coerceRecord(rec, fields);
      return { i, rec, errors, empty: Object.keys(rec).length === 0 };
    }).filter((r) => !r.empty);
  }, [table, fields, mapping]);
  const ok = checked.filter((r) => r.errors.length === 0);
  const bad = checked.filter((r) => r.errors.length > 0);
  const missingRequired = (fields || []).filter((f) => f.required && !mapping.includes(f.key));

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !fields) return;
    setPickErr("");
    if (!FILE_RE.test(f.name)) { setPickErr(t("imp.badType")); return; }
    if (f.size > MAX_FILE_BYTES) { setPickErr(t("imp.tooBig")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const tb = parseTable(String(reader.result || ""), f.name);
        if (!tb.rows.length) { setPickErr(t("imp.noRows")); return; }
        if (tb.rows.length > MAX_IMPORT_ROWS) { setPickErr(t("imp.tooMany").replace("{n}", String(MAX_IMPORT_ROWS))); return; }
        setTable(tb);
        setMapping(guessMapping(tb.headers, fields));
        setFileName(f.name);
      } catch (err) {
        const code = err instanceof ImportParseError ? err.code : "empty";
        setPickErr(t(code === "badjson" ? "imp.errJson" : code === "nohead" ? "imp.errHead" : "imp.errEmpty"));
      }
    };
    reader.onerror = () => setPickErr(t("imp.errEmpty"));
    reader.readAsText(f); // UTF-8
  }

  function downloadTemplate() {
    if (!fields) return;
    const keys = [...fields].sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required))).map((f) => f.key);
    downloadCsv(uid.replace(/[^\w-]+/g, "-") + "-sample.csv", [keys]);
  }

  async function run() {
    if (!table || !fields || !ok.length) return;
    stopRef.current = false;
    setHaltMsg(""); setOutcomes({}); setPhase("run");
    setProgress({ done: 0, total: ok.length });
    const ctx = await prepare(ok.length).catch(() => ({} as { tenant?: string | number; blocked?: string }));
    if (ctx.blocked) { setHaltMsg(ctx.blocked); setPhase("done"); return; }
    const out: Record<number, Outcome> = {};
    for (let s = 0; s < ok.length; s += IMPORT_CHUNK) {
      if (stopRef.current) { setHaltMsg(t("imp.doneStopped")); break; }
      const part = ok.slice(s, s + IMPORT_CHUNK);
      let res: Response;
      try {
        res = await fetch("/api/cms/import", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid, rows: part.map((r) => r.rec), skipExisting, ...(ctx.tenant !== undefined ? { tenant: ctx.tenant } : {}) }),
        });
      } catch { setHaltMsg(t("imp.stopNet")); break; }
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(j.results)) {
        setHaltMsg(res.status === 401 ? t("imp.stopAuth") : (typeof j.error === "string" ? j.error : t("imp.stopNet")));
        break;
      }
      for (const r of j.results as any[]) {
        const src = part[r.i];
        if (!src) continue;
        out[src.i] = {
          i: src.i, status: r.status,
          message: r.status === "error" ? (r.message || (Array.isArray(r.errors) ? r.errors.map(errText).join("; ") : "")) : undefined,
        };
      }
      setOutcomes({ ...out });
      setProgress({ done: Math.min(s + IMPORT_CHUNK, ok.length), total: ok.length });
    }
    setPhase("done");
  }

  const created = Object.values(outcomes).filter((o) => o.status === "created").length;
  const skipped = Object.values(outcomes).filter((o) => o.status === "skipped").length;
  // Failed: rows the server rejected, plus the rows that were never sent because they had problems.
  const failedRows = useMemo(() => {
    const rows: { i: number; reason: string }[] = [];
    for (const r of bad) rows.push({ i: r.i, reason: r.errors.map(errText).join("; ") });
    for (const o of Object.values(outcomes)) if (o.status === "error") rows.push({ i: o.i, reason: o.message || "" });
    return rows.sort((a, b) => a.i - b.i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bad, outcomes]);

  function downloadFailed() {
    if (!table) return;
    downloadCsv("import-failed.csv", [[...table.headers, t("imp.reason")], ...failedRows.map((r) => [...table.rows[r.i], r.reason])]);
  }

  const close = () => { if (phase === "run") return; if (phase === "done") onDone(created); else onClose(); };

  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="drawer" style={{ width: "min(760px,96vw)" }} data-testid="import-dialog">
        <div className="ovhead">
          <div style={{ flex: 1 }}>
            <h3>{t("imp.title")} {typeName}</h3>
            {fileName && <div className="meta">{fileName}{table ? " · " + t("imp.rowsFound").replace("{n}", String(table.rows.length)) : ""}</div>}
          </div>
          <button className="ic-btn" onClick={close} disabled={phase === "run"} aria-label={t("imp.close")}><Icon name="close" /></button>
        </div>

        <div className="ovbody">
          {loadErr && <div className="auth-err">{loadErr}</div>}
          {!loadErr && !fields && <div className="muted">{t("imp.loading")}</div>}

          {fields && phase === "setup" && !table && (
            <div className="imp-pick">
              <p className="muted">{t("imp.pickHint")}</p>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.json,text/csv,application/json" hidden onChange={onPick} data-testid="import-file-input" />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "14px 0" }}>
                <button className="btn btn--p" onClick={() => fileRef.current?.click()} data-testid="import-pick"><Icon name="up" />{t("imp.pickBtn")}</button>
                <button className="btn btn--g" onClick={downloadTemplate}><Icon name="doc" />{t("imp.template")}</button>
              </div>
              <p className="muted" style={{ fontSize: 12 }}>{t("imp.excelHint")}</p>
              {pickErr && <div className="auth-err">{pickErr}</div>}
            </div>
          )}

          {fields && phase === "setup" && table && (
            <>
              <h4 style={{ margin: "0 0 10px", fontSize: 13.5 }}>{t("imp.mapTitle")}</h4>
              <table className="tbl imp-map">
                <thead><tr><th>{t("imp.colFile")}</th><th>{t("imp.colSample")}</th><th>{t("imp.colField")}</th></tr></thead>
                <tbody>
                  {table.headers.map((h, c) => {
                    const sample = table.rows.map((r) => r[c]).filter((v) => v).slice(0, 2).join(" · ");
                    return (
                      <tr key={c}>
                        <td><b>{h}</b></td>
                        <td className="muted imp-sample" title={sample}>{sample || "—"}</td>
                        <td>
                          <select className="vb-sel" value={mapping[c] || ""} data-testid={"import-map-" + c}
                            onChange={(e) => setMapping((m) => m.map((x, i) => (i === c ? e.target.value : x)))}>
                            <option value="">{t("imp.skipCol")}</option>
                            {fields.map((f) => (
                              <option key={f.key} value={f.key}>{f.key}{f.required ? " · " + t("imp.required") : ""}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {missingRequired.length > 0 && (
                <div className="auth-err" style={{ marginTop: 12 }}>{t("imp.missingReq").replace("{f}", missingRequired.map((f) => f.key).join(", "))}</div>
              )}
              <label className="imp-opt"><input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} /> {t("imp.skipExisting")}</label>
              <p style={{ margin: "12px 0 6px", fontWeight: 600 }} data-testid="import-summary">{t("imp.summary").replace("{ok}", String(ok.length)).replace("{bad}", String(bad.length))}</p>
              {bad.length > 0 && (
                <div className="imp-bad">
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{t("imp.problems")}</div>
                  <ul>
                    {bad.slice(0, 8).map((r) => <li key={r.i}><b>{t("imp.rowN").replace("{n}", String(r.i + 2))}</b> — {r.errors.map(errText).join("; ")}</li>)}
                    {bad.length > 8 && <li className="muted">… +{bad.length - 8}</li>}
                  </ul>
                </div>
              )}
              {pickErr && <div className="auth-err">{pickErr}</div>}
            </>
          )}

          {phase === "run" && (
            <div data-testid="import-running">
              <p>{t("imp.running").replace("{done}", String(progress.done)).replace("{total}", String(progress.total))}</p>
              <div className="imp-bar"><i style={{ width: progress.total ? Math.round((progress.done / progress.total) * 100) + "%" : "0%" }} /></div>
            </div>
          )}

          {phase === "done" && (
            <div data-testid="import-done">
              <h4 style={{ margin: "0 0 8px" }}>{t("imp.doneTitle")}</h4>
              <p style={{ fontWeight: 600 }} data-testid="import-counts">{t("imp.doneCounts").replace("{c}", String(created)).replace("{s}", String(skipped)).replace("{f}", String(failedRows.length))}</p>
              {haltMsg && <div className="auth-err">{haltMsg}</div>}
              {created > 0 && <p className="muted">{t("imp.nextStep")}</p>}
              {failedRows.length > 0 && (
                <div className="imp-bad">
                  <ul>
                    {failedRows.slice(0, 10).map((r) => <li key={r.i}><b>{t("imp.rowN").replace("{n}", String(r.i + 2))}</b> — {r.reason}</li>)}
                    {failedRows.length > 10 && <li className="muted">… +{failedRows.length - 10}</li>}
                  </ul>
                  <button className="btn btn--g" onClick={downloadFailed}><Icon name="doc" />{t("imp.downloadFailed")}</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ovfoot" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          {phase === "setup" && table && (
            <>
              <button className="btn btn--g" onClick={() => { setTable(null); setFileName(""); setMapping([]); setPickErr(""); }}>{t("imp.back")}</button>
              <button className="btn btn--p" onClick={run} disabled={!ok.length || missingRequired.length > 0} data-testid="import-go">
                <Icon name="check" />{t("imp.go").replace("{n}", String(ok.length))}
              </button>
            </>
          )}
          {phase === "run" && <button className="btn btn--g" onClick={() => { stopRef.current = true; }}>{t("imp.stop")}</button>}
          {phase === "done" && <button className="btn btn--p" onClick={close} data-testid="import-close">{t("imp.close")}</button>}
        </div>
      </div>
    </>
  );
}
