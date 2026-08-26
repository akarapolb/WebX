
// Ported from RoyalSociety/pages/contact.html, fully static — no CMS prop on
// this page. The source itself documents the form as not wired to a backend:
//
//   TODO (ทีมพัฒนา): ฟอร์มนี้ยังไม่ได้ต่อกับระบบหลังบ้าน
//   ต้องกำหนด action/method และเพิ่มการตรวจสอบข้อมูลฝั่งเซิร์ฟเวอร์
//   รวมถึงมาตรการกันสแปม (CAPTCHA หรือเทียบเท่า)
//
// so the markup is rendered faithfully with no onSubmit/action — wiring it up
// (endpoint, server-side validation, spam protection) is out of scope here,
// same as it was in the source.
export default function ContactPage() {
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

                {/* Not wired to a backend — see file header comment. */}
                <form className="rs-panel">
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
                      <select id="ct-topic" name="topic" required>
                        <option value="">เลือกประเภทเรื่อง</option>
                        <option value="academic">สอบถามข้อมูลทางวิชาการ</option>
                        <option value="permission">ขออนุญาตใช้เนื้อหา</option>
                        <option value="speaker">ขอวิทยากรบรรยาย</option>
                        <option value="feedback">ข้อเสนอแนะ</option>
                        <option value="complaint">ข้อร้องเรียน</option>
                        <option value="other">อื่น ๆ</option>
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

                  <div className="rs-btn-row" style={{ marginTop: 20 }}>
                    <button className="rs-btn rs-btn--primary" type="submit">ส่งเรื่อง</button>
                    <button className="rs-btn" type="reset">ล้างข้อมูล</button>
                  </div>
                </form>
              </div>

              <aside>
                <div className="rs-panel rs-panel--deep">
                  <h3 style={{ marginTop: 0 }}>สำนักงานราชบัณฑิตยสภา</h3>
                  <p>สนามเสือป่า เขตดุสิต กรุงเทพมหานคร</p>
                  <p>
                    โทรศัพท์ <strong>0 2481 0347</strong>
                    <br />
                    อีเมล <strong>saraban@royalsociety.go.th</strong>
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
