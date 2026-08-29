
// Ported from RoyalSociety/pages/contact.html. The form used to have no
// onSubmit/action at all (the source's own TODO said as much) — a real
// submit fell back to a GET against the current URL, leaking name/email/
// phone/message into the address bar, browser history, and the server
// access log. Now delegates to ContactInteractive.tsx's real, captcha-
// guarded submit. The office address/phone/email below used to be a second,
// independent hardcoded copy that could silently drift from Footer.tsx's
// real CMS-sourced one — this now takes the SAME `tenant` prop the route
// already fetches for Footer, so the two can't disagree.
import type { Tenant } from "@/lib/cms";
import ContactForm from "./ContactInteractive";

export default function ContactPage({ tenant }: { tenant: Tenant | null }) {
  const contact = tenant?.contact;
  const phone = contact?.phone || "0 2481 0347";
  const email = contact?.email || "saraban@royalsociety.go.th";
  const address = contact?.address?.th || "สนามเสือป่า เขตดุสิต กรุงเทพมหานคร";
  return (
      <main id="main-content">
        <section className="page-hero">
          <div className="container page-hero__inner">
            <nav className="breadcrumb" aria-label="เส้นทางนำทาง">
              <a href="/royalsociety">หน้าหลัก</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">ติดต่อเรา</span>
            </nav>

            <span className="page-hero__kicker">Contact</span>
            <h1 className="page-hero__title">ติดต่อเรา</h1>
            <p className="page-hero__lead">
              ส่งคำถาม ข้อเสนอแนะ หรือเรื่องที่ต้องการติดต่อกับสำนักงานราชบัณฑิตยสภา
              เจ้าหน้าที่จะติดต่อกลับตามช่องทางที่ท่านระบุ
            </p>
          </div>
        </section>

        <section className="section" aria-labelledby="ct-form-title">
          <div className="container">
            <div className="rs-grid rs-grid--sidebar">
              <div>
                <div className="section-head">
                  <span className="eyebrow">แบบฟอร์ม</span>
                  <h2 id="ct-form-title">ส่งเรื่องถึงเรา</h2>
                  <p>ช่องที่มีเครื่องหมาย * จำเป็นต้องกรอก</p>
                </div>

                <ContactForm tenant="royalsociety" />
              </div>

              <aside>
                <div className="rs-panel rs-panel--deep">
                  <h3 style={{ marginTop: 0 }}>สำนักงานราชบัณฑิตยสภา</h3>
                  <p>{address}</p>
                  <p>
                    โทรศัพท์ <strong>{phone}</strong>
                    <br />
                    อีเมล <strong>{email}</strong>
                  </p>
                </div>

                <div className="rs-panel rs-panel--soft" style={{ marginTop: 16 }}>
                  <h3 style={{ marginTop: 0 }}>เวลาทำการ</h3>
                  <div className="rs-table-wrap">
                    <table className="rs-table">
                      <caption className="sr-only">เวลาทำการของสำนักงาน</caption>
                      <tbody>
                        <tr><td>จันทร์ - ศุกร์</td><td>08:30 - 16:30 น.</td></tr>
                        <tr><td>เสาร์ - อาทิตย์</td><td>ปิดทำการ</td></tr>
                        <tr><td>วันหยุดนักขัตฤกษ์</td><td>ปิดทำการ</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rs-note" style={{ marginTop: 16 }}>
                  <strong>ก่อนส่งคำถาม</strong>
                  ลองค้นหาในคลังองค์ความรู้ก่อน คำถามที่พบบ่อยจำนวนมากมีคำตอบอยู่แล้วที่{" "}
                  <a href="/royalsociety/knowledge">หน้าองค์ความรู้</a>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>
    );
}
