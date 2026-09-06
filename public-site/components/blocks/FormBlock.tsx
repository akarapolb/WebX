"use client";
// Public-facing submit/track forms for the 4 write-only content types in
// FORM_FIELD_DEFS. Every existing public form submission in this codebase
// (site/DGA-Website/assets/*.js, ContactInteractive.tsx x2) POSTs directly
// from the browser to Strapi's public REST API — no BFF/API-route layer in
// this app — so this follows the same shape, reusing useCaptcha() as-is.
import { useState, type FormEvent } from "react";
import { useCaptcha, STRAPI } from "@/lib/useCaptcha";
import { FORM_FIELD_DEFS, STAGE_LABELS, todayTH, maskNid, type FormTypeDef } from "@/lib/formFieldDefs";

type Status = "idle" | "sending" | "sent" | "error";

function CopyRef({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="btn btn--ghost" style={{ marginLeft: 8 }}
      onClick={() => { navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
      {copied ? "คัดลอกแล้ว" : "คัดลอก"}
    </button>
  );
}

function CaptchaField({ captcha }: { captcha: { question: string } | null }) {
  return (
    <div className="field field--wide">
      <label htmlFor="fb-captcha">แบบยืนยันตัวตน: {captcha ? captcha.question : "กำลังโหลด…"} *</label>
      <input id="fb-captcha" name="captchaAnswer" type="text" inputMode="numeric" autoComplete="off" required disabled={!captcha} />
    </div>
  );
}

function SubmitForm({ def, tenant, b }: { def: FormTypeDef; tenant: string; b: any }) {
  const { captcha, refreshCaptcha } = useCaptcha();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [anonymous, setAnonymous] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (!captcha) { setStatus("error"); setError("กำลังเตรียมแบบยืนยันตัวตน กรุณาลองใหม่อีกครั้งในอีกสักครู่"); return; }

    const fd = new FormData(form);
    const payload: Record<string, any> = {};
    let file: File | null = null;
    for (const f of def.fields) {
      if (def.isAnonymousToggleable && anonymous && (f.key === "name" || f.key === "email" || f.key === "phone")) continue;
      if (f.kind === "file") { file = (fd.get(f.key) as File) || null; if (file && !file.size) file = null; continue; }
      const raw = fd.get(f.key);
      payload[f.key] = f.kind === "nid" ? maskNid(String(raw || "")) : raw;
    }
    if (def.isAnonymousToggleable) payload.anonymous = anonymous;
    if (def.uid === "api::complaint.complaint" || def.uid === "api::application.application") payload.date = todayTH();
    if (def.uid === "api::registration.registration") payload.verified = false;

    if (file) {
      const fDef = def.fields.find((f) => f.kind === "file");
      if (fDef?.maxFileMB && file.size > fDef.maxFileMB * 1024 * 1024) {
        setStatus("error"); setError(`ไฟล์ต้องมีขนาดไม่เกิน ${fDef.maxFileMB}MB`); return;
      }
    }

    setStatus("sending"); setError("");
    try {
      let r: Response;
      if (file && def.submitMultipartEndpoint && def.fileFieldKey) {
        const mp = new FormData();
        mp.append("data", JSON.stringify(payload));
        mp.append("files." + def.fileFieldKey, file, file.name);
        mp.append("captchaId", captcha.id);
        mp.append("captchaAnswer", String(fd.get("captchaAnswer") || ""));
        r = await fetch(`${STRAPI}${def.submitMultipartEndpoint}?tenant=${encodeURIComponent(tenant)}`, { method: "POST", body: mp });
      } else {
        r = await fetch(`${STRAPI}${def.submitEndpoint}?tenant=${encodeURIComponent(tenant)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: payload, captchaId: captcha.id, captchaAnswer: fd.get("captchaAnswer") }),
        });
      }
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        const wrongCaptcha = body?.error?.name === "CaptchaError";
        setStatus("error");
        setError(wrongCaptcha
          ? "คำตอบยืนยันตัวตนไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่"
          : "ไม่สามารถส่งข้อมูลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง");
        void refreshCaptcha();
        return;
      }
      const j = await r.json().catch(() => null);
      setResult(j?.data?.[def.resultKey] || "");
      setStatus("sent");
      form.reset();
      setAnonymous(false);
      void refreshCaptcha();
    } catch {
      setStatus("error");
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
      void refreshCaptcha();
    }
  }

  if (status === "sent") {
    return (
      <div className="fb-note fb-note--success" role="status" aria-live="polite">
        ✓ {b.successMessage || "ส่งข้อมูลเรียบร้อยแล้ว"}
        {def.resultKey !== "id" && result && (
          <div style={{ marginTop: 8 }}>
            {def.resultKey === "username" ? "ชื่อผู้ใช้งาน" : "เลขอ้างอิง"}: <b>{result}</b>
            <CopyRef value={result} />
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate={false}>
      <div className="fb-grid">
        {def.fields.map((f) => {
          if (def.isAnonymousToggleable && anonymous && (f.key === "name" || f.key === "email" || f.key === "phone")) return null;
          const wide = f.kind === "textarea" || f.kind === "select" || f.kind === "file";
          return (
            <div className={"field" + (wide ? " field--wide" : "")} key={f.key}>
              <label htmlFor={"fb-" + f.key}>{f.label}{f.required ? " *" : ""}</label>
              {f.kind === "textarea" ? (
                <textarea id={"fb-" + f.key} name={f.key} className="textarea" required={f.required} />
              ) : f.kind === "select" ? (
                <select id={"fb-" + f.key} name={f.key} className="select" required={f.required} defaultValue="">
                  <option value="" disabled>— เลือก —</option>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.kind === "file" ? (
                <>
                  <input id={"fb-" + f.key} name={f.key} className="input" type="file" />
                  {f.maxFileMB && <small className="field__hint">ขนาดไม่เกิน {f.maxFileMB}MB</small>}
                </>
              ) : f.kind === "nid" ? (
                <input id={"fb-" + f.key} name={f.key} className="input" type="text" inputMode="numeric" maxLength={13}
                  pattern="\d{13}" title="กรอกเลขประจำตัวประชาชน 13 หลัก" required={f.required} />
              ) : (
                <input id={"fb-" + f.key} name={f.key} className="input" type={f.kind} required={f.required} />
              )}
            </div>
          );
        })}
        {def.isAnonymousToggleable && (
          <label className="fb-consent field--wide">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> ไม่ประสงค์ออกนาม
          </label>
        )}
        <CaptchaField captcha={captcha} />
      </div>
      <label className="fb-consent"><input type="checkbox" required /> {b.consentText}</label>
      {status === "error" && <p className="fb-note fb-note--error" role="alert">⚠ {error}</p>}
      <button className="btn btn--primary" type="submit" disabled={status === "sending"}>
        {status === "sending" ? "กำลังส่ง…" : (b.submitLabel || "ส่งข้อมูล")}
      </button>
    </form>
  );
}

function TrackForm({ def, tenant, heading }: { def: FormTypeDef; tenant: string; heading?: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "found" | "notfound" | "error">("idle");
  const [rec, setRec] = useState<any>(null);

  async function handleTrack(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ref = String(new FormData(e.currentTarget).get("ref") || "").trim();
    if (!ref || !def.trackEndpoint) return;
    setStatus("loading");
    try {
      const r = await fetch(`${STRAPI}${def.trackEndpoint.replace(":ref", encodeURIComponent(ref))}?tenant=${encodeURIComponent(tenant)}`, {
        headers: { Accept: "application/json" },
      });
      if (r.status === 404) { setStatus("notfound"); return; }
      if (!r.ok) { setStatus("error"); return; }
      const j = await r.json();
      setRec(j?.data || null);
      setStatus("found");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div>
      <form onSubmit={handleTrack} className="fb-grid">
        <div className="field field--wide">
          <label htmlFor="fb-track-ref">เลขอ้างอิง</label>
          <input id="fb-track-ref" name="ref" className="input" placeholder="DGA-XXX-YYYY-NNNNNN" required />
        </div>
        <button className="btn btn--primary" type="submit" disabled={status === "loading"}>
          {status === "loading" ? "กำลังค้นหา…" : "ติดตามสถานะ"}
        </button>
      </form>
      {status === "notfound" && <p className="fb-note fb-note--error">ไม่พบข้อมูลตามเลขอ้างอิงนี้</p>}
      {status === "error" && <p className="fb-note fb-note--error">ไม่สามารถตรวจสอบสถานะได้ในขณะนี้</p>}
      {status === "found" && rec && (
        <div className="fb-track-result">
          <p><b>{rec.ref}</b> — {rec.type || rec.position}</p>
          {rec.date && <p className="fb-note">วันที่ยื่นเรื่อง: {rec.date}</p>}
          <div className="fb-stage-row">
            {STAGE_LABELS.map((label, i) => (
              <span key={i} className={"badge " + (i === rec.stage ? "badge--success fb-stage-badge--active" : "badge--neutral")}>{label}</span>
            ))}
          </div>
          {Array.isArray(rec.steps) && rec.steps.length > 0 && (
            <ul className="fb-steps">
              {rec.steps.map((s: any, i: number) => <li key={i}>{s.t || s.time || ""} — {s.d || s.detail || ""}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function FormBlock({ b, tenant }: { b: any; tenant: string }) {
  const def = FORM_FIELD_DEFS[b.contentTypeUid];
  if (!def) return null;
  const mode = b.mode === "track" && def.hasTracking ? "track" : "submit";
  return (
    <section className="block fb-block">
      {b.heading && <h2 className="fb-heading">{b.heading}</h2>}
      {mode === "track" ? <TrackForm def={def} tenant={tenant} heading={b.heading} /> : <SubmitForm def={def} tenant={tenant} b={b} />}
    </section>
  );
}
