"use client";
// A picture field in the block editor: type a path or address as before, upload a file from the computer, or pick one
// already in the Media Library. Shows a small preview of what is set. Used for every image field of a block (an
// item's `image`, a logo, a cover …), so a picture never has to be uploaded somewhere else first and its path copied.
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import MediaLibrary from "./MediaLibrary";

export default function ImageField({ value, onChange, placeholder, t, testId }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  t: (k: string) => string;
  testId?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [picking, setPicking] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true); setErr("");
    try {
      // The engine-aware upload (WordPress or Strapi, scoped to the workspace): the same one the Style panel uses.
      const fd = new FormData();
      fd.append("files", file);
      const r = await fetch("/api/cms/media", { method: "POST", body: fd });
      if (!r.ok) throw new Error(String(r.status));
      const asset = await r.json();
      if (typeof asset?.url === "string" && asset.url) onChange(asset.url); else throw new Error("no url");
    } catch {
      setErr(t("imf.uploadFailed"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="imf" data-testid={testId}>
      <div className="imf-row">
        {value ? <span className="imf-thumb" style={{ backgroundImage: `url("${value.replace(/["\\]/g, "")}")` }} aria-hidden="true" /> : <span className="imf-thumb empty" aria-hidden="true"><Icon name="img" /></span>}
        <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} data-testid={testId ? testId + "-input" : undefined} />
      </div>
      <div className="imf-acts">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} data-testid={testId ? testId + "-upload" : undefined}>
          <Icon name="img" />{busy ? t("cs.uploading") : t("imf.upload")}
        </button>
        <button type="button" onClick={() => setPicking(true)} disabled={busy} data-testid={testId ? testId + "-library" : undefined}>
          <Icon name="grid" />{t("imf.library")}
        </button>
        {value && <button type="button" className="rm" onClick={() => onChange("")} aria-label={t("imf.clear")} title={t("imf.clear")}><Icon name="trash" /></button>}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      {err && <small className="auth-err">{err}</small>}
      {/* On the page itself (not inside the sidebar, whose sticky box would put it under the preview). */}
      {picking && typeof document !== "undefined" && createPortal(
        <>
          <div className="scrim" onClick={() => setPicking(false)} />
          <div className="imf-pick" role="dialog" aria-modal="true" aria-label={t("imf.library")}>
            <div className="imf-pick-h">
              <b>{t("imf.library")}</b>
              <button type="button" className="ic-btn" onClick={() => setPicking(false)} aria-label={t("a11y.close")}><Icon name="close" /></button>
            </div>
            <MediaLibrary onPick={(asset) => { if (asset?.url) onChange(asset.url); setPicking(false); }} />
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
