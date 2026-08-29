"use client";
// The whole form is self-contained here (not a render-prop like ORST's
// equivalent) so ContactPage.tsx can stay a Server Component and keep using
// the `tenant` prop the route already fetches for Footer — no reason to
// force the whole page client-side just for this form.
//
// Previously: no onSubmit/action at all (the source's own TODO comment said
// as much), so a real submit fell back to the browser default — a GET
// against the current URL, putting name/email/phone/message straight into
// the address bar, browser history, and the server access log. Now wired to
// the same captcha-guarded public write path ORST's contact form uses.
import { useState, type FormEvent } from "react";
import { useCaptcha, STRAPI } from "@/lib/useCaptcha";

const TOPICS = [
  { value: "academic", label: "สอบถามข้อมูลทางวิชาการ" },
  { value: "permission", label: "ขออนุญาตใช้เนื้อหา" },
  { value: "speaker", label: "ขอวิทยากรบรรยาย" },
  { value: "feedback", label: "ข้อเสนอแนะ" },
  { value: "complaint", label: "ข้อร้องเรียน" },
  { value: "other", label: "อื่น ๆ" },
];

type Status = "idle" | "sending" | "sent" | "error";

export default function ContactForm({ tenant }: { tenant: string }) {
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
    const topicLabel = TOPICS.find((t) => t.value === fd.get("topic"))?.label || String(fd.get("topic") || "");
    setStatus("sending");
    setError("");
    try {
      const r = await fetch(`${STRAPI}/api/contact-messages?tenant=${encodeURIComponent(tenant)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            name: fd.get("name"),
            email: fd.get("email"),
            phone: fd.get("phone") || undefined,
            subject: `[${topicLabel}] ${fd.get("subject")}`,
            message: fd.get("message"),
          },
          captchaId: captcha.id,
          captchaAnswer: fd.get("captchaAnswer"),
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        const wrongCaptcha = body?.error?.name === "CaptchaError";
        setStatus("error");
        setError(wrongCaptcha
          ? "คำตอบยืนยันตัวตนไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่"
          : "ไม่สามารถส่งเรื่องได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง หรือติดต่อทางโทรศัพท์");
        void refreshCaptcha();
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

  return (
    <form className="rs-panel" onSubmit={handleSubmit} noValidate={false}>
      <div className="rs-grid rs-grid--2">
        <div className="rs-field">
          <label htmlFor="ct-name">ชื่อ-นามสกุล *</label>
          <input id="ct-name" name="name" type="text" required placeholder="กรอกชื่อและนามสกุล" />
        </div>
        <div className="rs-field">
          <label htmlFor="ct-email">อีเมล *</label>
          <input id="ct-email" name="email" type="email" required placeholder="name@example.com" />
        </div>
        <div className="rs-field">
          <label htmlFor="ct-phone">โทรศัพท์</label>
          <input id="ct-phone" name="phone" type="tel" placeholder="0X-XXX-XXXX" />
        </div>
        <div className="rs-field">
          <label htmlFor="ct-topic">ประเภทเรื่อง *</label>
          <select id="ct-topic" name="topic" required defaultValue="">
            <option value="">เลือกประเภทเรื่อง</option>
            {TOPICS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div className="rs-field" style={{ marginTop: 14 }}>
        <label htmlFor="ct-subject">หัวข้อเรื่อง *</label>
        <input id="ct-subject" name="subject" type="text" required placeholder="สรุปเรื่องที่ต้องการติดต่อในหนึ่งบรรทัด" />
      </div>

      <div className="rs-field" style={{ marginTop: 14 }}>
        <label htmlFor="ct-message">รายละเอียด *</label>
        <textarea id="ct-message" name="message" required placeholder="อธิบายรายละเอียดของเรื่องที่ต้องการติดต่อ" />
        <small className="rs-field__hint">หากเป็นคำถามเรื่องภาษา โปรดระบุคำหรือประโยคที่สงสัยให้ชัดเจน</small>
      </div>

      <div className="rs-field" style={{ marginTop: 14 }}>
        <label htmlFor="ct-captcha">แบบยืนยันตัวตน: {captcha ? captcha.question : "กำลังโหลด…"} *</label>
        <input id="ct-captcha" name="captchaAnswer" type="text" inputMode="numeric" autoComplete="off" required disabled={!captcha} />
      </div>

      <div className="rs-btn-row" style={{ marginTop: 20, alignItems: "center", gap: 12 }}>
        <button className="rs-btn rs-btn--primary" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "กำลังส่ง…" : "ส่งเรื่อง"}
        </button>
        <button className="rs-btn" type="reset">ล้างข้อมูล</button>
        {status === "sent" && (
          <span role="status" aria-live="polite" style={{ color: "#1a7a4c" }}>✓ ส่งเรื่องเรียบร้อยแล้ว เจ้าหน้าที่จะติดต่อกลับตามช่องทางที่ท่านระบุ</span>
        )}
        {status === "error" && (
          <span role="alert" aria-live="assertive" style={{ color: "#c0392b" }}>⚠ {error}</span>
        )}
      </div>
    </form>
  );
}
