"use client";
// Real job-application e-form (TOR gap audit — orst/royalsociety had no job
// listings or application form anywhere on the public site). Originally
// wired to Strapi's public write path with resume upload deliberately left
// unwired (would have required granting the Public role a broad anonymous
// file-upload capability — a real attack-surface decision, see this file's
// git history for the fuller reasoning). Phase 7 moved application storage
// natively into WordPress (wordpress/mu-plugins/public-forms-api.php), whose
// submit route runs entirely in trusted server PHP — no public REST upload
// capability needed — so resume upload is now safe to add for real, and the
// reference number is generated server-side (dropping the old client-side
// refNumber() helper, which could collide or be spoofed).
import { useState, type FormEvent } from "react";
import { useCaptcha, WORDPRESS } from "@/lib/useCaptcha";
import type { JobPosting } from "@/lib/cms";

type Status = "idle" | "sending" | "sent" | "error";

export default function JobApplicationForm({ tenant, jobs }: { tenant: string; jobs: JobPosting[] }) {
  const { captcha, refreshCaptcha } = useCaptcha("wordpress");
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
    setStatus("sending");
    setError("");
    try {
      const body = new FormData();
      body.set("jobId", jobId);
      body.set("position", position);
      body.set("name", String(fd.get("name") || ""));
      body.set("email", String(fd.get("email") || ""));
      if (fd.get("phone")) body.set("phone", String(fd.get("phone")));
      if (fd.get("note")) body.set("note", String(fd.get("note")));
      body.set("captchaId", captcha.id);
      body.set("captchaAnswer", String(fd.get("captchaAnswer") || ""));
      const resume = fd.get("resume");
      if (resume instanceof File && resume.size > 0) body.set("resume", resume);

      const r = await fetch(`${WORDPRESS}/webx/v1/applications?tenant=${encodeURIComponent(tenant)}`, {
        method: "POST",
        body,
      });
      if (!r.ok) {
        const respBody = await r.json().catch(() => null);
        const wrongCaptcha = respBody?.code === "captcha_error";
        setStatus("error");
        setError(wrongCaptcha
          ? "คำตอบยืนยันตัวตนไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่"
          : "ไม่สามารถส่งใบสมัครได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง");
        void refreshCaptcha();
        return;
      }
      const j = await r.json();
      setRef(j?.data?.ref || "");
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
        <label htmlFor="ja-resume">แนบเรซูเม่ (PDF, ไม่เกิน 5MB)</label>
        <input id="ja-resume" name="resume" type="file" accept="application/pdf,.pdf,.doc,.docx" />
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
