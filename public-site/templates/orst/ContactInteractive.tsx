"use client";

import { useState, type FormEvent, type ReactNode } from "react";

/* =============================================================================
   ContactInteractive.tsx — the genuinely-JS-dependent slivers of ContactPage.tsx
   -----------------------------------------------------------------------------
   Ported from ORST Website/assets/js/pages/contact.js:
     - initCopy(): `[data-copy]` buttons -> navigator.clipboard.writeText(),
       feedback via a single shared `#toast` element + showToast().
     - initForm(): `#message-form` submit -> preventDefault(), native
       checkValidity()/reportValidity(), a success message, form.reset().
       HANDOFF.md 6.1 documents there is no backend for this form at all
       ("ฟอร์มติดต่อ... ตรวจค่าฝั่งหน้าเว็บอย่างเดียว ไม่ส่งไปที่ไหน") — the
       source's own handler never sends the data anywhere either.

   Reimplemented with local component state instead of the source's shared
   `#toast` singleton: each CopyButton flips its own label briefly instead of
   writing into one global toast node, and ContactForm shows its thank-you
   message inline under the form instead of in a toast. Same user-visible
   confirmation, no shared DOM node to wire up. */

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

export function ContactForm({ children }: { children: ReactNode }) {
  const [sent, setSent] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    setSent(true);
    form.reset();
    setTimeout(() => setSent(false), 5000);
  }

  return (
    <form id="message-form" onSubmit={handleSubmit} noValidate={false}>
      {children}
      {sent ? (
        <p className="form-note" role="status" aria-live="polite" style={{ marginTop: 12 }}>
          ✓ ส่งข้อความเรียบร้อยแล้ว ขอบคุณที่ติดต่อสำนักงานราชบัณฑิตยสภา เจ้าหน้าที่จะติดต่อกลับตามช่องทางที่ท่านระบุ
        </p>
      ) : null}
    </form>
  );
}
