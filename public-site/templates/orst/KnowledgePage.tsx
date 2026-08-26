/* =============================================================================
   KnowledgePage.tsx — React port of the ORST static site's knowledge.html
   -----------------------------------------------------------------------------
   Ported 1:1 from "ORST Website/knowledge.html" — everything between
   `<div id="app-header">` and `<div id="app-footer">`, i.e. the
   `<main id="main-content">` element (header/footer/skip-link/icon-sprite
   come from the surrounding route — see app/orst/[page]/page.tsx).

   Class names copied verbatim from public/assets/orst/css/pages/knowledge.css.

   Intentionally rendered as a plain Server Component (no client-side state)
   — see task report for the full reasoning, in short:
     - The hero search box (#hero-search-form/#main-search) and quick-query
       chips are the same kind of mocked search entry point covered by
       HANDOFF.md's "do not port the mocked search" note, so they're inert
       here (no form element, no handlers), same treatment as the homepage.
     - Everything below (`#knowledge-content`: category filter buttons,
       content-type checkboxes, sort select, grid/list view toggle, the
       in-page "content-search" box, "quick path" cards) is, in the source,
       a client-side filter/sort demo running over exactly 6 hardcoded
       `.knowledge-card` articles that also claim to represent a
       "185,420 รายการ" archive (see the stat-list below) — i.e. it's the
       same category of front-end-only mock UI as the search system, just
       for a facet-browsing widget instead of a text box. Rather than
       building a working filter engine around numbers that don't actually
       correspond to any real data, this ports the markup faithfully in its
       *default* state (category "ทั้งหมด" active, "บทความวิชาการ" checked,
       sort "ล่าสุด", view "Card" — matching the 6 cards' pre-sorted
       `data-date` order in the source) with all controls inert. The 4
       "quick path" cards keep one small real behaviour that costs no JS at
       all: they're plain anchors to `#knowledge-content` instead of the
       source's `data-category` buttons, so they still visibly jump to the
       results section.
     - `.reveal` scroll-in-view classes omitted from every className, same
       reasoning as HomePage.tsx (would otherwise stay invisible without the
       IntersectionObserver JS this port doesn't include).
     - The `#toast` "อัปเดตผลลัพธ์แล้ว" notification only ever fired from the
       filter engine above, so it has nothing to report here and isn't
       rendered.

   Known icon-id gaps (see task report): `i-grid` / `i-list` (used by the
   Card/List view-toggle buttons) aren't defined in OrstIconSprite.tsx.
*/

