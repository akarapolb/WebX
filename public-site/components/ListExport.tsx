"use client";
// Real "export this list" affordance (TOR gap audit) — every table's
// "ดาวน์โหลด" (download) column was plain, unclickable text (not even
// href="#"), and no listing anywhere could be exported or printed. Shared
// by both tenants' TableBlock (templates/{orst,royalsociety}/Blocks.tsx).
//
// TOR wording asks for PDF/DOC/TXT/TIFF/JPEG specifically (plus CSV was
// added here as a genuinely useful bonus, not a TOR line item). Format
// choices, one at a time:
//
// "PDF" opens a new window containing only this table, styled for print,
// and calls window.print() on it — the browser's own "Save as PDF" print
// destination — rather than drawing a PDF with a library (jsPDF's built-in
// fonts don't support Thai script at all; embedding a real Thai font adds a
// large base64 asset and font-encoding risk for no benefit over just using
// the browser's own text rendering, which already gets Thai right for free).
//
// "DOC" reuses that same styled HTML, saved with a .doc extension and an
// application/msword MIME type plus the Office XML namespaces in <html> —
// the standard, decades-old "Export to Word" technique: Word opens HTML
// given a .doc extension as a real, editable document. No library, and
// Word's own HTML-rendering already gets Thai text right.
//
// "TXT" is a plain UTF-8 text rendering (fixed-width-ish, pipe-separated) —
// no library needed.
//
// "JPEG"/"TIFF" are genuine raster images of the table, not just an icon —
// drawn onto an offscreen <canvas> (renderTableCanvas below), with real
// word-wrapping per cell so long Thai/English text doesn't get clipped.
// JPEG uses the browser's own native canvas.toBlob('image/jpeg') (no
// library). TIFF has no browser-native encoder at all (Canvas only emits
// PNG/JPEG/WebP), so this is the one format here that does add a small
// dependency (`utif`, MIT-licensed, ~60KB, pure JS, no native bindings) —
// unlike jsPDF's Thai problem, there's no equivalent workaround for TIFF,
// so a small well-vetted encoder is the right tool rather than skipping it.
//
// "CSV" is a real data export of the exact same rows, useful for anyone who
// wants the raw data rather than a printable/viewable page.
import { useCallback } from "react";
import UTIF from "utif";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeCsvCell(s: string): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function tableHtml(title: string, columns: string[], rows: string[][]): string {
  const theadHtml = `<tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
  const tbodyHtml = rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
  return (
    `<h1>${escapeHtml(title)}</h1><table><thead>${theadHtml}</thead><tbody>${tbodyHtml}</tbody></table>`
  );
}

const TABLE_CSS = `
  body{font-family:'Noto Sans Thai','Sarabun','IBM Plex Sans Thai',sans-serif;padding:32px;color:#1a1a1a}
  h1{font-size:1.25rem;margin:0 0 20px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #ccc;padding:8px 12px;text-align:left;font-size:.92rem;vertical-align:top}
  th{background:#f2f2f2}
  @media print{body{padding:0}}
`;

// Wraps `text` to fit within `maxWidth` px using `ctx`'s current font,
// breaking at a space when one is near the limit and falling back to a
// hard character break otherwise — safe for Thai (no reliable word spaces)
// and Latin text alike, never splitting a single character in half.
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [""];
  const lines: string[] = [];
  let line = "";
  for (const ch of text) {
    const candidate = line + ch;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      const lastSpace = line.lastIndexOf(" ");
      if (lastSpace > 0 && lastSpace > line.length - 20) {
        lines.push(line.slice(0, lastSpace));
        line = line.slice(lastSpace + 1) + ch;
      } else {
        lines.push(line);
        line = ch;
      }
    } else {
      line = candidate;
    }
  }
  lines.push(line);
  return lines;
}

const CELL_PAD = 10;
const LINE_HEIGHT = 20;
const FONT = "14px 'IBM Plex Sans Thai','Noto Sans Thai',sans-serif";
const HEADER_FONT = "bold 14px 'IBM Plex Sans Thai','Noto Sans Thai',sans-serif";
const CANVAS_WIDTH = 1200;

/** Renders `title`/`columns`/`rows` onto a real <canvas>, with per-cell word
 * wrapping and dynamically-sized row heights, for the JPEG/TIFF exports. */
function renderTableCanvas(title: string, columns: string[], rows: string[][]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const margin = 24;
  const titleHeight = 40;
  const tableWidth = CANVAS_WIDTH - margin * 2;
  const colWidth = tableWidth / columns.length;
  const cellTextWidth = colWidth - CELL_PAD * 2;

  // Pass 1: measure wrapped lines per cell (header + every row) so total
  // canvas height (and each row's own height) is known before drawing.
  ctx.font = HEADER_FONT;
  const headerLines = columns.map((c) => wrapText(ctx, c, cellTextWidth));
  const headerHeight = Math.max(...headerLines.map((l) => l.length)) * LINE_HEIGHT + CELL_PAD * 2;

  ctx.font = FONT;
  const rowLines = rows.map((r) => r.map((cell) => wrapText(ctx, cell, cellTextWidth)));
  const rowHeights = rowLines.map((cells) => Math.max(1, ...cells.map((l) => l.length)) * LINE_HEIGHT + CELL_PAD * 2);
  const totalHeight = margin * 2 + titleHeight + headerHeight + rowHeights.reduce((a, b) => a + b, 0);

  canvas.width = CANVAS_WIDTH;
  canvas.height = Math.ceil(totalHeight);

  // Pass 2: actually draw. White background first — a transparent canvas
  // would encode as black in JPEG (no alpha channel).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "bold 18px 'IBM Plex Sans Thai','Noto Sans Thai',sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(title, margin, margin);

  let y = margin + titleHeight;
  function drawRow(cellsLines: string[][], height: number, font: string, bg: string) {
    ctx.fillStyle = bg;
    ctx.fillRect(margin, y, tableWidth, height);
    ctx.strokeStyle = "#cccccc";
    ctx.font = font;
    ctx.fillStyle = "#1a1a1a";
    cellsLines.forEach((lines, i) => {
      const x = margin + i * colWidth;
      ctx.strokeRect(x, y, colWidth, height);
      lines.forEach((line, li) => ctx.fillText(line, x + CELL_PAD, y + CELL_PAD + li * LINE_HEIGHT));
    });
    y += height;
  }
  drawRow(headerLines, headerHeight, HEADER_FONT, "#f2f2f2");
  rowLines.forEach((cellsLines, i) => drawRow(cellsLines, rowHeights[i], FONT, "#ffffff"));

  return canvas;
}

export default function ListExport({ title, columns, rows, className = "" }: { title: string; columns: string[]; rows: string[][]; className?: string }) {
  const exportPdf = useCallback(() => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return; // popup blocked — fail quietly, same convention as ShareButtons' clipboard catch
    win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${TABLE_CSS}</style></head><body>${tableHtml(title, columns, rows)}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }, [title, columns, rows]);

  const exportDoc = useCallback(() => {
    // The Office XML namespaces on <html> are what makes Word treat this as
    // a native document (correct page margins/paragraph styles) rather than
    // just embedding raw HTML — the standard "Export to Word" technique.
    const html =
      `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
      `<head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${TABLE_CSS}</style></head>` +
      `<body>${tableHtml(title, columns, rows)}</body></html>`;
    downloadBlob(new Blob([html], { type: "application/msword" }), title + ".doc");
  }, [title, columns, rows]);

  const exportTxt = useCallback(() => {
    const widths = columns.map((c, i) => Math.max(c.length, ...rows.map((r) => (r[i] || "").length)));
    const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
    const lines = [
      columns.map((c, i) => pad(c, widths[i])).join(" | "),
      widths.map((w) => "-".repeat(w)).join("-+-"),
      ...rows.map((r) => r.map((c, i) => pad(c || "", widths[i])).join(" | ")),
    ];
    downloadBlob(new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" }), title + ".txt");
  }, [title, columns, rows]);

  const exportCsv = useCallback(() => {
    const lines = [columns.map(escapeCsvCell).join(","), ...rows.map((r) => r.map(escapeCsvCell).join(","))];
    // BOM so Excel opens Thai text as UTF-8 instead of the system codepage —
    // String.fromCharCode rather than a literal char in source, so the byte
    // value is unambiguous regardless of this file's own save encoding.
    const csv = String.fromCharCode(0xfeff) + lines.join("\r\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), title + ".csv");
  }, [title, columns, rows]);

  const exportJpeg = useCallback(() => {
    const canvas = renderTableCanvas(title, columns, rows);
    canvas.toBlob((blob) => { if (blob) downloadBlob(blob, title + ".jpg"); }, "image/jpeg", 0.92);
  }, [title, columns, rows]);

  const exportTiff = useCallback(() => {
    const canvas = renderTableCanvas(title, columns, rows);
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const tiff = UTIF.encodeImage(new Uint8Array(imageData.data.buffer), canvas.width, canvas.height);
    downloadBlob(new Blob([tiff], { type: "image/tiff" }), title + ".tiff");
  }, [title, columns, rows]);

  if (!rows.length) return null;

  return (
    <div className={"wx-export " + className}>
      <button type="button" className="wx-export-btn" onClick={exportPdf}>พิมพ์ / บันทึกเป็น PDF</button>
      <button type="button" className="wx-export-btn" onClick={exportDoc}>ดาวน์โหลด DOC</button>
      <button type="button" className="wx-export-btn" onClick={exportTxt}>ดาวน์โหลด TXT</button>
      <button type="button" className="wx-export-btn" onClick={exportCsv}>ดาวน์โหลด CSV</button>
      <button type="button" className="wx-export-btn" onClick={exportJpeg}>ดาวน์โหลด JPEG</button>
      <button type="button" className="wx-export-btn" onClick={exportTiff}>ดาวน์โหลด TIFF</button>
    </div>
  );
}
