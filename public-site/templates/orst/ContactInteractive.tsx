"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useCaptcha, STRAPI } from "@/lib/useCaptcha";

/* =============================================================================
   ContactInteractive.tsx — the genuinely-JS-dependent slivers of ContactPage.tsx
   -----------------------------------------------------------------------------
   ContactForm used to be a pure UI mock — preventDefault(), a canned "sent"
   message, form.reset() — with nothing sent anywhere (ported faithfully from
   a source that documented the same gap in its own HANDOFF.md). Strapi
   already has a full public write path for exactly this
   (api::contact-message.contact-message, seeded with Public create
   permission — strapi-cms/src/seed/seed.ts) plus a captcha guard in front of
   it (src/middlewares/captcha-guard.ts) that neither this form nor
   RoyalSociety's ever called. This now does both for real. */

export function CopyButton({ text, label, copiedLabel = "คัดลอกแล้ว", className = "mini-action" }: {
  text: string;
  label: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable/denied — silently no-op, same as the
      // source's `catch (e) { showToast('ไม่สามารถคัดลอกได้') }` minus the toast.
    }
  }

  return (
    <button className={className} type="button" onClick={handleCopy}>
      {copied ? copiedLabel : label}
    </button>
  );
}

type Status = "idle" | "sending" | "sent" | "error";

/** children is a render function so ContactPage.tsx controls exactly where
 * the captcha field lands in its own layout (right before the privacy
 * checkbox), while this component owns the captcha lifecycle and the
 * actual submit. */
export function ContactForm({ tenant, children }: { tenant: string; children: (captchaField: ReactNode) => ReactNode }) {
  const { captcha, refreshCaptcha } = useCaptcha();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    if (!captcha) {
      setStatus("error");
      setError("กำลังเตรียมแบบยืนยันตัวตน กรุณาลองใหม่อีกครั้งในอีกสักครู่");
      return;
    }
    const fd = new FormData(form);
    setStatus("sending");
    setError("");
    // "ร้องเรียน / เสนอแนะ" specifically routes to api::complaint.complaint
    // instead of the generic contact-message — that content type's own
    // afterCreate lifecycle sends a real notification email to
    // COMPLAINT_NOTIFY_EMAIL (TOR §4.4.1.2 4.7's "staff email notification"
    // requirement), which contact-message has no lifecycle for at all.
    // Every other subject keeps going to contact-messages, unchanged.
    const isComplaint = fd.get("subject") === "complaint";
    const endpoint = isComplaint
      ? `${STRAPI}/api/complaints/submit?tenant=${encodeURIComponent(tenant)}`
      : `${STRAPI}/api/contact-messages?tenant=${encodeURIComponent(tenant)}`;
    const data = isComplaint
      ? {
          type: "รับเรื่องออนไลน์",
          subject: "ร้องเรียน / เสนอแนะ",
          detail: fd.get("message"),
          anonymous: false,
          name: fd.get("name"),
          email: fd.get("email"),
          phone: fd.get("phone") || undefined,
          date: new Date().toISOString(),
        }
      : {
          name: fd.get("name"),
          email: fd.get("email"),
          phone: fd.get("phone") || undefined,
          subject: fd.get("subject"),
          message: fd.get("message"),
        };
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, captchaId: captcha.id, captchaAnswer: fd.get("captchaAnswer") }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        const wrongCaptcha = body?.error?.name === "CaptchaError";
        setStatus("error");
        setError(wrongCaptcha
          ? "คำตอบยืนยันตัวตนไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่"
          : "ไม่สามารถส่งข้อความได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง หรือติดต่อทางโทรศัพท์");
        void refreshCaptcha(); // single-use — a fresh one is needed for the retry either way
        return;
      }
      setStatus("sent");
      form.reset();
      void refreshCaptcha();
    } catch {
      setStatus("error");
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง หรือติดต่อทางโทรศัพท์");
      void refreshCaptcha();
    }
  }

  const captchaField = (
    <div className="field">
      <label htmlFor="captcha-answer">
        แบบยืนยันตัวตน: {captcha ? captcha.question : "กำลังโหลด…"} <span className="required">*</span>
      </label>
      <input id="captcha-answer" name="captchaAnswer" type="text" inputMode="numeric" autoComplete="off" required disabled={!captcha} />
    </div>
  );

  return (
    <form id="message-form" onSubmit={handleSubmit} noValidate={false}>
      {children(captchaField)}
      {status === "sending" ? (
        <p className="form-note" role="status" aria-live="polite" style={{ marginTop: 12 }}>กำลังส่งข้อความ…</p>
      ) : status === "sent" ? (
        <p className="form-note" role="status" aria-live="polite" style={{ marginTop: 12 }}>
          ✓ ส่งข้อความเรียบร้อยแล้ว ขอบคุณที่ติดต่อสำนักงานราชบัณฑิตยสภา เจ้าหน้าที่จะติดต่อกลับตามช่องทางที่ท่านระบุ
        </p>
      ) : status === "error" ? (
        <p className="form-note" role="alert" aria-live="assertive" style={{ marginTop: 12, color: "#c0392b" }}>⚠ {error}</p>
      ) : null}
    </form>
  );
}
