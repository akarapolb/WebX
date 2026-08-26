import { CopyButton, ContactForm } from "./ContactInteractive";

/* =============================================================================
   ContactPage.tsx — React port of the ORST static site's contact.html
   -----------------------------------------------------------------------------
   Ported 1:1 from "ORST Website/contact.html" — everything between
   `<div id="app-header">` and `<div id="app-footer">`, i.e. the
   `<main id="main-content">` element (header/footer/skip-link/icon-sprite
   come from the surrounding route — see app/orst/[page]/page.tsx).

   Class names copied verbatim from public/assets/orst/css/pages/contact.css.

   Interactivity split out to ./ContactInteractive.tsx ("use client"):
     - CopyButton: wraps the `[data-copy]` -> navigator.clipboard.writeText()
       behaviour from pages/contact.js's initCopy().
     - ContactForm: wraps `#message-form`'s submit handler (preventDefault +
       native validation + reset) from initForm(). There is no backend for
       this form in the source (HANDOFF.md 6.1) — submitting here just shows
       a local thank-you message and resets the fields, same as the source.

   Simplifications (see task report):
     - The shared `#toast` element is not rendered — both client components
       give their own inline feedback instead (see ContactInteractive.tsx's
       file comment for why).
     - The map panel is left exactly as the source had it: a static
       placeholder ("พื้นที่สำหรับฝัง Google Maps หรือแผนที่หน่วยงาน") — the
       source never embeds a real map either.
     - `.reveal` scroll-in-view classes omitted from every className, same
       reasoning as HomePage.tsx/KnowledgePage.tsx.
*/

