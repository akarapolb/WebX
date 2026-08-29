// Ported verbatim from the source's pages/knowledge.html. The source tags
// the database list, quick-tags, and article list with data-cms-repeat
// attributes. Of those, only the "ฐานข้อมูลหลัก" grid (source: <div
// class="rs-grid rs-grid--3" data-cms-repeat="databases">) is wired to real
// CMS content here, via the `resources` prop (getWpResources). The quick-tags
// and "บทความล่าสุด" article list stay static example content, ported as
// plain JSX — no CMS wiring requested for those in this pass.
//
// The source's card markup also carries a hand-written `.rs-card__meta`
// category badge per card (e.g. "พจนานุกรม", "สารานุกรม"). It has no
// matching field in the CMS shape given to this component (`title`/
// `excerpt`/`slug`), so — same documented convention as
// PublicationsPage.tsx's and ServicesPage.tsx's `.rs-card__meta`/CTA
// omissions — the badge is dropped rather than invented.
//
// The search bar (rs-filter form) has no working backend in the source —
// it's rendered as-is with no onSubmit/onClick handler, matching that gap.
//
// Header/Footer are NOT rendered here — app/royalsociety/[page]/page.tsx
// wraps this component with <Header active="knowledge" /> / <Footer />
// itself (same pattern as app/royalsociety/page.tsx wrapping HomePage), so
// this file only owns the <main> content.
export default function KnowledgePage({
  resources,
}: {
  resources: { title: string; excerpt: string; slug: string }[];
}) {
  return (
    <main id="main-content">
      <section className="page-hero">
        <div className="container page-hero__inner">
          <nav className="breadcrumb" aria-label="เส้นทางนำทาง">
            <a href="/royalsociety">หน้าหลัก</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">องค์ความรู้</span>
            </nav>

            <span className="page-hero__kicker">Knowledge</span>
            <h1 className="page-hero__title">องค์ความรู้</h1>
            <p className="page-hero__lead">
              คลังความรู้ที่ราชบัณฑิตยสภาค้นคว้า เรียบเรียง และตรวจสอบความถูกต้อง
              เปิดให้ประชาชน นักเรียน นักวิชาการ และหน่วยงานใช้อ้างอิงได้โดยไม่มีค่าใช้จ่าย
            </p>
          </div>
        </section>

        {/* ค้นหาและกรองภายในหน้า */}
        <section className="section">
          <div className="container">
            <form className="rs-filter" role="search" aria-label="ค้นหาองค์ความรู้">
              <div className="rs-field rs-field--search">
                <label htmlFor="k-q">คำค้น</label>
                <input id="k-q" type="search" name="q" placeholder="พิมพ์คำ ศัพท์ หรือหัวข้อที่ต้องการค้นหา" />
              </div>
              <div className="rs-field">
                <label htmlFor="k-type">ประเภทเนื้อหา</label>
                <select id="k-type" name="type">
                  <option value="">ทุกประเภท</option>
                  <option value="dictionary">พจนานุกรม</option>
                  <option value="encyclopedia">สารานุกรม</option>
                  <option value="terminology">ศัพท์บัญญัติ</option>
                  <option value="standard">หลักเกณฑ์ภาษาไทย</option>
                  <option value="article">บทความวิชาการ</option>
                </select>
              </div>
              <div className="rs-field">
                <label htmlFor="k-office">สำนัก</label>
                <select id="k-office" name="office">
                  <option value="">ทุกสำนัก</option>
                  <option value="social">ธรรมศาสตร์และการเมือง</option>
                  <option value="science">วิทยาศาสตร์</option>
                  <option value="arts">ศิลปกรรม</option>
                </select>
              </div>
              <div className="rs-field">
                <label htmlFor="k-submit" className="sr-only">เริ่มค้นหา</label>
                <button id="k-submit" className="rs-btn rs-btn--primary" type="submit">ค้นหา</button>
              </div>
            </form>

            <div className="rs-tags" style={{ marginTop: 16 }} aria-label="หมวดยอดนิยม">
              <a className="rs-tag is-active" href="#">ทั้งหมด</a>
              <a className="rs-tag" href="#">ภาษาไทย</a>
              <a className="rs-tag" href="#">ราชาศัพท์</a>
              <a className="rs-tag" href="#">คำทับศัพท์</a>
              <a className="rs-tag" href="#">ศิลปกรรมและวัฒนธรรม</a>
              <a className="rs-tag" href="#">วิทยาศาสตร์และเทคโนโลยี</a>
            </div>
          </div>
        </section>

        {/* ฐานข้อมูลหลัก */}
        <section className="section" aria-labelledby="k-db-title">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">ฐานข้อมูลหลัก</span>
              <h2 id="k-db-title">ค้นคว้าจากแหล่งอ้างอิงมาตรฐาน</h2>
              <p>ทุกฐานข้อมูลผ่านการตรวจสอบและรับรองโดยราชบัณฑิตและภาคีสมาชิก</p>
            </div>

            <div className="rs-grid rs-grid--3">
              {resources.map((r, i) => (
                <article className="rs-card rs-card--flat" key={r.slug || i}>
                  <div className="rs-card__body">
                    <h3 className="rs-card__title">
                      <a href="/royalsociety/knowledge">{r.title}</a>
                    </h3>
                    <p className="rs-card__excerpt">{r.excerpt}</p>
                    <a className="rs-card__link" href="/royalsociety/knowledge">
                      เข้าใช้งาน →
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* บทความล่าสุด */}
        <section className="section" aria-labelledby="k-article-title">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">บทความวิชาการ</span>
              <h2 id="k-article-title">องค์ความรู้สำหรับประชาชน</h2>
            </div>

            <ul className="rs-list">
              <li className="rs-list-item">
                <span className="rs-list-item__date"><strong>12</strong>ม.ค. 69</span>
                <div className="rs-list-item__body">
                  <span className="rs-list-item__tag">ภาษาไทย</span>
                  <h3><a href="#">หลักการใช้เครื่องหมายวรรคตอนในภาษาไทยร่วมสมัย</a></h3>
                  <p>อธิบายหน้าที่ของเครื่องหมายแต่ละชนิดพร้อมตัวอย่างการใช้ที่พบบ่อยในงานเขียนราชการ</p>
                </div>
                <span className="rs-list-item__arrow" aria-hidden="true">→</span>
              </li>

              <li className="rs-list-item">
                <span className="rs-list-item__date"><strong>04</strong>ม.ค. 69</span>
                <div className="rs-list-item__body">
                  <span className="rs-list-item__tag">ศัพท์บัญญัติ</span>
                  <h3><a href="#">คำศัพท์ด้านปัญญาประดิษฐ์ที่บัญญัติใหม่ พ.ศ. ๒๕๖๘</a></h3>
                  <p>รวมคำศัพท์เทคโนโลยีที่คณะกรรมการบัญญัติศัพท์ได้พิจารณาและประกาศใช้</p>
                </div>
                <span className="rs-list-item__arrow" aria-hidden="true">→</span>
              </li>

              <li className="rs-list-item">
                <span className="rs-list-item__date"><strong>21</strong>ธ.ค. 68</span>
                <div className="rs-list-item__body">
                  <span className="rs-list-item__tag">วัฒนธรรม</span>
                  <h3><a href="#">ชื่อบ้านนามเมือง: ที่มาของชื่อสถานที่ในภาคอีสาน</a></h3>
                  <p>สืบค้นรากศัพท์และบริบททางประวัติศาสตร์ของชื่อสถานที่ที่ใช้กันมาแต่โบราณ</p>
                </div>
                <span className="rs-list-item__arrow" aria-hidden="true">→</span>
              </li>
            </ul>

            <nav className="rs-pagination" aria-label="แบ่งหน้ารายการบทความ">
              <span aria-current="page">1</span>
              <a href="#">2</a>
              <a href="#">3</a>
              <a href="#">ถัดไป →</a>
            </nav>
          </div>
        </section>

        {/* ช่องทางสอบถาม */}
        <section className="section">
          <div className="container">
            <div className="rs-panel rs-panel--deep">
              <h2>ไม่พบสิ่งที่ต้องการ?</h2>
              <p>ส่งคำถามทางวิชาการมาที่ราชบัณฑิตยสภา เจ้าหน้าที่จะประสานผู้เชี่ยวชาญและตอบกลับภายใน 15 วันทำการ</p>
              <div className="rs-btn-row" style={{ marginTop: 18 }}>
                <a className="rs-btn rs-btn--gold" href="/royalsociety/contact">ส่งคำถามทางวิชาการ</a>
                <a className="rs-btn rs-btn--ghost" href="/royalsociety/services">ดูบริการทั้งหมด</a>
              </div>
            </div>
          </div>
      </section>
    </main>
  );
}
