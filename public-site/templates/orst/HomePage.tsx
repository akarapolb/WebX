import { MediaTabs, NewsEventsTabs, ScrollButton } from "./HomeInteractive";
import type { WpEntry } from "@/lib/cms";

/* =============================================================================
   HomePage.tsx — React port of the ORST static site's index.html
   -----------------------------------------------------------------------------
   Ported 1:1 from "ORST Website/index.html" (see task) — everything between
   `<div id="app-header">` and `<div id="app-footer">`, i.e. the
   `<main id="main-content">` element. Header/Footer chrome, the icon sprite
   (already in OrstIconSprite.tsx, mounted once in app/orst/layout.tsx) and
   the skip-link are provided by the surrounding route, not this file — see
   app/orst/page.tsx.

   Class names are copied verbatim from public/assets/orst/css/pages/home.css
   (10k+ lines, not re-read line-by-line here beyond spot checks — every
   class below was taken directly from the source HTML, not invented).

   Intentionally NOT ported (see task report for the full list with reasons):
     - The global "Smart Search" hero form + popular-query chips, and the
       hidden `#knowledge` search-results section that only ever appears via
       that search's JS. HANDOFF.md documents this whole system as a mock
       (`searchData` array in pages/home.js) — same treatment as Header.tsx's
       inert round-btn search button.
     - `.reveal` scroll-in-view classes (home.css: opacity:0 by default,
       flipped to opacity:1 only by an IntersectionObserver in
       components.js/pages/home.js that isn't built here). Omitted from
       every className so content renders immediately instead of staying
       invisible.
     - The accessibility floating button/panel, service-request modal, and
       back-to-top button: all live AFTER `<div id="app-footer">` in the
       source (i.e. outside the header/footer range this file ports), and
       Header.tsx/Footer.tsx's own comments already flag them as shared,
       cross-page utility UI nobody has built yet in this repo. The
       "เริ่มสอบถาม" / "ยื่นคำขอ" / etc. buttons in #service-hub that used to
       open that modal are rendered here as plain, inert buttons.
     - The orphaned "research" media panel (no tab button points at it in
       the source either) — see HomeInteractive.tsx's file comment.
*/

export type HomeHero = Pick<WpEntry, "title" | "excerpt" | "content">;

/* Hero copy comes from the WP page slug "home" (see app/orst/page.tsx),
   normalized to the plain WpEntry shape {title, excerpt, content}. Mapped as:
     - title   (WP page title, plain)   -> the <h1> headline
     - excerpt (WP excerpt, stripped)   -> the short kicker tagline
     - content (WP content, raw HTML)   -> the lead paragraph, rendered with
       dangerouslySetInnerHTML (same convention as Blocks.tsx's rich-text
       block) — hence the wrapping <div> instead of <p> in that branch, since
       WP content already comes wrapped in its own <p> tag.
   `hero` is null when the page hasn't been seeded in WordPress yet — falls
   back to the exact original hardcoded copy so a missing WP page never
   breaks the homepage. */