export default function KnowledgePage() {
  return (
    <main id="main-content">
      <section className="knowledge-hero" aria-labelledby="page-title">
        <div className="container hero-inner">
          <div className="hero-copy">
            <span className="eyebrow">National Knowledge Archive</span>
            <h1 id="page-title">คลังองค์ความรู้ของชาติ</h1>
            <p>ค้นหาคำศัพท์ บทความวิชาการ เอกสาร วารสาร และองค์ความรู้สำหรับประชาชนจากราชบัณฑิตยสภาในจุดเดียว</p>

            {/* Mocked search entry point — inert (see file header). */}
            <div className="hero-search" role="search" aria-label="ค้นหาในคลังองค์ความรู้">
              <span className="leading">
                <svg className="icon">
                  <use href="#i-search" />
                </svg>
              </span>
              <label htmlFor="main-search" className="sr-only">
                ค้นหาในคลังองค์ความรู้
              </label>
              <input id="main-search" type="search" placeholder="ค้นหา เช่น ภาษาไทย พจนานุกรม บทความ วารสาร..." autoComplete="off" />
              <button className="btn" type="button">ค้นหา</button>
            </div>

            <div className="quick-chips" aria-label="คำค้นยอดนิยม">
              <button className="chip" type="button">ภาษาไทย</button>
              <button className="chip" type="button">พจนานุกรม</button>
              <button className="chip" type="button">ศัพท์บัญญัติ</button>
              <button className="chip" type="button">วารสาร</button>
              <button className="chip" type="button">เอกสารราชการ</button>
            </div>
          </div>

          <aside className="hero-panel" aria-label="ภาพรวมคลังองค์ความรู้">
            <h2>ภาพรวมคลังองค์ความรู้</h2>
            <div className="stat-list">
              <div className="stat-row">
                <span>องค์ความรู้ทั้งหมด</span>
                <strong>185,420</strong>
              </div>
              <div className="stat-row">
                <span>คำศัพท์</span>
                <strong>82,156</strong>
              </div>
              <div className="stat-row">
                <span>บทความวิชาการ</span>
                <strong>12,847</strong>
              </div>
              <div className="stat-row">
                <span>วารสารและสิ่งพิมพ์</span>
                <strong>3,294</strong>
              </div>
            </div>
            <div className="hero-note">ออกแบบเพื่อค้นพบข้อมูลได้รวดเร็ว พร้อมเชื่อมโยงไปยังเอกสารและบริการที่เกี่ยวข้อง</div>
          </aside>
        </div>
      </section>

      <section className="quick-path-section">
        <div className="container quick-paths">
          <a className="path-card" href="#knowledge-content">
            <span className="path-icon">
              <svg className="icon-lg">
                <use href="#i-book" />
              </svg>
            </span>
            <h3>ภาษาไทย</h3>
            <p>คำศัพท์ การใช้ภาษา และหลักเกณฑ์</p>
          </a>
          <a className="path-card" href="#knowledge-content">
            <span className="path-icon">
              <svg className="icon-lg">
                <use href="#i-file" />
              </svg>
            </span>
            <h3>บทความวิชาการ</h3>
            <p>บทความ วารสาร และเอกสารอ้างอิง</p>
          </a>
          <a className="path-card" href="#knowledge-content">
            <span className="path-icon">
              <svg className="icon-lg">
                <use href="#i-access" />
              </svg>
            </span>
            <h3>สำหรับประชาชน</h3>
            <p>องค์ความรู้เข้าใจง่าย ใช้งานได้จริง</p>
          </a>
          <a className="path-card" href="#knowledge-content">
            <span className="path-icon">
              <svg className="icon-lg">
                <use href="#i-pen" />
              </svg>
            </span>
            <h3>e-Book และเอกสาร</h3>
            <p>อ่านออนไลน์และดาวน์โหลด</p>
          </a>
        </div>
      </section>

      <section className="section alt" id="knowledge-content">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="section-kicker">Knowledge Discovery</span>
              <h2>สำรวจองค์ความรู้</h2>
              <p>ใช้ช่องค้นหา หมวดหมู่ และตัวกรองเพื่อพบข้อมูลที่ตรงความต้องการได้เร็วขึ้น</p>
            </div>
            <div className="view-actions" aria-label="เปลี่ยนรูปแบบการแสดงผล">
              <button className="view-btn active" type="button">
                <svg className="icon">
                  <use href="#i-grid" />
                </svg>{" "}
                Card
              </button>
              <button className="view-btn" type="button">
                <svg className="icon">
                  <use href="#i-list" />
                </svg>{" "}
                List
              </button>
            </div>
          </div>

          <div className="knowledge-layout">
            <aside className="filter-panel" aria-label="ตัวกรองคลังองค์ความรู้">
              <div className="filter-title">
                <h2>ตัวกรองข้อมูล</h2>
                <button type="button">ล้างค่า</button>
              </div>
              <div className="filter-group">
                <h3>หมวดหมู่</h3>
                <button className="category-btn active" type="button">
                  <span>ทั้งหมด</span>
                  <small>185,420</small>
                </button>
                <button className="category-btn" type="button">
                  <span>ภาษาไทย</span>
                  <small>45,230</small>
                </button>
                <button className="category-btn" type="button">
                  <span>วิทยาศาสตร์</span>
                  <small>28,456</small>
                </button>
                <button className="category-btn" type="button">
                  <span>ศิลปกรรม</span>
                  <small>15,892</small>
                </button>
                <button className="category-btn" type="button">
                  <span>สังคมศาสตร์</span>
                  <small>22,104</small>
                </button>
                <button className="category-btn" type="button">
                  <span>บทความวิชาการ</span>
                  <small>12,847</small>
                </button>
                <button className="category-btn" type="button">
                  <span>องค์ความรู้สำหรับประชาชน</span>
                  <small>19,868</small>
                </button>
              </div>
              <div className="filter-group">
                <h3>ประเภทเนื้อหา</h3>
                <label className="check-row">
                  <input type="checkbox" /> คำศัพท์/นิยาม
                </label>
                <label className="check-row">
                  <input type="checkbox" defaultChecked /> บทความวิชาการ
                </label>
                <label className="check-row">
                  <input type="checkbox" /> เอกสารเผยแพร่
                </label>
                <label className="check-row">
                  <input type="checkbox" /> e-Book
                </label>
              </div>
              <div className="filter-cta">
                <strong>แนะนำการค้นหา</strong>เริ่มจากคำกว้าง ๆ เช่น "ภาษาไทย" แล้วค่อยจำกัดประเภทด้วยตัวกรองด้านบน
              </div>
            </aside>

            <div className="knowledge-main">
              <div className="content-toolbar">
                <div className="search-box">
                  <svg className="icon">
                    <use href="#i-search" />
                  </svg>
                  <label htmlFor="content-search" className="sr-only">
                    ค้นหาในรายการองค์ความรู้
                  </label>
                  <input id="content-search" type="search" placeholder="ค้นหาในรายการ เช่น ปัญญาประดิษฐ์ ภาษาไทย เอกสารราชการ" />
                </div>
                <select id="sort-select" className="sort-select" aria-label="เรียงลำดับผลลัพธ์" defaultValue="latest">
                  <option value="latest">เรียงตามล่าสุด</option>
                  <option value="popular">เรียงตามความนิยม</option>
                  <option value="az">เรียงตามตัวอักษร ก-ฮ</option>
                </select>
                <a className="btn secondary" href="#filter-panel">ปรับตัวกรอง</a>
              </div>

              <article className="featured-article">
                <div className="featured-media">
                  <span className="badge">บทความแนะนำ</span>
                </div>
                <div className="featured-body">
                  <div className="meta">
                    <span>บทความวิชาการ</span>
                    <span>ภาษาไทย</span>
                    <span>15 มกราคม 2568</span>
                  </div>
                  <h2>พจนานุกรมฉบับราชบัณฑิตยสภา: การปรับปรุงคำศัพท์ยุคใหม่</h2>
                  <p>บทความเกี่ยวกับการปรับปรุงพจนานุกรมให้ทันต่อเทคโนโลยี วิทยาศาสตร์ และสังคมร่วมสมัย พร้อมแนวทางการใช้คำที่ถูกต้อง</p>
                  <div className="article-actions">
                    <a className="btn" href="#">อ่านบทความ</a>
                    <a className="btn secondary" href="#">บันทึกไว้ก่อน</a>
                  </div>
                </div>
              </article>

              <div className="result-count" id="result-count">กำลังแสดงรายการองค์ความรู้</div>
              <div className="knowledge-grid" id="knowledge-grid">
                <article className="knowledge-card">
                  <div className="card-top">
                    <span className="type-tag">คำศัพท์</span>
                    <small>อัปเดตล่าสุด</small>
                  </div>
                  <h3>ภาษาไทย</h3>
                  <p>ภาษาราชการและภาษาประจำชาติของประเทศไทย มีเอกลักษณ์เฉพาะตัวและมีหลักเกณฑ์การใช้ที่สำคัญ</p>
                  <div className="card-foot">
                    <span>ฐานข้อมูลคำศัพท์</span>
                    <a className="read-link" href="#">ดูรายละเอียด →</a>
                  </div>
                </article>
                <article className="knowledge-card">
                  <div className="card-top">
                    <span className="type-tag">บทความ</span>
                    <small>PDF</small>
                  </div>
                  <h3>การพัฒนาการใช้ภาษาไทยในยุคดิจิทัล</h3>
                  <p>ศึกษาแนวโน้มการใช้ภาษาไทยในสื่อดิจิทัล และข้อเสนอเพื่อรักษามาตรฐานภาษาในสภาพแวดล้อมใหม่</p>
                  <div className="card-foot">
                    <span>โดย ศ.ดร.สมศรี วิทยาการ</span>
                    <a className="read-link" href="#">อ่านบทความ →</a>
                  </div>
                </article>
                <article className="knowledge-card">
                  <div className="card-top">
                    <span className="type-tag">เอกสาร</span>
                    <small>PDF 2.5 MB</small>
                  </div>
                  <h3>แนวทางการใช้ภาษาไทยในเอกสารราชการ พ.ศ. 2567</h3>
                  <p>เอกสารแนวทางการเขียนเอกสารราชการภาษาไทย ฉบับปรับปรุงใหม่ พร้อมตัวอย่างการใช้งาน</p>
                  <div className="card-foot">
                    <span>เอกสารเผยแพร่</span>
                    <a className="read-link" href="#">ดาวน์โหลด PDF →</a>
                  </div>
                </article>
                <article className="knowledge-card">
                  <div className="card-top">
                    <span className="type-tag">ศัพท์บัญญัติ</span>
                    <small>วิทยาศาสตร์</small>
                  </div>
                  <h3>ปัญญาประดิษฐ์ (Artificial Intelligence)</h3>
                  <p>ความสามารถของเครื่องจักรในการเรียนรู้ คิด วิเคราะห์ และตัดสินใจโดยอาศัยข้อมูลหรือแบบจำลอง</p>
                  <div className="card-foot">
                    <span>ศัพท์วิทยาศาสตร์</span>
                    <a className="read-link" href="#">ดูคำนิยาม →</a>
                  </div>
                </article>
                <article className="knowledge-card">
                  <div className="card-top">
                    <span className="type-tag">ศิลปกรรม</span>
                    <small>บทความ</small>
                  </div>
                  <h3>วรรณกรรมรัตนโกสินทร์: มรดกทางภาษาและวัฒนธรรม</h3>
                  <p>บทความเกี่ยวกับคุณค่าของวรรณกรรมไทยในเชิงภาษา สังคม และประวัติศาสตร์วัฒนธรรม</p>
                  <div className="card-foot">
                    <span>หมวดศิลปกรรม</span>
                    <a className="read-link" href="#">อ่านต่อ →</a>
                  </div>
                </article>
                <article className="knowledge-card">
                  <div className="card-top">
                    <span className="type-tag">e-Book</span>
                    <small>EPUB</small>
                  </div>
                  <h3>ประวัติศาสตร์ภาษาไทย</h3>
                  <p>หนังสือเรียนรู้เกี่ยวกับวิวัฒนาการของภาษาไทยตั้งแต่อดีตจนถึงปัจจุบัน เหมาะสำหรับประชาชนทั่วไป</p>
                  <div className="card-foot">
                    <span>อ่านออนไลน์</span>
                    <a className="read-link" href="#">เปิด e-Book →</a>
                  </div>
                </article>
              </div>

              <div className="empty-state" id="empty-state">
                <strong>ไม่พบข้อมูลที่ตรงกับการค้นหา</strong>
                <br />
                ลองลดตัวกรอง หรือใช้คำค้นอื่น เช่น "ภาษาไทย", "พจนานุกรม", "บทความ"
              </div>

              <nav aria-label="การแบ่งหน้า" className="pagination">
                <button disabled>ก่อนหน้า</button>
                <button className="active">1</button>
                <button>2</button>
                <button>3</button>
                <button>...</button>
                <button>156</button>
                <button>ถัดไป</button>
              </nav>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
