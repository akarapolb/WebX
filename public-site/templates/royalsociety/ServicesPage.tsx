// Ported from RoyalSociety/pages/services.html. Only the "เลือกบริการที่ต้องการ"
// card grid (source: <div class="rs-grid rs-grid--3" data-cms-repeat="services">)
// is CMS content — mapped from the `services` prop below. The step list and the
// FAQ stay static, verbatim from the source.
//
// The source's card markup also carries a hand-written `.rs-card__meta` badge
// per card (e.g. "ออนไลน์ · ไม่มีค่าใช้จ่าย") and a bespoke call-to-action label
// per card (e.g. "ส่งคำถาม →", "ดูขั้นตอน →"). Neither has a matching field in
// the CMS shape given to this component (`title`/`excerpt`/`content`/`slug`),
// so the meta badge is omitted and the CTA falls back to a generic
// "ดูรายละเอียด →" rather than inventing copy. The FAQ accordion
// (id="sv-faq-title") is also CMS content — mapped from the `faqs` prop
// (getWpFaqs; `title` = question, `excerpt` = answer) — into the same
// native <details>/<summary> structure the source used (see the source's
// own comment in 04-components.css: "ใช้ <details>/<summary> ของ HTML
// จึงเปิด-ปิดได้โดยไม่ต้องใช้ JS"), so no client-side accordion state is
// needed; the first FAQ item stays `open` by default, matching prior
// behavior. The step list (sv-step-title) stays static, verbatim from the
// source.
//
// Header/Footer are NOT rendered here — app/royalsociety/[page]/page.tsx
// wraps this component with them itself (same convention as AboutPage.tsx),
// so this file only owns the <main> content.
export default function ServicesPage({
  services,
  faqs,
}: {
  services: { title: string; excerpt: string; content: string; slug: string }[];
  faqs: { title: string; excerpt: string }[];
}) {
  return (
      <main id="main-content">
        <section className="page-hero page-hero--deep">
          <div className="container page-hero__inner">
            <nav className="breadcrumb" aria-label="เส้นทางนำทาง">
              <a href="/royalsociety">หน้าหลัก</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">บริการประชาชน</span>
            </nav>

            <span className="page-hero__kicker">Public Services</span>
            <h1 className="page-hero__title">บริการประชาชน</h1>
            <p className="page-hero__lead">
              รวมทุกช่องทางบริการของสำนักงานราชบัณฑิตยสภา สำหรับประชาชน สถานศึกษา
              หน่วยงานราชการ และสื่อมวลชน
            </p>
          </div>
        </section>

        <section className="section" aria-labelledby="sv-list-title">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">บริการหลัก</span>
              <h2 id="sv-list-title">เลือกบริการที่ต้องการ</h2>
            </div>

            <div className="rs-grid rs-grid--3">
              {services.map((s, i) => (
                <article className="rs-card rs-card--flat" key={s.slug || i}>
                  <div className="rs-card__body">
                    <h3 className="rs-card__title">
                      <a href={`/royalsociety/services/${s.slug}`}>{s.title}</a>
                    </h3>
                    <p className="rs-card__excerpt">{s.excerpt}</p>
                    <a className="rs-card__link" href={`/royalsociety/services/${s.slug}`}>
                      ดูรายละเอียด →
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="sv-step-title">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">ขั้นตอน</span>
              <h2 id="sv-step-title">ยื่นเรื่องอย่างไร</h2>
              <p>ขั้นตอนมาตรฐานสำหรับบริการที่ต้องยื่นเอกสาร</p>
            </div>

            <div className="rs-stats">
              <div className="rs-stat">
                <span className="rs-stat__value">1</span>
                <span className="rs-stat__label">ดาวน์โหลดและกรอกแบบฟอร์มให้ครบถ้วน</span>
              </div>
              <div className="rs-stat">
                <span className="rs-stat__value">2</span>
                <span className="rs-stat__label">ยื่นเอกสารทางอีเมล ไปรษณีย์ หรือด้วยตนเอง</span>
              </div>
              <div className="rs-stat">
                <span className="rs-stat__value">3</span>
                <span className="rs-stat__label">เจ้าหน้าที่ตรวจสอบและแจ้งผลภายใน 15 วันทำการ</span>
              </div>
              <div className="rs-stat">
                <span className="rs-stat__value">4</span>
                <span className="rs-stat__label">รับหนังสือตอบกลับตามช่องทางที่ระบุไว้</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="sv-faq-title">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">คำถามที่พบบ่อย</span>
              <h2 id="sv-faq-title">คำถามที่พบบ่อย</h2>
            </div>

            <div className="rs-accordion">
              {faqs.map((f, i) => (
                <details key={i} open={i === 0}>
                  <summary>{f.title}</summary>
                  <div className="rs-accordion__body">{f.excerpt}</div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
  );
}