export default function HomePage({ hero, faqs }: { hero: HomeHero | null; faqs: WpEntry[] }) {
  return (
    <main id="main-content">
      <section className="hero hero-reference orst-hero-wow" aria-labelledby="hero-title">
        <div className="container orst-hero-wrap">
          <div className="orst-hero-content">
            <span className="orst-hero-kicker">{hero?.excerpt || "สถาบันความรู้ของชาติสำหรับประชาชนทุกกลุ่ม"}</span>

            {hero?.title ? (
              <h1 id="hero-title" className="orst-hero-title">
                {hero.title}
              </h1>
            ) : (
              <h1 id="hero-title" className="orst-hero-title">
                สถาบันความรู้ของชาติ
                <br />
                สำหรับสังคมไทยที่เรียนรู้อย่างยั่งยืน
              </h1>
            )}

            {hero?.content ? (
              <div className="orst-hero-lead" dangerouslySetInnerHTML={{ __html: hero.content }} />
            ) : (
              <p className="orst-hero-lead">
                แหล่งรวมองค์ความรู้ มาตรฐานภาษาไทย และข้อมูลวิชาการ ค้นหาได้จากจุดเดียว ใช้งานง่าย และเข้าถึงได้สำหรับทุกคน
              </p>
            )}

            {/* Global "Smart Search" — mocked in the source (HANDOFF.md 6.1/6.2),
                rendered here as inert markup (no form element, no handlers) so
                nothing navigates or throws on submit. */}
            <div className="orst-smart-search hero-search search-form" role="search" aria-label="ค้นหาองค์ความรู้">
              <span className="orst-search-orb" aria-hidden="true">
                <svg className="icon">
                  <use href="#i-search" />
                </svg>
              </span>
              <label className="sr-only" htmlFor="global-search">
                ค้นหาองค์ความรู้
              </label>
              <input
                id="global-search"
                type="search"
                autoComplete="off"
                placeholder="ค้นหาองค์ความรู้ คำศัพท์ พจนานุกรม สื่อ สิ่งพิมพ์ และอื่น ๆ..."
              />
              <button className="orst-search-submit" type="button" aria-label="ค้นหา">
                <svg className="icon" aria-hidden="true">
                  <use href="#i-search" />
                </svg>
                ค้นหา
              </button>
            </div>

            <div className="orst-popular-shell" aria-label="ตัวอย่างคำค้นสำหรับตรวจสอบภาษาและองค์ความรู้">
              <span className="orst-popular-title">ตัวอย่างคำค้นที่พบบ่อย</span>

              <div className="hero-popular popular-row orst-popular-row orst-popular-primary">
                <button type="button" className="chip">คำศัพท์</button>
                <button type="button" className="chip">การสะกดคำ</button>
                <button type="button" className="chip">คำอ่าน</button>
                <button type="button" className="chip">คำทับศัพท์</button>
                <button type="button" className="chip">ศัพท์บัญญัติ</button>
                <button type="button" className="chip">พจนานุกรม</button>
                <button type="button" className="chip">ดิจิทัล</button>
                <button type="button" className="chip">เว็บไซต์</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="คุณค่าหลักของเว็บไซต์">
        <div className="container trust-grid">
          <article className="trust-item">
            <svg className="icon trust-icon">
              <use href="#i-book" />
            </svg>
            <div>
              <h3>เชื่อถือได้</h3>
              <p>ข้อมูลจากแหล่งวิชาการที่ผ่านการตรวจสอบ</p>
            </div>
          </article>
          <article className="trust-item">
            <svg className="icon trust-icon">
              <use href="#i-shield" />
            </svg>
            <div>
              <h3>มาตรฐานภาษาไทย</h3>
              <p>อ้างอิงด้านภาษาและวิชาการของประเทศ</p>
            </div>
          </article>
          <article className="trust-item">
            <svg className="icon trust-icon">
              <use href="#i-people" />
            </svg>
            <div>
              <h3>เข้าถึงง่าย</h3>
              <p>ออกแบบเพื่อประชาชนทุกกลุ่มและทุกอุปกรณ์</p>
            </div>
          </article>
          <article className="trust-item">
            <svg className="icon trust-icon">
              <use href="#i-access" />
            </svg>
            <div>
              <h3>เพื่อทุกคน</h3>
              <p>รองรับผู้สูงอายุ ผู้พิการ และการใช้แป้นพิมพ์</p>
            </div>
          </article>
        </div>
      </section>

      <section className="section alt" id="services">
        <div className="container">
          <div className="section-head">
            <div>
              <h2>บริการและแหล่งความรู้</h2>
              <p>เข้าถึงองค์ความรู้และบริการของราชบัณฑิตยสภาได้อย่างสะดวก</p>
            </div>
            <a className="view-all" href="#service-hub">ดูบริการทั้งหมด →</a>
          </div>
          <div className="service-grid">
            <a className="service-card" href="#knowledge">
              <span className="service-icon">
                <svg className="icon-lg">
                  <use href="#i-book" />
                </svg>
              </span>
              <h3>พจนานุกรม</h3>
              <p>ค้นความหมายและการใช้คำตามมาตรฐานภาษาไทย</p>
              <span className="arrow">›</span>
            </a>
            <a className="service-card" href="#knowledge">
              <span className="service-icon">
                <svg className="icon-lg">
                  <use href="#i-form" />
                </svg>
              </span>
              <h3>ศัพท์บัญญัติ</h3>
              <p>ศัพท์เฉพาะทางและคำมาตรฐาน</p>
              <span className="arrow">›</span>
            </a>
            <a className="service-card" href="#archive">
              <span className="service-icon">
                <svg className="icon-lg">
                  <use href="#i-search" />
                </svg>
              </span>
              <h3>ค้นคว้าข้อมูล</h3>
              <p>ระบบค้นหาข้อมูลวิชาการ เอกสาร และงานวิจัย</p>
              <span className="arrow">›</span>
            </a>
            <a className="service-card" href="#archive">
              <span className="service-icon">
                <svg className="icon-lg">
                  <use href="#i-shield" />
                </svg>
              </span>
              <h3>มาตรฐานและกฎเกณฑ์</h3>
              <p>มาตรฐานภาษาไทยและหลักเกณฑ์การใช้ภาษา</p>
              <span className="arrow">›</span>
            </a>
            <a className="service-card" href="#news">
              <span className="service-icon">
                <svg className="icon-lg">
                  <use href="#i-file" />
                </svg>
              </span>
              <h3>ข่าวและประกาศ</h3>
              <p>ข่าวสารและประกาศจากสำนักงาน</p>
              <span className="arrow">›</span>
            </a>
            <a className="service-card" href="#publications">
              <span className="service-icon">
                <svg className="icon-lg">
                  <use href="#i-phone" />
                </svg>
              </span>
              <h3>หนังสือและตำรา</h3>
              <p>หนังสือ ตำรา และเอกสารวิชาการออนไลน์</p>
              <span className="arrow">›</span>
            </a>
            <a className="service-card" href="#knowledge">
              <span className="service-icon">
                <svg className="icon-lg">
                  <use href="#i-file" />
                </svg>
              </span>
              <h3>ฐานข้อมูล</h3>
              <p>ฐานข้อมูลงานวิชาการและองค์ความรู้</p>
              <span className="arrow">›</span>
            </a>
            <a className="service-card" href="#archive">
              <span className="service-icon">
                <svg className="icon-lg">
                  <use href="#i-puzzle" />
                </svg>
              </span>
              <h3>คลังความรู้</h3>
              <p>บทความ องค์ความรู้ และสื่อการเรียนรู้</p>
              <span className="arrow">›</span>
            </a>
            <a className="service-card" href="#publications">
              <span className="service-icon">
                <svg className="icon-lg">
                  <use href="#i-video" />
                </svg>
              </span>
              <h3>สื่อดิจิทัล</h3>
              <p>สื่อวิดีโอ สื่อเสียง และสื่อมัลติมีเดีย</p>
              <span className="arrow">›</span>
            </a>
            <a className="service-card" href="#service-hub">
              <span className="service-icon">
                <svg className="icon-lg">
                  <use href="#i-pen" />
                </svg>
              </span>
              <h3>บริการวิชาการ</h3>
              <p>คำปรึกษา แบบฟอร์ม และการติดต่อราชการ</p>
              <span className="arrow">›</span>
            </a>
          </div>
        </div>
      </section>

      <section className="section knowledge-hub-section" id="publications">
        <div className="container">
          <div className="section-head knowledge-hub-head">
            <div>
              <span className="section-kicker">KNOWLEDGE HUB</span>
              <h2>คลังสื่อและองค์ความรู้</h2>
              <p>รวม E-Book วารสาร สารานุกรม งานวิจัย และสื่อมัลติมีเดีย เพื่อการเรียนรู้อย่างต่อเนื่อง</p>
            </div>
            <a className="view-all media-view-all-link" href="/orst/publications">
              ดู E-Book ทั้งหมด →
            </a>
          </div>

          <MediaTabs
            tabs={[
              {
                id: "ebook",
                label: "หนังสืออิเล็กทรอนิกส์",
                panel: (
                  <div className="publication-shell media-tab-shell">
                    <ScrollButton rowId="ebook-row" dir="left" label="เลื่อน E-Book ไปทางซ้าย" />
                    <div className="publication-row knowledge-scroll-row" id="ebook-row">
                      <article className="pub-card hub-tile">
                        <div className="cover cover-image">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/e-Book01.png" alt="พจนานุกรมฉบับราชบัณฑิตยสถาน พ.ศ. 2554" loading="lazy" />
                        </div>
                        <p>จดหมายข่าว ปีที่ ๒๓ ฉบับที่ ๒๖๗ สิงหาคม ๒๕๕๖</p>
                      </article>
                      <article className="pub-card hub-tile">
                        <div className="cover cover-image">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/e-Book02.png" alt="สารานุกรมไทยสำหรับเยาวชนฯ" loading="lazy" />
                        </div>
                        <p>จดหมายข่าว ปีที่ ๑๕ ฉบับที่ ๑๖๔ – มกราคม ๒๕๔๘</p>
                      </article>
                      <article className="pub-card hub-tile">
                        <div className="cover cover-image">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/e-Book03.png" alt="วรรณกรรมรัตนโกสินทร์ เล่ม 1" loading="lazy" />
                        </div>
                        <p>วารสารราชบัณฑิตยสภา (ฉบับภาษาไทย) ปี ๔๗ ฉบับที่ ๓</p>
                      </article>
                      <article className="pub-card hub-tile">
                        <div className="cover cover-image">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/e-Book06.png" alt="ภาษาไทยร่วมสมัย" loading="lazy" />
                        </div>
                        <p>จดหมายข่าว ปีที่ ๒๑ ฉบับที่ ๒๓๙ เมษายน ๒๕๕๔</p>
                      </article>
                      <article className="pub-card hub-tile">
                        <div className="cover cover-image">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/e-Book07.png" alt="พจนานุกรมฉบับราชบัณฑิตยสถาน พ.ศ. 2554" loading="lazy" />
                        </div>
                        <p>พจนานุกรมศัพท์การหล่อโลหะ</p>
                      </article>
                      <article className="pub-card hub-tile">
                        <div className="cover cover-image">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/e-Book08.png" alt="สารานุกรมไทยสำหรับเยาวชนฯ" loading="lazy" />
                        </div>
                        <p>จุลสารสำนักวิทยาศาสตร์ ปีที่ ๔ ฉบับที่ ๔ (ตุลาคม-ธันวาคม ๒๕๖๘)</p>
                      </article>
                      <article className="pub-card hub-tile">
                        <div className="cover cover-image">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/e-Book03.png" alt="วรรณกรรมรัตนโกสินทร์ เล่ม 1" loading="lazy" />
                        </div>
                        <p>วรรณกรรมรัตนโกสินทร์ เล่ม 1</p>
                      </article>
                    </div>
                    <ScrollButton rowId="ebook-row" dir="right" label="เลื่อน E-Book ไปทางขวา" />
                  </div>
                ),
              },
              {
                id: "journals",
                label: "สื่อสิ่งพิมพ์",
                panel: (
                  <div className="publication-shell media-tab-shell">
                    <ScrollButton rowId="journals-row" dir="left" label="เลื่อนวารสารไปทางซ้าย" />
                    <div className="publication-row knowledge-scroll-row" id="journals-row">
                      <article className="pub-card hub-tile">
                        <div className="cover cover-image">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/e-Book04.png" alt="บทความวิชาการราชบัณฑิตยสภาฉบับล่าสุด" loading="lazy" />
                        </div>
                        <p>บทความวิชาการราชบัณฑิตยสภาฉบับล่าสุด</p>
                      </article>
                      <article className="pub-card hub-tile">
                        <div className="cover cover-image">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/e-Book05.png" alt="จดหมายเหตุราชบัณฑิตยสภา" loading="lazy" />
                        </div>
                        <p>จดหมายเหตุราชบัณฑิตยสภา</p>
                      </article>
                      <article className="pub-card hub-tile text-card">
                        <div className="knowledge-text-cover">
                          <span>Journal</span>
                          <strong>วารสารราชบัณฑิตยสภา</strong>
                        </div>
                        <p>วารสารราชบัณฑิตยสภาและบทความเผยแพร่</p>
                      </article>
                      <article className="pub-card hub-tile text-card">
                        <div className="knowledge-text-cover">
                          <span>Article</span>
                          <strong>บทความภาษาไทย</strong>
                        </div>
                        <p>บทความด้านภาษา วัฒนธรรม และองค์ความรู้ร่วมสมัย</p>
                      </article>
                      <article className="pub-card hub-tile text-card">
                        <div className="knowledge-text-cover">
                          <span>Journal</span>
                          <strong>วารสารราชบัณฑิตยสภา</strong>
                        </div>
                        <p>วารสารราชบัณฑิตยสภาและบทความเผยแพร่</p>
                      </article>
                      <article className="pub-card hub-tile text-card">
                        <div className="knowledge-text-cover">
                          <span>Journal</span>
                          <strong>วารสารราชบัณฑิตยสภา</strong>
                        </div>
                        <p>วารสารราชบัณฑิตยสภาและบทความเผยแพร่</p>
                      </article>
                      <article className="pub-card hub-tile text-card">
                        <div className="knowledge-text-cover">
                          <span>Journal</span>
                          <strong>วารสารราชบัณฑิตยสภา</strong>
                        </div>
                        <p>วารสารราชบัณฑิตยสภาและบทความเผยแพร่</p>
                      </article>
                    </div>
                    <ScrollButton rowId="journals-row" dir="right" label="เลื่อนวารสารไปทางขวา" />
                  </div>
                ),
              },
              {
                id: "encyclopedia",
                label: "อินโฟกราฟิก",
                panel: (
                  <div className="publication-shell media-tab-shell">
                    <ScrollButton rowId="encyclopedia-row" dir="left" label="เลื่อนสารานุกรมไปทางซ้าย" />
                    <div className="publication-row knowledge-scroll-row" id="encyclopedia-row">
                      <article className="pub-card hub-tile">
                        <div className="cover cover-image">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/e-Book02.png" alt="สารานุกรมไทยสำหรับเยาวชนฯ" loading="lazy" />
                        </div>
                        <p>สารานุกรมไทยสำหรับเยาวชนฯ</p>
                      </article>
                      <article className="pub-card hub-tile text-card">
                        <div className="knowledge-text-cover">
                          <span>Reference</span>
                          <strong>คลังความรู้ไทย</strong>
                        </div>
                        <p>องค์ความรู้สำหรับนักเรียน ครู และประชาชนทั่วไป</p>
                      </article>
                      <article className="pub-card hub-tile text-card">
                        <div className="knowledge-text-cover">
                          <span>Learning</span>
                          <strong>ความรู้รอบตัว</strong>
                        </div>
                        <p>เนื้อหาอ้างอิงเพื่อการเรียนรู้ต่อเนื่อง</p>
                      </article>
                      <article className="pub-card hub-tile text-card">
                        <div className="knowledge-text-cover">
                          <span>Reference</span>
                          <strong>คลังความรู้ไทย</strong>
                        </div>
                        <p>องค์ความรู้สำหรับนักเรียน ครู และประชาชนทั่วไป</p>
                      </article>
                      <article className="pub-card hub-tile text-card">
                        <div className="knowledge-text-cover">
                          <span>Learning</span>
                          <strong>ความรู้รอบตัว</strong>
                        </div>
                        <p>เนื้อหาอ้างอิงเพื่อการเรียนรู้ต่อเนื่อง</p>
                      </article>
                      <article className="pub-card hub-tile text-card">
                        <div className="knowledge-text-cover">
                          <span>Reference</span>
                          <strong>คลังความรู้ไทย</strong>
                        </div>
                        <p>องค์ความรู้สำหรับนักเรียน ครู และประชาชนทั่วไป</p>
                      </article>
                      <article className="pub-card hub-tile text-card">
                        <div className="knowledge-text-cover">
                          <span>Learning</span>
                          <strong>ความรู้รอบตัว</strong>
                        </div>
                        <p>เนื้อหาอ้างอิงเพื่อการเรียนรู้ต่อเนื่อง</p>
                      </article>
                    </div>
                    <ScrollButton rowId="encyclopedia-row" dir="right" label="เลื่อนสารานุกรมไปทางขวา" />
                  </div>
                ),
              },
              {
                id: "multimedia",
                label: "สื่อมัลติมีเดีย",
                panel: (
                  <div className="publication-shell media-tab-shell">
                    <ScrollButton rowId="multimedia-row" dir="left" label="เลื่อนสื่อมัลติมีเดียไปทางซ้าย" />
                    <div className="media-row knowledge-scroll-row" id="multimedia-row">
                      <article className="media-card hub-tile">
                        <div className="media-thumb has-photo">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/Mult-01.png" alt="ภาษาไทย: มรดกและการถ่ายทอดจากรุ่นสู่รุ่น" loading="lazy" />
                        </div>
                        <p>ภาษาไทย: มรดกและการถ่ายทอดจากรุ่นสู่รุ่น</p>
                      </article>
                      <article className="media-card hub-tile">
                        <div className="media-thumb has-photo">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/Mult-02.png" alt="บทบาทของราชบัณฑิตยสภากับสังคมไทย" loading="lazy" />
                        </div>
                        <p>บทบาทของราชบัณฑิตยสภากับสังคมไทย</p>
                      </article>
                      <article className="media-card hub-tile">
                        <div className="media-thumb has-photo">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/Mult-03.png" alt="พาทีเที่ยว: ศิลปวัฒนธรรมไทยที่ควรรู้" loading="lazy" />
                        </div>
                        <p>พาทีเที่ยว: ศิลปวัฒนธรรมไทยที่ควรรู้</p>
                      </article>
                      <article className="media-card hub-tile">
                        <div className="media-thumb has-photo">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/Mult-04.png" alt="การใช้ภาษาไทยในยุคดิจิทัลอย่างถูกต้อง" loading="lazy" />
                        </div>
                        <p>การใช้ภาษาไทยในยุคดิจิทัลอย่างถูกต้อง</p>
                      </article>
                    </div>
                    <ScrollButton rowId="multimedia-row" dir="right" label="เลื่อนสื่อมัลติมีเดียไปทางขวา" />
                  </div>
                ),
              },
            ]}
          />
        </div>
      </section>

      <section className="section alt news-events-section" id="news">
        <div className="container">
          <div className="section-head news-events-head">
            <div>
              <span className="section-kicker">NEWS & EVENTS</span>
              <h2>ข่าวสารและกิจกรรม</h2>
              <p>ติดตามข่าวสำคัญ ประกาศ กิจกรรม อบรม และกำหนดการของสำนักงานราชบัณฑิตยสภา</p>
            </div>
            <a href="/orst/news" className="view-all">
              ดูข่าวเพิ่มเติม →
            </a>
          </div>

          <NewsEventsTabs
            tabs={[
              {
                id: "news",
                label: "ข่าว",
                panel: (
                  <div className="news-mosaic-layout">
                    <article className="news-mosaic-feature">
                      <a href="#" className="news-mosaic-feature-img" aria-label="อ่านข่าวการประชุมใหญ่สามัญประจำปี 2567">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/assets/orst/images/New-01.png" alt="การประชุมใหญ่สามัญประจำปี 2567" loading="lazy" />
                        <span className="news-type-badge">ข่าวประชาสัมพันธ์</span>
                      </a>
                      <div className="news-mosaic-feature-body">
                        <div className="news-meta">
                          <span>24 พฤษภาคม 2567</span>
                          <span>ข่าวประชาสัมพันธ์</span>
                        </div>
                        <h3>การประชุมใหญ่สามัญประจำปี 2567</h3>
                        <p>รายงานผลการดำเนินงาน ทิศทางการพัฒนาองค์กร และบทบาทของราชบัณฑิตยสภาในการสนับสนุนองค์ความรู้ของชาติ</p>
                        <a className="news-primary-action" href="#">อ่านต่อ →</a>
                      </div>
                    </article>
                    <div className="news-mosaic-side">
                      <article className="news-mosaic-card">
                        <a href="#" className="news-mosaic-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/New-02.png" alt="ความเคลื่อนไหวของราชบัณฑิตยสภา" loading="lazy" />
                        </a>
                        <div className="news-mosaic-card-body">
                          <span className="news-mini-type">ข่าว</span>
                          <h4>ความเคลื่อนไหวของราชบัณฑิตยสภา</h4>
                          <p>ข่าวสารภารกิจ การประชุม และกิจกรรมด้านองค์ความรู้ของสำนักงานราชบัณฑิตยสภา</p>
                          <a href="#">อ่านต่อ →</a>
                        </div>
                      </article>
                      <article className="news-mosaic-card">
                        <a href="#" className="news-mosaic-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/New-02.png" alt="การพัฒนาระบบคลังองค์ความรู้ของชาติ" loading="lazy" />
                        </a>
                        <div className="news-mosaic-card-body">
                          <span className="news-mini-type">องค์กร</span>
                          <h4>การพัฒนาระบบคลังองค์ความรู้ของชาติ</h4>
                          <p>ยกระดับการเข้าถึงพจนานุกรม ศัพท์บัญญัติ และองค์ความรู้ให้ประชาชนใช้งานง่ายขึ้น</p>
                          <a href="#">อ่านต่อ →</a>
                        </div>
                      </article>
                      <article className="news-mosaic-card">
                        <a href="#" className="news-mosaic-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/New-01.png" alt="เปิดบริการข้อมูลภาษาไทยรูปแบบดิจิทัล" loading="lazy" />
                        </a>
                        <div className="news-mosaic-card-body">
                          <span className="news-mini-type">ดิจิทัล</span>
                          <h4>เปิดบริการข้อมูลภาษาไทยรูปแบบดิจิทัล</h4>
                          <p>ประชาชนสามารถค้นหาข้อมูลภาษาไทยและเอกสารอ้างอิงจากระบบออนไลน์ได้สะดวกขึ้น</p>
                          <a href="#">อ่านต่อ →</a>
                        </div>
                      </article>
                      <article className="news-mosaic-card">
                        <a href="#" className="news-mosaic-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/New-01.png" alt="เผยแพร่องค์ความรู้ด้านภาษาไทยร่วมสมัย" loading="lazy" />
                        </a>
                        <div className="news-mosaic-card-body">
                          <span className="news-mini-type">องค์ความรู้</span>
                          <h4>เผยแพร่องค์ความรู้ด้านภาษาไทยร่วมสมัย</h4>
                          <p>รวบรวมบทความและสื่อความรู้เพื่อสนับสนุนการใช้ภาษาไทยอย่างถูกต้องในสังคมปัจจุบัน</p>
                          <a href="#">อ่านต่อ →</a>
                        </div>
                      </article>
                    </div>
                  </div>
                ),
              },
              {
                id: "training",
                label: "อบรม",
                panel: (
                  <div className="news-mosaic-layout">
                    <article className="news-mosaic-feature">
                      <a href="#" className="news-mosaic-feature-img" aria-label="อบรมการใช้ภาษาไทยในงานราชการ">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/assets/orst/images/New-01.png" alt="อบรมการใช้ภาษาไทยในงานราชการ" loading="lazy" />
                        <span className="news-type-badge">เปิดลงทะเบียน</span>
                      </a>
                      <div className="news-mosaic-feature-body">
                        <div className="news-meta">
                          <span>18 มิถุนายน 2567</span>
                          <span>อบรม</span>
                        </div>
                        <h3>อบรมการใช้ภาษาไทยในงานราชการ</h3>
                        <p>แนวทางการใช้ภาษาไทยที่ถูกต้อง ชัดเจน และเหมาะสมกับเอกสารราชการ พร้อมตัวอย่างการใช้งานจริง</p>
                        <a className="news-primary-action" href="#">อ่านต่อ →</a>
                      </div>
                    </article>
                    <div className="news-mosaic-side">
                      <article className="news-mosaic-card">
                        <a href="#" className="news-mosaic-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/New-01.png" alt="อบรมการเขียนเอกสารราชการ" loading="lazy" />
                        </a>
                        <div className="news-mosaic-card-body">
                          <span className="news-mini-type">ออนไลน์</span>
                          <h4>อบรมการเขียนเอกสารราชการให้ถูกต้อง</h4>
                          <p>เรียนรู้รูปแบบหนังสือราชการ การใช้ถ้อยคำ และการเรียบเรียงข้อความอย่างเป็นทางการ</p>
                          <a href="#">อ่านต่อ →</a>
                        </div>
                      </article>
                      <article className="news-mosaic-card">
                        <a href="#" className="news-mosaic-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/New-02.png" alt="ภาษาไทยในยุคดิจิทัล" loading="lazy" />
                        </a>
                        <div className="news-mosaic-card-body">
                          <span className="news-mini-type">สัมมนา</span>
                          <h4>ภาษาไทยในยุคดิจิทัล</h4>
                          <p>ประเด็นการใช้คำร่วมสมัย คำทับศัพท์ และศัพท์บัญญัติในสื่อดิจิทัลและเอกสารสาธารณะ</p>
                          <a href="#">อ่านต่อ →</a>
                        </div>
                      </article>
                      <article className="news-mosaic-card">
                        <a href="#" className="news-mosaic-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/New-03.png" alt="การค้นหาองค์ความรู้จากฐานข้อมูล" loading="lazy" />
                        </a>
                        <div className="news-mosaic-card-body">
                          <span className="news-mini-type">อบรม</span>
                          <h4>การค้นหาองค์ความรู้จากฐานข้อมูลราชบัณฑิตยสภา</h4>
                          <p>แนะนำการใช้พจนานุกรม ศัพท์บัญญัติ วารสาร และ E-Book ผ่านระบบออนไลน์ของสำนักงาน</p>
                          <a href="#">อ่านต่อ →</a>
                        </div>
                      </article>
                      <article className="news-mosaic-card">
                        <a href="#" className="news-mosaic-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/New-01.png" alt="อบรมการใช้คำทับศัพท์และศัพท์บัญญัติ" loading="lazy" />
                        </a>
                        <div className="news-mosaic-card-body">
                          <span className="news-mini-type">ภาษาไทย</span>
                          <h4>อบรมการใช้คำทับศัพท์และศัพท์บัญญัติ</h4>
                          <p>ทำความเข้าใจหลักการใช้คำทับศัพท์และศัพท์บัญญัติให้เหมาะสมกับบริบทการสื่อสาร</p>
                          <a href="#">อ่านต่อ →</a>
                        </div>
                      </article>
                    </div>
                  </div>
                ),
              },
              {
                id: "event",
                label: "กิจกรรม",
                panel: (
                  <div className="news-mosaic-layout">
                    <article className="news-mosaic-feature">
                      <a href="#" className="news-mosaic-feature-img" aria-label="เชิญร่วมงานวันภาษาไทยแห่งชาติ 2567">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/assets/orst/images/New-02.png" alt="เชิญร่วมงานวันภาษาไทยแห่งชาติ 2567" loading="lazy" />
                        <span className="news-type-badge">กิจกรรม</span>
                      </a>
                      <div className="news-mosaic-feature-body">
                        <div className="news-meta">
                          <span>29 กรกฎาคม 2567</span>
                          <span>กิจกรรม</span>
                        </div>
                        <h3>เชิญร่วมงานวันภาษาไทยแห่งชาติ 2567</h3>
                        <p>กิจกรรมเสวนา นิทรรศการ และการเผยแพร่องค์ความรู้ด้านภาษาไทยสำหรับประชาชน นักเรียน และผู้สนใจ</p>
                        <a className="news-primary-action" href="#">ดูกำหนดการ →</a>
                      </div>
                    </article>
                    <div className="news-mosaic-side">
                      <article className="news-mosaic-card">
                        <a href="#" className="news-mosaic-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/New-03.png" alt="กิจกรรมส่งเสริมการเรียนรู้ภาษาไทย" loading="lazy" />
                        </a>
                        <div className="news-mosaic-card-body">
                          <span className="news-mini-type">กิจกรรม</span>
                          <h4>กิจกรรมส่งเสริมการเรียนรู้ภาษาไทย</h4>
                          <p>กิจกรรมเผยแพร่ความรู้ด้านภาษา วัฒนธรรม และการใช้ภาษาไทยในชีวิตประจำวัน</p>
                          <a href="#">อ่านต่อ →</a>
                        </div>
                      </article>
                      <article className="news-mosaic-card">
                        <a href="#" className="news-mosaic-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/New-01.png" alt="นิทรรศการองค์ความรู้ของชาติ" loading="lazy" />
                        </a>
                        <div className="news-mosaic-card-body">
                          <span className="news-mini-type">นิทรรศการ</span>
                          <h4>นิทรรศการองค์ความรู้ของชาติ</h4>
                          <p>นำเสนอองค์ความรู้ หนังสือ สิ่งพิมพ์ และสื่อดิจิทัลที่ประชาชนสามารถเข้าถึงได้</p>
                          <a href="#">อ่านต่อ →</a>
                        </div>
                      </article>
                      <article className="news-mosaic-card">
                        <a href="#" className="news-mosaic-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/New-02.png" alt="เสวนาภาษาไทยร่วมสมัย" loading="lazy" />
                        </a>
                        <div className="news-mosaic-card-body">
                          <span className="news-mini-type">เสวนา</span>
                          <h4>เสวนาภาษาไทยร่วมสมัย</h4>
                          <p>แลกเปลี่ยนมุมมองเกี่ยวกับการใช้ภาษาไทยในสังคมสมัยใหม่และสื่อดิจิทัล</p>
                          <a href="#">อ่านต่อ →</a>
                        </div>
                      </article>
                      <article className="news-mosaic-card">
                        <a href="#" className="news-mosaic-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/New-03.png" alt="กิจกรรมสำหรับเยาวชน" loading="lazy" />
                        </a>
                        <div className="news-mosaic-card-body">
                          <span className="news-mini-type">เยาวชน</span>
                          <h4>กิจกรรมภาษาไทยสำหรับเยาวชน</h4>
                          <p>ส่งเสริมการเรียนรู้ภาษาไทยผ่านกิจกรรมสร้างสรรค์สำหรับนักเรียนและเยาวชน</p>
                          <a href="#">อ่านต่อ →</a>
                        </div>
                      </article>
                    </div>
                  </div>
                ),
              },
              {
                id: "announcement",
                label: "ประกาศ",
                panel: (
                  <div className="news-mosaic-layout">
                    <article className="news-mosaic-feature">
                      <a href="#" className="news-mosaic-feature-img" aria-label="ประกาศสำนักงานราชบัณฑิตยสภาฉบับใหม่">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/assets/orst/images/New-01.png" alt="ประกาศสำนักงานราชบัณฑิตยสภาฉบับใหม่" loading="lazy" />
                        <span className="news-type-badge">ประกาศ</span>
                      </a>
                      <div className="news-mosaic-feature-body">
                        <div className="news-meta">
                          <span>16 พฤษภาคม 2567</span>
                          <span>ประกาศ</span>
                        </div>
                        <h3>ประกาศสำนักงานราชบัณฑิตยสภาฉบับใหม่</h3>
                        <p>ประกาศเผยแพร่พร้อมรายละเอียด เอกสารสำคัญ และข้อมูลประกอบสำหรับประชาชนและหน่วยงานที่เกี่ยวข้อง</p>
                        <a className="news-primary-action" href="#">อ่านต่อ →</a>
                      </div>
                    </article>
                    <div className="news-mosaic-side">
                      <article className="news-mosaic-card">
                        <a href="#" className="news-mosaic-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/New-02.png" alt="ประกาศรับสมัครและเอกสารที่เกี่ยวข้อง" loading="lazy" />
                        </a>
                        <div className="news-mosaic-card-body">
                          <span className="news-mini-type">รับสมัคร</span>
                          <h4>ประกาศรับสมัครและเอกสารที่เกี่ยวข้อง</h4>
                          <p>รายละเอียดประกาศ เอกสารแนบ คุณสมบัติ และกำหนดการที่เกี่ยวข้องกับการรับสมัคร</p>
                          <a href="#">อ่านต่อ →</a>
                        </div>
                      </article>
                      <article className="news-mosaic-card">
                        <a href="#" className="news-mosaic-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/New-03.png" alt="ประกาศจัดซื้อจัดจ้าง" loading="lazy" />
                        </a>
                        <div className="news-mosaic-card-body">
                          <span className="news-mini-type">จัดซื้อจัดจ้าง</span>
                          <h4>ประกาศจัดซื้อจัดจ้าง</h4>
                          <p>เผยแพร่ประกาศ เอกสารประกอบ และรายละเอียดการดำเนินการตามระเบียบที่เกี่ยวข้อง</p>
                          <a href="#">อ่านต่อ →</a>
                        </div>
                      </article>
                      <article className="news-mosaic-card">
                        <a href="#" className="news-mosaic-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/New-01.png" alt="ประกาศผลการพิจารณา" loading="lazy" />
                        </a>
                        <div className="news-mosaic-card-body">
                          <span className="news-mini-type">ผลการพิจารณา</span>
                          <h4>ประกาศผลการพิจารณาและเอกสารเผยแพร่</h4>
                          <p>ข้อมูลผลการพิจารณา เอกสารแนบ และรายละเอียดสำหรับผู้เกี่ยวข้อง</p>
                          <a href="#">อ่านต่อ →</a>
                        </div>
                      </article>
                      <article className="news-mosaic-card">
                        <a href="#" className="news-mosaic-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/assets/orst/images/New-02.png" alt="ประกาศทั่วไป" loading="lazy" />
                        </a>
                        <div className="news-mosaic-card-body">
                          <span className="news-mini-type">ทั่วไป</span>
                          <h4>ประกาศทั่วไปของสำนักงานราชบัณฑิตยสภา</h4>
                          <p>ประกาศข่าวสารทั่วไป กำหนดการ และข้อมูลที่ประชาชนควรทราบ</p>
                          <a href="#">อ่านต่อ →</a>
                        </div>
                      </article>
                    </div>
                  </div>
                ),
              },
            ]}
            calendar={
              <aside className="events-calendar-card" aria-label="ปฏิทินกิจกรรม">
                <div className="calendar-head">
                  <div>
                    <span className="section-kicker">Calendar</span>
                    <h3>ปฏิทินกิจกรรม</h3>
                  </div>
                  <a href="/orst/news" aria-label="ดูปฏิทินทั้งหมด">ทั้งหมด</a>
                </div>

                <div className="calendar-month">
                  <button type="button" aria-label="เดือนก่อนหน้า">‹</button>
                  <strong>มิถุนายน 2567</strong>
                  <button type="button" aria-label="เดือนถัดไป">›</button>
                </div>

                <div className="calendar-grid" aria-label="ปฏิทินเดือนมิถุนายน 2567">
                  <span>อา</span>
                  <span>จ</span>
                  <span>อ</span>
                  <span>พ</span>
                  <span>พฤ</span>
                  <span>ศ</span>
                  <span>ส</span>

                  <button type="button" className="muted">26</button>
                  <button type="button" className="muted">27</button>
                  <button type="button" className="muted">28</button>
                  <button type="button" className="muted">29</button>
                  <button type="button" className="muted">30</button>
                  <button type="button" className="muted">31</button>
                  <button type="button">1</button>

                  <button type="button">2</button>
                  <button type="button">3</button>
                  <button type="button">4</button>
                  <button type="button">5</button>
                  <button type="button">6</button>
                  <button type="button">7</button>
                  <button type="button">8</button>

                  <button type="button">9</button>
                  <button type="button">10</button>
                  <button type="button">11</button>
                  <button type="button">12</button>
                  <button type="button">13</button>
                  <button type="button">14</button>
                  <button type="button">15</button>

                  <button type="button">16</button>
                  <button type="button">17</button>
                  <button type="button" className="has-event" aria-label="18 มิถุนายน 2567 มีอบรม">18</button>
                  <button type="button">19</button>
                  <button type="button">20</button>
                  <button type="button">21</button>
                  <button type="button">22</button>

                  <button type="button">23</button>
                  <button type="button">24</button>
                  <button type="button" className="has-event" aria-label="25 มิถุนายน 2567 มีอบรม">25</button>
                  <button type="button">26</button>
                  <button type="button">27</button>
                  <button type="button">28</button>
                  <button type="button">29</button>
                </div>

                <div className="calendar-agenda">
                  <strong>กำหนดการใกล้ถึง</strong>

                  <a href="#" className="agenda-item">
                    <span className="agenda-date">
                      <b>18</b>
                      <small>มิ.ย.</small>
                    </span>
                    <span>
                      <b>อบรมการใช้ภาษาไทยในงานราชการ</b>
                      <small>อบรม · 09.00–12.00 น.</small>
                    </span>
                  </a>

                  <a href="#" className="agenda-item">
                    <span className="agenda-date">
                      <b>25</b>
                      <small>มิ.ย.</small>
                    </span>
                    <span>
                      <b>อบรมการเขียนเอกสารราชการ</b>
                      <small>อบรม · ออนไลน์</small>
                    </span>
                  </a>
                </div>
              </aside>
            }
          />
        </div>
      </section>

      <section className="section public-service-section" id="service-hub">
        <div className="container">
          <div className="service-directory-head">
            <div>
              <span className="section-kicker">Digital Service Hub</span>
              <h2>บริการประชาชนดิจิทัล</h2>
              <p>เลือกบริการที่ต้องการ ยื่นคำขอ และติดตามสถานะได้อย่างชัดเจน</p>
            </div>
            <a className="view-all" href="/orst/services">ดูคู่มือบริการทั้งหมด →</a>
          </div>

          <div className="service-directory">
            <aside className="service-directory-intro">
              <span className="intro-label">ศูนย์บริการออนไลน์</span>
              <h3>เริ่มต้นใช้งานได้จากบริการที่เกี่ยวข้อง</h3>
              <p>ออกแบบให้ประชาชนเลือกบริการได้ง่าย เห็นขั้นตอนก่อนเริ่มใช้งาน และทราบช่องทางติดตามผลหลังส่งเรื่อง</p>

              <div className="intro-steps" aria-label="ขั้นตอนการใช้บริการ">
                <div>
                  <span>01</span>
                  <strong>เลือกบริการ</strong>
                </div>
                <div>
                  <span>02</span>
                  <strong>กรอกข้อมูล</strong>
                </div>
                <div>
                  <span>03</span>
                  <strong>รับเลขติดตาม</strong>
                </div>
              </div>
            </aside>

            <div className="service-directory-list">
              <article className="public-service-card">
                <div className="public-service-icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48">
                    <path d="M12 9h19a5 5 0 0 1 5 5v27H15a5 5 0 0 1-5-5V11a2 2 0 0 1 2-2Z"></path>
                    <path d="M15 36a5 5 0 0 1 5-5h16"></path>
                    <path d="M18 16h13M18 22h10"></path>
                    <circle cx="34" cy="17" r="6"></circle>
                    <path d="m38.5 21.5 4 4"></path>
                  </svg>
                </div>
                <div className="public-service-content">
                  <div className="public-service-top">
                    <span className="service-badge">สอบถาม</span>
                    <span className="service-time">ตอบกลับทางอีเมล</span>
                  </div>
                  <h3>สอบถามข้อมูลทางวิชาการ</h3>
                  <p>ส่งคำถามเกี่ยวกับภาษาไทย คำศัพท์ มาตรฐานภาษา และองค์ความรู้ของราชบัณฑิตยสภา</p>
                  <button className="service-link-btn" type="button">
                    เริ่มสอบถาม
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </article>

              <article className="public-service-card">
                <div className="public-service-icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48">
                    <path d="M14 6h18l8 8v32H14Z"></path>
                    <path d="M32 6v8h8"></path>
                    <path d="M20 22h14M20 28h14M20 34h8"></path>
                    <path d="M9 34h12v10H9Z"></path>
                    <path d="M12 39h6"></path>
                  </svg>
                </div>
                <div className="public-service-content">
                  <div className="public-service-top">
                    <span className="service-badge">คำขออนุญาต</span>
                    <span className="service-time">แนบเอกสารได้</span>
                  </div>
                  <h3>ขออนุญาตนำหนังสือไปจัดพิมพ์</h3>
                  <p>ยื่นคำขอใช้เนื้อหา หนังสือ สิ่งพิมพ์ หรือเอกสารของสำนักงาน พร้อมเอกสารประกอบ</p>
                  <button className="service-link-btn" type="button">
                    ยื่นคำขอ
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </article>

              <article className="public-service-card">
                <div className="public-service-icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48">
                    <path d="M8 10h32v23H18l-10 8Z"></path>
                    <path d="M16 18h16M16 25h11"></path>
                    <path d="M34 34l4 4 8-10"></path>
                  </svg>
                </div>
                <div className="public-service-content">
                  <div className="public-service-top">
                    <span className="service-badge">ข้อเสนอแนะ</span>
                    <span className="service-time">ติดตามสถานะได้</span>
                  </div>
                  <h3>ร้องเรียน / เสนอแนะ</h3>
                  <p>แจ้งปัญหาการใช้บริการ ข้อเสนอแนะ หรือเรื่องที่ต้องการให้สำนักงานพิจารณา</p>
                  <button className="service-link-btn" type="button">
                    ส่งเรื่อง
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </article>

              <article className="public-service-card">
                <div className="public-service-icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48">
                    <path d="M15 6h18v7h-18Z"></path>
                    <path d="M11 10h28v38H11Z"></path>
                    <path d="M18 23h16M18 31h16M18 39h9"></path>
                    <path d="m17 15 3 3 6-7"></path>
                  </svg>
                </div>
                <div className="public-service-content">
                  <div className="public-service-top">
                    <span className="service-badge">สำรวจ</span>
                    <span className="service-time">ใช้เวลาไม่นาน</span>
                  </div>
                  <h3>แบบสำรวจความคิดเห็น</h3>
                  <p>ร่วมประเมินเว็บไซต์ บริการ และช่องทางการเข้าถึงข้อมูล เพื่อพัฒนาบริการให้ดีขึ้น</p>
                  <button className="service-link-btn" type="button">
                    ตอบแบบสำรวจ
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="section alt network-section network-section-compact" id="agency">
        <div className="container">
          <div className="network-head network-head-compact">
            <div>
              <span className="section-kicker">Connected Network</span>
              <h2>หน่วยงานและระบบที่เกี่ยวข้อง</h2>
              <p>เชื่อมโยงแหล่งข้อมูลและระบบสารสนเทศที่สนับสนุนองค์ความรู้ของชาติ</p>
            </div>
            <a className="view-all" href="#" aria-label="ดูหน่วยงานและระบบที่เกี่ยวข้องทั้งหมด">
              ดูทั้งหมด →
            </a>
          </div>

          <div className="network-marquee" aria-label="โลโก้หน่วยงานและระบบที่เกี่ยวข้อง">
            <div className="network-marquee-track">
              <div className="network-marquee-group">
                <a className="network-logo-item" href="#" aria-label="กระทรวงวัฒนธรรม">
                  <span className="network-logo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/orst/images/Seal_of_the_Ministry_of_Culture_of_Thailand.svg" alt="กระทรวงวัฒนธรรม" loading="lazy" />
                  </span>
                  <strong>กระทรวงวัฒนธรรม</strong>
                </a>
                <a className="network-logo-item" href="#" aria-label="หอสมุดแห่งชาติ">
                  <span className="network-logo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/orst/images/NLT_LOGO.jpg" alt="หอสมุดแห่งชาติ" loading="lazy" />
                  </span>
                  <strong>หอสมุดแห่งชาติ</strong>
                </a>
                <a className="network-logo-item" href="#" aria-label="สำนักศิลปกรรม">
                  <span className="network-logo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/orst/images/cropped-logo-with-bg-1.png" alt="สำนักศิลปกรรม" loading="lazy" />
                  </span>
                  <strong>สำนักศิลปกรรม</strong>
                </a>
                <a className="network-logo-item" href="#" aria-label="สวทช.">
                  <span className="network-logo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/orst/images/MHESRI.png" alt="สวทช." loading="lazy" />
                  </span>
                  <strong>สวทช.</strong>
                </a>
                <a className="network-logo-item" href="#" aria-label="ศูนย์ดัชนีอ้างอิงวารสารไทย">
                  <span className="network-logo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/orst/images/tci-logo.png" alt="ศูนย์ดัชนีอ้างอิงวารสารไทย" loading="lazy" />
                  </span>
                  <strong>TCI</strong>
                </a>
                <a className="network-logo-item network-system-item" href="#" aria-label="ระบบสารสนเทศที่เกี่ยวข้อง">
                  <span className="network-logo">
                    <svg className="icon-lg" aria-hidden="true">
                      <use href="#i-search" />
                    </svg>
                  </span>
                  <strong>ระบบสารสนเทศ</strong>
                </a>
              </div>

              <div className="network-marquee-group" aria-hidden="true">
                <a className="network-logo-item" href="#" tabIndex={-1}>
                  <span className="network-logo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/orst/images/Seal_of_the_Ministry_of_Culture_of_Thailand.svg" alt="" loading="lazy" />
                  </span>
                  <strong>กระทรวงวัฒนธรรม</strong>
                </a>
                <a className="network-logo-item" href="#" tabIndex={-1}>
                  <span className="network-logo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/orst/images/NLT_LOGO.jpg" alt="" loading="lazy" />
                  </span>
                  <strong>หอสมุดแห่งชาติ</strong>
                </a>
                <a className="network-logo-item" href="#" tabIndex={-1}>
                  <span className="network-logo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/orst/images/cropped-logo-with-bg-1.png" alt="" loading="lazy" />
                  </span>
                  <strong>สำนักศิลปกรรม</strong>
                </a>
                <a className="network-logo-item" href="#" tabIndex={-1}>
                  <span className="network-logo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/orst/images/MHESRI.png" alt="" loading="lazy" />
                  </span>
                  <strong>สวทช.</strong>
                </a>
                <a className="network-logo-item" href="#" tabIndex={-1}>
                  <span className="network-logo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/assets/orst/images/tci-logo.png" alt="" loading="lazy" />
                  </span>
                  <strong>TCI</strong>
                </a>
                <a className="network-logo-item network-system-item" href="#" tabIndex={-1}>
                  <span className="network-logo">
                    <svg className="icon-lg" aria-hidden="true">
                      <use href="#i-search" />
                    </svg>
                  </span>
                  <strong>ระบบสารสนเทศ</strong>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section help-center-section faq-center-section" id="faq">
        <div className="container">
          <div className="help-center-head faq-center-head">
            <span className="section-kicker">FAQ</span>
            <h2>คำถามที่พบบ่อย</h2>
            <p>คำตอบสั้น ๆ สำหรับการเริ่มใช้งานเว็บไซต์และบริการสำคัญ</p>
          </div>

          <div className="faq-center-panel" aria-label="คำถามยอดนิยม">
            <div className="help-faq-top faq-center-top">
              <div>
                <span className="section-kicker">POPULAR FAQ</span>
                <h3>คำถามยอดนิยม</h3>
              </div>
              <a href="/orst/services" className="view-all">ดูทั้งหมด →</a>
            </div>

            <div className="help-faq-list faq-center-list">
              {faqs.map((f, i) => (
                <details className="help-faq-item" key={f.id} open={i === 0}>
                  <summary>
                    <span>{f.title}</span>
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M5.5 7.5 10 12l4.5-4.5"></path>
                    </svg>
                  </summary>
                  <div>{f.excerpt}</div>
                </details>
              ))}
            </div>

            <div className="faq-center-footer">
              <span>ยังไม่พบคำตอบที่ต้องการ?</span>
              <a href="/orst/services">ดูคำถามทั้งหมด</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