export default function ContactPage() {
  return (
    <main id="main-content">
      <section className="contact-hero" aria-labelledby="page-title">
        <div className="container contact-hero-inner">
          <div>
            <span className="eyebrow">ช่องทางติดต่อสำนักงาน</span>
            <h1 id="page-title">ติดต่อราชบัณฑิตยสภา</h1>
            <p>เลือกช่องทางที่สะดวก สอบถามข้อมูล ส่งข้อความถึงเจ้าหน้าที่ หรือดูแผนที่เพื่อเดินทางมายังสำนักงาน</p>
            <div className="hero-actions">
              <a className="btn" href="#contact-form">
                <svg className="icon">
                  <use href="#i-send" />
                </svg>{" "}
                ส่งข้อความถึงเรา
              </a>
              <a className="btn secondary" href="#map">
                <svg className="icon">
                  <use href="#i-map" />
                </svg>{" "}
                ดูแผนที่และการเดินทาง
              </a>
            </div>
          </div>

          <aside className="hero-info-card" aria-label="ข้อมูลติดต่อโดยสรุป">
            <h2>ข้อมูลติดต่อสำคัญ</h2>
            <div className="office-status">
              <span></span> เปิดทำการ จันทร์ - ศุกร์ 08:30 - 16:30 น.
            </div>
            <div className="hero-info-list">
              <a href="tel:022800021">
                <svg className="icon">
                  <use href="#i-phone" />
                </svg>
                <span>
                  0-2280-0021
                  <small>ต่อ 120 ฝ่ายสอบถาม</small>
                </span>
              </a>
              <a href="mailto:info@royin.go.th">
                <svg className="icon">
                  <use href="#i-mail" />
                </svg>
                <span>
                  info@royin.go.th
                  <small>อีเมลกลางสำหรับติดต่อสำนักงาน</small>
                </span>
              </a>
              <div>
                <svg className="icon">
                  <use href="#i-map" />
                </svg>
                <span>
                  2 ถนนเทเวศร์ แขวงศรีอยุธยา เขตดุสิต กรุงเทพมหานคร 10300
                  <small>ที่ตั้งสำนักงาน</small>
                </span>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="section">
        <div className="container contact-grid">
          <div>
            <div className="contact-info-panel">
              <h2>ข้อมูลติดต่อ</h2>
              <div className="contact-list">
                <article className="contact-item">
                  <span className="contact-icon">
                    <svg className="icon-lg">
                      <use href="#i-map" />
                    </svg>
                  </span>
                  <div>
                    <h3>ที่อยู่</h3>
                    <p>
                      สำนักงานราชบัณฑิตยสภา
                      <br />2 ถนนเทเวศร์ แขวงศรีอยุธยา เขตดุสิต กรุงเทพมหานคร 10300
                    </p>
                    <div className="contact-actions">
                      <CopyButton
                        text="สำนักงานราชบัณฑิตยสภา 2 ถนนเทเวศร์ แขวงศรีอยุธยา เขตดุสิต กรุงเทพมหานคร 10300"
                        label="คัดลอกที่อยู่"
                      />
                    </div>
                  </div>
                </article>

                <article className="contact-item">
                  <span className="contact-icon">
                    <svg className="icon-lg">
                      <use href="#i-phone" />
                    </svg>
                  </span>
                  <div>
                    <h3>โทรศัพท์</h3>
                    <p>
                      0-2280-0021
                      <br />
                      <small>ต่อ 120 ฝ่ายสอบถาม</small>
                    </p>
                    <div className="contact-actions">
                      <a className="mini-action" href="tel:022800021">โทรเลย</a>
                      <CopyButton text="0-2280-0021" label="คัดลอกเบอร์" />
                    </div>
                  </div>
                </article>

                <article className="contact-item">
                  <span className="contact-icon">
                    <svg className="icon-lg">
                      <use href="#i-mail" />
                    </svg>
                  </span>
                  <div>
                    <h3>อีเมล</h3>
                    <p>
                      info@royin.go.th
                      <br />
                      <small>inquiry@royin.go.th สำหรับสอบถามข้อมูล</small>
                    </p>
                    <div className="contact-actions">
                      <a className="mini-action" href="mailto:info@royin.go.th">ส่งอีเมล</a>
                      <CopyButton text="info@royin.go.th" label="คัดลอกอีเมล" />
                    </div>
                  </div>
                </article>

                <article className="contact-item">
                  <span className="contact-icon">
                    <svg className="icon-lg">
                      <use href="#i-clock" />
                    </svg>
                  </span>
                  <div>
                    <h3>เวลาทำการ</h3>
                    <p>
                      จันทร์ - ศุกร์ 08:30 - 16:30 น.
                      <br />
                      <small>หยุดเสาร์-อาทิตย์ และวันหยุดนักขัตฤกษ์</small>
                    </p>
                  </div>
                </article>
              </div>
            </div>

            <div className="map-panel" id="map">
              <div className="map-visual">
                <div>
                  <svg className="icon-lg">
                    <use href="#i-map" />
                  </svg>
                  <h3>แผนที่และการเดินทาง</h3>
                  <p>พื้นที่สำหรับฝัง Google Maps หรือแผนที่หน่วยงาน</p>
                </div>
              </div>
              <div className="map-actions">
                <a className="btn" href="https://www.google.com/maps" target="_blank" rel="noopener">
                  เปิด Google Maps
                </a>
                <CopyButton
                  text="สำนักงานราชบัณฑิตยสภา 2 ถนนเทเวศร์ แขวงศรีอยุธยา เขตดุสิต กรุงเทพมหานคร 10300"
                  label="คัดลอกที่อยู่"
                />
              </div>
            </div>
          </div>

          <section className="contact-form-panel" id="contact-form" aria-labelledby="form-title">
            <span className="section-kicker">Contact Form</span>
            <h2 id="form-title">ส่งข้อความถึงเรา</h2>
            <div className="form-intro">กรอกข้อมูลให้ครบถ้วน เจ้าหน้าที่จะพิจารณาและติดต่อกลับตามช่องทางที่ท่านระบุ</div>

            <ContactForm>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="name">
                    ชื่อ-นามสกุล <span className="required">*</span>
                  </label>
                  <input id="name" name="name" type="text" placeholder="กรุณากรอกชื่อ" required />
                </div>
                <div className="field">
                  <label htmlFor="contact-email">
                    อีเมล <span className="required">*</span>
                  </label>
                  <input id="contact-email" name="email" type="email" placeholder="example@email.com" required />
                </div>
                <div className="field">
                  <label htmlFor="contact-phone">เบอร์โทรศัพท์</label>
                  <input id="contact-phone" name="phone" type="tel" placeholder="081-234-5678" />
                </div>
                <div className="field">
                  <label htmlFor="contact-subject">
                    เรื่องที่ติดต่อ <span className="required">*</span>
                  </label>
                  <select id="contact-subject" name="subject" required defaultValue="">
                    <option value="">กรุณาเลือกเรื่องที่ติดต่อ</option>
                    <option value="general">สอบถามข้อมูลทั่วไป</option>
                    <option value="service">สอบถามการให้บริการ</option>
                    <option value="website">แจ้งปัญหาเว็บไซต์</option>
                    <option value="cooperation">ติดต่อเพื่อความร่วมมือ</option>
                    <option value="other">อื่น ๆ</option>
                  </select>
                </div>
                <div className="field full">
                  <label>ช่องทางที่สะดวกให้ติดต่อกลับ</label>
                  <div className="contact-choice">
                    <label>
                      <input type="radio" name="reply" value="email" defaultChecked /> อีเมล
                    </label>
                    <label>
                      <input type="radio" name="reply" value="phone" /> โทรศัพท์
                    </label>
                    <label>
                      <input type="radio" name="reply" value="both" /> ทั้งสองช่องทาง
                    </label>
                  </div>
                </div>
                <div className="field full">
                  <label htmlFor="message">
                    ข้อความ <span className="required">*</span>
                  </label>
                  <textarea id="message" name="message" placeholder="กรุณากรอกข้อความที่ต้องการติดต่อ" required></textarea>
                </div>
              </div>

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
                  <svg className="icon">
                    <use href="#i-send" />
                  </svg>{" "}
                  ส่งข้อความ
                </button>
              </div>
            </ContactForm>
          </section>
        </div>
      </section>

      <section className="section department-section">
        <div className="container">
          <div className="department-panel">
            <div className="section-head">
              <div>
                <span className="section-kicker">Internal Offices</span>
                <h2>หน่วยงานภายใน</h2>
                <p>เลือกติดต่อหน่วยงานที่เกี่ยวข้องโดยตรง เพื่อให้ได้รับการประสานงานที่รวดเร็วขึ้น</p>
              </div>
            </div>

            <div className="department-grid">
              <article className="department-card">
                <h3>สำนักเลขาธิการ</h3>
                <p>โทร: 0-2280-0021 ต่อ 101</p>
                <p><a href="mailto:secretary@royin.go.th">secretary@royin.go.th</a></p>
              </article>
              <article className="department-card">
                <h3>ฝ่ายภาษาไทย</h3>
                <p>โทร: 0-2280-0021 ต่อ 201</p>
                <p><a href="mailto:thai@royin.go.th">thai@royin.go.th</a></p>
              </article>
              <article className="department-card">
                <h3>ฝ่ายห้องสมุด</h3>
                <p>โทร: 0-2280-0021 ต่อ 301</p>
                <p><a href="mailto:library@royin.go.th">library@royin.go.th</a></p>
              </article>
              <article className="department-card">
                <h3>ฝ่ายสิ่งพิมพ์</h3>
                <p>โทร: 0-2280-0021 ต่อ 401</p>
                <p><a href="mailto:publication@royin.go.th">publication@royin.go.th</a></p>
              </article>
              <article className="department-card">
                <h3>ฝ่ายเทคโนโลยีสารสนเทศ</h3>
                <p>โทร: 0-2280-0021 ต่อ 501</p>
                <p><a href="mailto:it@royin.go.th">it@royin.go.th</a></p>
              </article>
              <article className="department-card">
                <h3>ฝ่ายการเงินและบัญชี</h3>
                <p>โทร: 0-2280-0021 ต่อ 601</p>
                <p><a href="mailto:finance@royin.go.th">finance@royin.go.th</a></p>
              </article>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
