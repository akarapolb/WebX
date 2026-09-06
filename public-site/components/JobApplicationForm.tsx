"use client";
// Real job-application e-form (TOR gap audit — orst/royalsociety had no job
// listings or application form anywhere on the public site, even though the
// backend content types (api::job.job / api::application.application) —
// including a real "track your application by reference number" flow and a
// resume field — already existed for gov-portal and were sitting unused).
// Same captcha-guarded public-write pattern as ContactInteractive.tsx.
//
// Resume upload is deliberately NOT wired up here: `application.resume` is
// an optional media field, but attaching a real file would require granting
// the Public role Strapi's `plugin::upload.content-api.upload` action —
// letting ANY anonymous visitor POST arbitrary files to the server, a much
// broader capability than this one form, and a real attack-surface decision
// that shouldn't be made silently as a side effect of one feature. Left for
// a deliberate follow-up if the org wants it; a citizen without a resume
// attachment can still apply — the field is optional in the schema.
import { useState, type FormEvent } from "react";
import { useCaptcha, STRAPI } from "@/lib/useCaptcha";
import type { JobPosting } from "@/lib/cms";

type Status = "idle" | "sending" | "sent" | "error";

function refNumber(tenant: string): string {
  const now = new Date();
  return `${tenant.toUpperCase()}-APP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${Math.floor(Math.random() * 900000 + 100000)}`;
}

export default function JobApplicationForm({ tenant, jobs }: { tenant: string; jobs: JobPosting[] }) {
  const { captcha, refreshCaptcha } = useCaptcha();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [ref, setRef] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (!captcha) {
      setStatus("error");
      setError("กำลังเตรียมแบบยืนยันตัวตน กรุณาลองใหม่อีกครั้งในอีกสักครู่");
      return;
    }
    const fd = new FormData(form);
    const jobId = String(fd.get("jobId") || "");
    const position = jobs.find((j) => j.jobId === jobId)?.title || jobId;
    const newRef = refNumber(tenant);
    setStatus("sending");
    setError("");
    try {
      const r = await fetch(`${STRAPI}/api/applications?tenant=${encodeURIComponent(tenant)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            ref: newRef, jobId, position,
            name: fd.get("name"), email: fd.get("email"), phone: fd.get("phone") || undefined,
            note: fd.get("note") || undefined, stage: 0, date: new Date().toISOString(),
          },
          captchaId: captcha.id, captchaAnswer: fd.get("captchaAnswer"),
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        const wrongCaptcha = body?.error?.name === "CaptchaError";
        setStatus("error");
        setError(wrongCaptcha
          ? "คำตอบยืนยันตัวตนไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่"
          : "ไม่สามารถส่งใบสมัครได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง");
        void refreshCaptcha();
        return;
      }
      setRef(newRef);
      setStatus("sent");
      form.reset();
      void refreshCaptcha();
    } catch {
      setStatus("error");
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
      void refreshCaptcha();
    }
  }

  if (status === "sent") {
    return (
      <div className="wx-job-apply-done" role="status" aria-live="polite">
        <p>✓ ส่งใบสมัครเรียบร้อยแล้ว หมายเลขอ้างอิงของท่านคือ <strong>{ref}</strong></p>
        <p>กรุณาเก็บหมายเลขนี้ไว้เพื่อใช้ติดตามสถานะการสมัคร</p>
      </div>
    );
  }

  return (
    <form className="wx-job-apply-form" onSubmit={handleSubmit} noValidate={false}>
      <div className="wx-job-apply-grid">
        <div className="wx-field">
          <label htmlFor="ja-job">ตำแหน่งที่สมัคร *</label>
          <select id="ja-job" name="jobId" required defaultValue="">
            <option value="" disabled>เลือกตำแหน่ง</option>
            {jobs.map((j) => <option key={j.jobId} value={j.jobId}>{j.title}</option>)}
          </select>
        </div>
        <div className="wx-field">
          <label htmlFor="ja-name">ชื่อ-นามสกุล *</label>
          <input id="ja-name" name="name" type="text" required placeholder="กรอกชื่อและนามสกุล" />
        </div>
        <div className="wx-field">
          <label htmlFor="ja-email">อีเมล *</label>
          <input id="ja-email" name="email" type="email" required placeholder="name@example.com" />
        </div>
        <div className="wx-field">
          <label htmlFor="ja-phone">โทรศัพท์ *</label>
          <input id="ja-phone" name="phone" type="tel" required placeholder="0X-XXX-XXXX" />
        </div>
      </div>

      <div className="wx-field" style={{ marginTop: 14 }}>
        <label htmlFor="ja-note">ข้อความเพิ่มเติม</label>
        <textarea id="ja-note" name="note" placeholder="ประสบการณ์ที่เกี่ยวข้อง หรือข้อมูลเพิ่มเติมที่ต้องการแจ้ง" />
      </div>

      <div className="wx-field" style={{ marginTop: 14 }}>
        <label htmlFor="ja-captcha">แบบยืนยันตัวตน: {captcha ? captcha.question : "กำลังโหลด…"} *</label>
        <input id="ja-captcha" name="captchaAnswer" type="text" inputMode="numeric" autoComplete="off" required disabled={!captcha} />
      </div>

      <div className="wx-job-apply-actions" style={{ marginTop: 20 }}>
        <button className="wx-export-btn" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "กำลังส่งใบสมัคร…" : "ส่งใบสมัคร"}
        </button>
        {status === "error" && (
          <span role="alert" aria-live="assertive" style={{ color: "#c0392b", marginLeft: 12 }}>⚠ {error}</span>
        )}
      </div>
    </form>
  );
}
