"use client";
// Split out from Blocks.tsx (which has no "use client" of its own, same as
// FaqAccordion.tsx's own split) — ContactForm (ContactInteractive.tsx) takes
// a render-prop `children` function, and a function can't be passed from a
// Server Component to a Client Component as a prop. Blocks.tsx is rendered
// from the (server) route app/orst/[page]/page.tsx, so this block needed
// its own client boundary to construct that function client-side instead.
import { useEffect, useRef } from "react";
import { ContactForm } from "./ContactInteractive";
import type { Block } from "./Blocks";

// Local copy of Blocks.tsx's own BlockIcon — kept unexported there (every
// other block that needs it lives in the same non-client file and can just
// call it directly), so duplicating this ~6-line wrapper is simpler than
// exporting it across the client boundary for one icon.
function Icon({ id }: { id: string }) {
  return (
    <svg className="icon" aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

// The form's OWN fields (name/email/phone/subject/reply-preference/message)
// stay fixed JSX, not data-driven — they're tied 1:1 to
// api::contact-message.contact-message's real Strapi schema (see
// ContactInteractive.tsx's ContactForm, which this renders unchanged), so
// making them "editable" would just let an admin silently break a working,
// backend-connected government contact form. Only the surrounding framing
// text is a block field, same convention as gov-portal's own block.form.
// Real, promised topics added alongside the original ones (TOR gap audit —
// the homepage's own "สอบถามข้อมูลทางวิชาการ"/"ขออนุญาตนำหนังสือไปจัดพิมพ์"/
// "ร้องเรียน / เสนอแนะ" cards now link here with a matching ?topic=). Kept
// as fixed JSX per this file's own convention (see header comment) — just a
// longer fixed option list, not a new data-driven field.
export default function ContactFormBlock({ b }: { b: Block }) {
  // A lazy useState initializer reading window.location here would only
  // ever apply on a fresh client-only mount — this page ships pre-rendered
  // (static export), so React hydrates it and reuses the SERVER's initial
  // value (always "", window doesn't exist there) instead of re-running the
  // initializer client-side. An effect that fires after hydration and sets
  // the field imperatively is what actually reflects the real URL — found
  // live testing the ORST/RoyalSociety homepage's new service-hub links,
  // which landed on /orst/contact?topic=academic with nothing preselected.
  const subjectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const topic = new URLSearchParams(window.location.search).get("topic");
    if (topic && subjectRef.current) subjectRef.current.value = topic;
  }, []);
  return (
    <section className="contact-form-panel" id="contact-form" aria-labelledby="form-title">
      {b.kicker ? <span className="section-kicker">{b.kicker}</span> : null}
      <h2 id="form-title">{b.heading}</h2>
      {b.intro ? <div className="form-intro">{b.intro}</div> : null}

      <ContactForm tenant="orst">
        {(captchaField) => (
          <>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="name">ชื่อ-นามสกุล <span className="required">*</span></label>
                <input id="name" name="name" type="text" placeholder="กรุณากรอกชื่อ" required />
              </div>
              <div className="field">
                <label htmlFor="contact-email">อีเมล <span className="required">*</span></label>
                <input id="contact-email" name="email" type="email" placeholder="example@email.com" required />
              </div>
              <div className="field">
                <label htmlFor="contact-phone">เบอร์โทรศัพท์</label>
                <input id="contact-phone" name="phone" type="tel" placeholder="081-234-5678" />
              </div>
              <div className="field">
                <label htmlFor="contact-subject">เรื่องที่ติดต่อ <span className="required">*</span></label>
                <select id="contact-subject" name="subject" required defaultValue="" ref={subjectRef}>
                  <option value="">กรุณาเลือกเรื่องที่ติดต่อ</option>
                  <option value="academic">สอบถามข้อมูลทางวิชาการ</option>
                  <option value="permission">ขออนุญาตนำหนังสือไปจัดพิมพ์</option>
                  <option value="general">สอบถามข้อมูลทั่วไป</option>
                  <option value="service">สอบถามการให้บริการ</option>
                  <option value="website">แจ้งปัญหาเว็บไซต์</option>
                  <option value="cooperation">ติดต่อเพื่อความร่วมมือ</option>
                  <option value="complaint">ร้องเรียน / เสนอแนะ</option>
                  <option value="other">อื่น ๆ</option>
                </select>
              </div>
              <div className="field full">
                <label>ช่องทางที่สะดวกให้ติดต่อกลับ</label>
                <div className="contact-choice">
                  <label><input type="radio" name="reply" value="email" defaultChecked /> อีเมล</label>
                  <label><input type="radio" name="reply" value="phone" /> โทรศัพท์</label>
                  <label><input type="radio" name="reply" value="both" /> ทั้งสองช่องทาง</label>
                </div>
              </div>
              <div className="field full">
                <label htmlFor="message">ข้อความ <span className="required">*</span></label>
                <textarea id="message" name="message" placeholder="กรุณากรอกข้อความที่ต้องการติดต่อ" required></textarea>
              </div>
            </div>

            {captchaField}

            <label className="privacy-check">
              <input type="checkbox" required />
              <span>
                ข้าพเจ้ายินยอมให้สำนักงานราชบัณฑิตยสภาเก็บรวบรวมข้อมูลตามที่ระบุใน{" "}
                <a href="/privacy">นโยบายคุ้มครองข้อมูลส่วนบุคคล</a>
              </span>
            </label>

            <div className="form-actions">
              <span className="form-note">ช่องที่มีเครื่องหมาย * จำเป็นต้องกรอก</span>
              <button className="btn" type="submit">
                <Icon id="i-send" />{" "}ส่งข้อความ
              </button>
            </div>
          </>
        )}
      </ContactForm>
    </section>
  );
}
