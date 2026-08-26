
// Ported from RoyalSociety/pages/publications.html. Only the "สิ่งพิมพ์แนะนำ"
// featured grid (source: <div class="rs-grid rs-grid--4" data-cms-repeat="publications">)
// is CMS content — mapped from the `publications` prop. The filter bar (a
// plain, non-wired <form role="search">, exactly as in the source — it has
// no JS behaviour there either) and the downloadable-documents table stay
// static, verbatim from the source.
//
// The source's card also carries a `.rs-card__meta` badge (e.g. "หนังสือ ·
// 2568" — media type + year) that has no matching field in the CMS shape
// given here (`title`/`excerpt`/`content`/`slug`/`imageUrl`), so it's
// omitted rather than invented. When `imageUrl` is null the `.rs-card__media`
// block is skipped entirely — the source CSS has no dedicated "no image"
// placeholder state, so the card simply starts at its body.
export default function PublicationsPage({
  publications,
}: {
  publications: { title: string; excerpt: string; content: string; slug: string; imageUrl: string | null }[];
}) {
  return (
      <main id="main-content">
        <section className="page-hero">
          <div className="container page-hero__inner">
            <nav className="breadcrumb" aria-label="เส้นทางนำทาง">
              <a href="/royalsociety">หน้าหลัก</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">สื่อและสิ่งพิมพ์</span>
            </nav>

            <span className="page-hero__kicker">Media &amp; Publications</span>
            <h1 className="page-hero__title">สื่อและสิ่งพิมพ์</h1>
            <p className="page-hero__lead">
              หนังสือ ตำรา วารสารวิชาการ และสื่อความรู้ทุกรูปแบบที่ราชบัณฑิตยสภาจัดทำขึ้น
              เปิดให้อ่านออนไลน์และดาวน์โหลดเพื่อการศึกษา
            </p>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <form className="rs-filter" role="search" aria-label="ค้นหาสิ่งพิมพ์">
              <div className="rs-field rs-field--search">
                <label htmlFor="p-q">ชื่อเรื่องหรือคำสำคัญ</label>
                <input id="p-q" type="search" name="q" placeholder="พิมพ์ชื่อหนังสือ วารสาร หรือหัวข้อ" />
              </div>
              <div className="rs-field">
                <label htmlFor="p-type">รูปแบบสื่อ</label>
                <select id="p-type" name="type">
                  <option value="">ทุกรูปแบบ</option>
                  <option value="book">หนังสือและตำรา</option>
                  <option value="ebook">E-Book</option>
                  <option value="journal">วารสาร</option>
                  <option value="infographic">อินโฟกราฟิก</option>
                  <option value="video">สื่อวิดีโอ</option>
                </select>
              </div>
              <div className="rs-field">
                <label htmlFor="p-year">ปีที่เผยแพร่</label>
                <select id="p-year" name="year">
                  <option value="">ทุกปี</option>
                  <option value="2569">2569</option>
                  <option value="2568">2568</option>
                  <option value="2567">2567</option>
                </select>
              </div>
              <div className="rs-field">
                <label htmlFor="p-submit" className="sr-only">เริ่มค้นหา</label>
                <button id="p-submit" className="rs-btn rs-btn--primary" type="submit">ค้นหา</button>
              </div>
            </form>
          </div>
        </section>

        <section className="section" aria-labelledby="p-featured-title">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">แนะนำ</span>
              <h2 id="p-featured-title">สิ่งพิมพ์แนะนำ</h2>
              <p>ผลงานที่ได้รับความสนใจและถูกนำไปใช้อ้างอิงมากที่สุด</p>
            </div>

            <div className="rs-grid rs-grid--4">
              {publications.map((p, i) => (
                <article className="rs-card" key={p.slug || i}>
                  {p.imageUrl && (
                    <a className="rs-card__media" href={`/royalsociety/publications/${p.slug}`}>
                      <img src={p.imageUrl} alt="" loading="lazy" />
                    </a>
                  )}
                  <div className="rs-card__body">
                    <h3 className="rs-card__title">
                      <a href={`/royalsociety/publications/${p.slug}`}>{p.title}</a>
                    </h3>
                    <p className="rs-card__excerpt">{p.excerpt}</p>
                    <a className="rs-card__link" href={`/royalsociety/publications/${p.slug}`}>
                      รายละเอียด →
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="p-download-title">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">ดาวน์โหลด</span>
              <h2 id="p-download-title">เอกสารเผยแพร่และแบบฟอร์ม</h2>
            </div>

            <div className="rs-table-wrap">
              <table className="rs-table">
                <caption className="sr-only">รายการเอกสารที่เปิดให้ดาวน์โหลด</caption>
                <thead>
                  <tr>
                    <th scope="col">ชื่อเอกสาร</th>
                    <th scope="col">หมวด</th>
                    <th scope="col">เผยแพร่</th>
                    <th scope="col">ไฟล์</th>
                    <th scope="col">ดาวน์โหลด</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>หลักเกณฑ์การทับศัพท์ภาษาอังกฤษ</td>
                    <td>หลักเกณฑ์</td>
                    <td>ม.ค. 2569</td>
                    <td>PDF · 1.2 MB</td>
                    <td><a href="#">ดาวน์โหลด</a></td>
                  </tr>
                  <tr>
                    <td>แบบฟอร์มขออนุญาตใช้เนื้อหา</td>
                    <td>แบบฟอร์ม</td>
                    <td>ธ.ค. 2568</td>
                    <td>DOCX · 240 KB</td>
                    <td><a href="#">ดาวน์โหลด</a></td>
                  </tr>
                  <tr>
                    <td>อินโฟกราฟิก: คำที่มักเขียนผิด 50 คำ</td>
                    <td>สื่อเผยแพร่</td>
                    <td>พ.ย. 2568</td>
                    <td>PNG · 4.6 MB</td>
                    <td><a href="#">ดาวน์โหลด</a></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="rs-note rs-note--warn" style={{ marginTop: 18 }}>
              <strong>เงื่อนไขการนำไปใช้</strong>
              เนื้อหาทั้งหมดเผยแพร่เพื่อการศึกษาและการอ้างอิง การนำไปใช้เชิงพาณิชย์ต้องขออนุญาตเป็นลายลักษณ์อักษร
            </div>
          </div>
        </section>
      </main>
    );
}
