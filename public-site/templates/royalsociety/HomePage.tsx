import HeroSlider from "./HeroSlider";
import { fmtDateTh } from "@/lib/cms";
import { RsIcon } from "./icons";

// Ported from the source's index.html (royalsociety design).
//
// Header/Footer are NOT rendered here — app/royalsociety/page.tsx wraps this
// component with <Header active="home" /> / <Footer /> itself (same pattern
// as app/royalsociety/[page]/page.tsx wrapping the other page templates), so
// this file only owns the <main> content.
//
// Every section below is static, ported verbatim from the source, EXCEPT:
//
//   - the hero (`#home-hero`) kicker + title, driven by the `hero` prop
//     (from getWpPage("royalsociety", "home")) instead of hardcoded copy.
//     The source splits the title across two styled lines via two separate
//     <span> children (each rendered as its own block by .rs-hero-title
//     span{display:block} in home.css). The CMS title is a single string
//     with no line-break markup, so when `hero` is present it renders as
//     one <span> (still block-level, just naturally wrapping) rather than
//     guessing a split point; the exact hardcoded two-line split remains
//     the fallback when `hero` is null (not yet seeded).
//
//   - the "latest-news-only-section" (ข่าวสารและกิจกรรมล่าสุด), which is
//     driven by the `articles` prop instead of the source's hardcoded news
//     cards.
//
// The source repeats 6 ".latest-small-news" cards in the grid, but items
// 5-6 are exact duplicates (same image/title/excerpt) of items 3-4 — a
// copy-paste artifact in the static source, not real distinct content — so
// this port treats the section as "1 featured card + up to 4 supporting
// cards" worth of real content.
//
// The prop shape (title/excerpt/date/slug) has no image or category field,
// so per-card thumbnails cycle through the source's 3 stock news images as
// decorative filler (not tied to any specific article's identity), and the
// category label that sits next to the date in the source (".latest-meta"
// e.g. "กิจกรรมสำคัญ", "ประชาสัมพันธ์") is dropped rather than invented.
const NEWS_IMAGES = [
  "/assets/royalsociety/images/new-01.jpg",
  "/assets/royalsociety/images/new-02.jpg",
  "/assets/royalsociety/images/new-03.jpg",
];

const HERO_SLIDES = [
  "/assets/royalsociety/images/BG-01.jpg",
  "/assets/royalsociety/images/BG-02.jpg",
  "/assets/royalsociety/images/BG-03.jpg",
  "/assets/royalsociety/images/BG-04.jpg",
];

type Article = { title: string; excerpt: string; date: string; slug: string };
type Hero = { title: string; excerpt: string } | null;

export default function HomePage({ articles, hero }: { articles: Article[]; hero: Hero }) {
  const [featured, ...rest] = articles;

  return (
    <>
      {/* Home-page-only styles (hero, latest-news, key-services, recommended,
          public-service, connected-network) — kept out of main.css since no
          other page uses these classes. See app/royalsociety/layout.tsx's
          own comment: "Page-specific overrides ... are loaded by the
          individual page components that need them, not here." */}
      <link rel="stylesheet" href="/assets/royalsociety/css/pages/home.css" />
      <main id="main-content">
      <section className="rs-hero rs-hero-institution" id="home-hero" aria-label="ภาพนำราชบัณฑิตยสภา">
          <HeroSlider slides={HERO_SLIDES} />

          <div className="rs-hero__shade"></div>

          <div className="container rs-hero__inner">
            <div className="rs-hero__content reveal">
              <span className="rs-hero__kicker">{hero?.excerpt || "สถาบันวิชาการของชาติด้านภาษาและสรรพวิชา"}</span>

              <h1 className="rs-hero-title">
                {hero?.title ? (
                  <span>{hero.title}</span>
                ) : (
                  <>
                    <span>สถาบันหลักแห่ง</span>
                    <span className="no-wrap-desktop">เครือข่ายทางปัญญาของชาติ</span>
                  </>
                )}
              </h1>
            </div>
          </div>
        </section>

        <section className="trust-strip" aria-label="คุณค่าหลักของเว็บไซต์">
          <div className="container trust-grid">
            <article className="trust-item">
              <RsIcon id="i-book" className="icon trust-icon" />
              <div>
                <h3>สถานที่บำรุงสรรพวิชา</h3>
              </div>
            </article>

            <article className="trust-item">
              <RsIcon id="i-shield" className="icon trust-icon" />
              <div>
                <h3>ขุมปัญญาของชาติ</h3>
              </div>
            </article>

            <article className="trust-item">
              <RsIcon id="i-people" className="icon trust-icon" />
              <div>
                <h3>นักปราชญ์ของพระราชา</h3>
              </div>
            </article>

            <article className="trust-item">
              <RsIcon id="i-access" className="icon trust-icon" />
              <div>
                <h3>ที่พึ่งพาของแผ่นดิน</h3>
              </div>
            </article>
          </div>
        </section>

        <section className="latest-updates-section section latest-news-only-section" id="activities" aria-labelledby="latest-updates-title">
          <div className="container">
            <div className="latest-news-only-head reveal">
              <div>
                <span className="section-kicker">Latest Updates</span>
                <h2 id="latest-updates-title">ข่าวสารและกิจกรรมล่าสุด</h2>
                <p>ติดตามข่าวประชาสัมพันธ์ กิจกรรมทางวิชาการ และความเคลื่อนไหวสำคัญของราชบัณฑิตยสภา</p>
              </div>

              <a className="latest-view-all" href="/royalsociety/activities">
                ดูข่าวทั้งหมด
                <span>→</span>
              </a>
            </div>

            <div className="latest-news-only-layout reveal">
              {featured && (
                <article className="latest-main-news">
                  <a href="/royalsociety/activities" className="latest-main-news__image">
                    <img src={NEWS_IMAGES[0]} alt="" loading="lazy" />
                    <span className="latest-main-news__badge">ข่าวล่าสุด</span>
                  </a>

                  <div className="latest-main-news__body">
                    <div className="latest-meta">
                      <time dateTime={featured.date}>{fmtDateTh(featured.date)}</time>
                    </div>

                    <h3>
                      <a href="/royalsociety/activities">{featured.title}</a>
                    </h3>

                    <p>{featured.excerpt}</p>
                    <div style={{ textAlign: "end" }}>
                      <a className="latest-main-news__link is-compact" href="/royalsociety/activities">
                        อ่านต่อ
                        <span>→</span>
                      </a>
                    </div>
                  </div>
                </article>
              )}

              <div className="latest-small-news-grid">
                {rest.map((article, i) => (
                  <article className="latest-small-news" key={article.slug}>
                    <a href="/royalsociety/activities" className="latest-small-news__image">
                      <img src={NEWS_IMAGES[(i + 1) % NEWS_IMAGES.length]} alt="" loading="lazy" />
                    </a>

                    <div className="latest-small-news__body">
                      <div className="latest-meta">
                        <time dateTime={article.date}>{fmtDateTh(article.date)}</time>
                      </div>

                      <h3>
                        <a href="/royalsociety/activities">{article.title}</a>
                      </h3>

                      <p>{article.excerpt}</p>
                      <div style={{ textAlign: "end" }}>
                        <a className="latest-main-news__link is-compact" href="/royalsociety/activities">
                          อ่านต่อ
                          <span>→</span>
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="key-services section" id="knowledge" aria-labelledby="services-title">
          <div className="container">
            <div className="ks-layout reveal">
              <div className="ks-main ks-feature-card">
                <span className="section-kicker">Knowledge &amp; Services</span>
                <h3 id="services-title">บริการและแหล่งความรู้สำคัญ</h3>
                <p>เครื่องมือค้นคว้า พจนานุกรม สารานุกรม ฐานข้อมูล และบริการวิชาการ</p>

                <div className="ks-search-box" role="search" aria-label="ค้นหาบริการและองค์ความรู้">
                  <span aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M10.8 18.1a7.3 7.3 0 1 1 0-14.6 7.3 7.3 0 0 1 0 14.6Z" />
                      <path d="m16.2 16.2 4.1 4.1" />
                    </svg>
                  </span>
                  <input
                    type="search"
                    placeholder="ค้นหาคำศัพท์ หนังสือ บทความ งานวิจัย หรือบริการ..."
                    aria-label="ค้นหาบริการและองค์ความรู้"
                  />
                  <button type="button">ค้นหา</button>
                </div>

                <div className="ks-popular">
                  <strong style={{ color: "#fff" }}>ค้นหายอดนิยม</strong>
                  <a href="/royalsociety/knowledge">พจนานุกรม</a>
                  <a href="/royalsociety/knowledge">ศัพท์บัญญัติ</a>
                  <a href="/royalsociety/knowledge">มาตรฐานภาษาไทย</a>
                  <a href="/royalsociety/publications">e-Book</a>
                </div>
              </div>
            </div>

            <div className="ks-grid reveal">
              <a className="ks-card" href="/royalsociety/knowledge">
                <span className="ks-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Z" />
                    <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
                    <path d="M8 7h8M8 10h6" />
                  </svg>
                </span>
                <span className="ks-card-text">
                  <strong>สารานุกรม</strong>
                  <small>องค์ความรู้ครอบคลุมหลายสาขาวิชา</small>
                </span>
                <span className="ks-arrow">→</span>
              </a>

              <a className="ks-card" href="/royalsociety/knowledge">
                <span className="ks-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z" />
                    <path d="M4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7" />
                    <path d="M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5" />
                  </svg>
                </span>
                <span className="ks-card-text">
                  <strong>คลังความรู้</strong>
                  <small>บทความ หนังสือ เอกสาร และสื่อความรู้</small>
                </span>
                <span className="ks-arrow">→</span>
              </a>

              <a className="ks-card" href="/royalsociety/knowledge">
                <span className="ks-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M5 19V5h14v14H5Z" />
                    <path d="M8 8h8M8 12h8M8 16h4" />
                    <path d="M17 3v4M7 3v4" />
                  </svg>
                </span>
                <span className="ks-card-text">
                  <strong>มาตรฐานภาษาไทย</strong>
                  <small>หลักเกณฑ์การใช้ภาษาไทยและคำแนะนำ</small>
                </span>
                <span className="ks-arrow">→</span>
              </a>

              <a className="ks-card" href="/royalsociety/activities">
                <span className="ks-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 19h16" />
                    <path d="M7 16v-5" />
                    <path d="M12 16V7" />
                    <path d="M17 16v-8" />
                    <path d="M6 8.5 12 5l6 2.4" />
                  </svg>
                </span>
                <span className="ks-card-text">
                  <strong>ข้อมูลงานวิจัย</strong>
                  <small>งานวิจัย บทความวิชาการ และรายงาน</small>
                </span>
                <span className="ks-arrow">→</span>
              </a>

              <a className="ks-card" href="/royalsociety/publications">
                <span className="ks-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M6 4h9.5L19 7.5V20H6V4Z" />
                    <path d="M15 4v4h4" />
                    <path d="M9 12h6M9 15h6" />
                  </svg>
                </span>
                <span className="ks-card-text">
                  <strong>หนังสือและสิ่งพิมพ์</strong>
                  <small>e-Book วารสาร เอกสารดาวน์โหลด</small>
                </span>
                <span className="ks-arrow">→</span>
              </a>

              <a className="ks-card" href="/royalsociety/services">
                <span className="ks-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M8 11.5h8" />
                    <path d="M12 7.5v8" />
                    <path d="M4.5 5.5h15v11h-8L7 20v-3.5H4.5v-11Z" />
                  </svg>
                </span>
                <span className="ks-card-text">
                  <strong>บริการวิชาการ</strong>
                  <small>คำปรึกษา อบรม และความร่วมมือทางวิชาการ</small>
                </span>
                <span className="ks-arrow">→</span>
              </a>
            </div>
          </div>
        </section>

        <section className="vm-strip-section" id="vision-mission" aria-label="วิสัยทัศน์และพันธกิจราชบัณฑิตยสภา">
          <div className="container">
            <div className="vm-strip reveal">
              <div className="vm-strip__items">
                <span>ค้นคว้าวิจัยเพื่อเผยแพร่ </span>
                <span>ส่งเสริมแลกเปลี่ยนความรู้</span>
                <span>พัฒนาอนุรักษ์</span>
                <span>บริการวิชาการ</span>
              </div>
            </div>
          </div>
        </section>

        <section className="recommended-section section" id="recommended" aria-labelledby="recommended-title">
          <div className="container">
            <div className="rec-head reveal">
              <div>
                <span className="section-kicker">Knowledge</span>
                <h2 id="recommended-title">องค์ความรู้</h2>
                <p>คัดสรรสิ่งพิมพ์ บทความ และองค์ความรู้สำคัญที่ประชาชนเข้าถึงได้ง่าย</p>
              </div>

              <div className="rec-actions">
                <a className="rec-view-all" href="/royalsociety/publications">ดูทั้งหมด</a>
                <button className="rec-nav" type="button" data-rec-prev aria-label="เลื่อนรายการไปทางซ้าย">‹</button>
                <button className="rec-nav" type="button" data-rec-next aria-label="เลื่อนรายการไปทางขวา">›</button>
              </div>
            </div>

            <div className="rec-shell reveal">
              <div className="rec-row" id="recommend-row" tabIndex={0} aria-label="รายการองค์ความรู้แนะนำแบบเลื่อนได้">
                <article className="rec-card featured">
                  <a href="/royalsociety/publications" className="rec-cover">
                    <img src="/assets/royalsociety/images/recommend-01.jpg" alt="พจนานุกรมฉบับราชบัณฑิตยสถาน พ.ศ. ๒๕๕๔" loading="lazy" />
                    <span className="rec-type">สิ่งพิมพ์สำคัญ</span>
                  </a>
                  <div className="rec-body">
                    <span className="rec-category">พจนานุกรม</span>
                    <h3>พจนานุกรมฉบับราชบัณฑิตยสถาน พ.ศ. ๒๕๕๔</h3>
                    <p>แหล่งอ้างอิงคำ ความหมาย และการใช้ภาษาไทยที่เป็นมาตรฐาน</p>
                    <a className="rec-link" href="/royalsociety/publications">ดูรายละเอียด <span>→</span></a>
                  </div>
                </article>

                <article className="rec-card">
                  <a href="/royalsociety/publications" className="rec-cover">
                    <img src="/assets/royalsociety/images/recommend-02.jpg" alt="สารานุกรมไทยสำหรับเยาวชน" loading="lazy" />
                    <span className="rec-type">แนะนำ</span>
                  </a>
                  <div className="rec-body">
                    <span className="rec-category">สารานุกรม</span>
                    <h3>สารานุกรมไทยสำหรับเยาวชนฯ</h3>
                    <p>องค์ความรู้รอบด้านที่เหมาะสำหรับนักเรียน ครู และประชาชนทั่วไป</p>
                    <a className="rec-link" href="/royalsociety/publications">อ่านต่อ <span>→</span></a>
                  </div>
                </article>

                <article className="rec-card">
                  <a href="/royalsociety/knowledge" className="rec-cover">
                    <img src="/assets/royalsociety/images/recommend-03.jpg" alt="มาตรฐานการเขียนและสะกดคำภาษาไทย" loading="lazy" />
                    <span className="rec-type">คู่มือภาษา</span>
                  </a>
                  <div className="rec-body">
                    <span className="rec-category">ภาษาไทย</span>
                    <h3>มาตรฐานการเขียนและสะกดคำภาษาไทย</h3>
                    <p>แนวทางการใช้ภาษาไทยอย่างถูกต้อง เหมาะกับการอ้างอิงในงานทางการ</p>
                    <a className="rec-link" href="/royalsociety/knowledge">เปิดอ่าน <span>→</span></a>
                  </div>
                </article>

                <article className="rec-card">
                  <a href="/royalsociety/knowledge" className="rec-cover">
                    <img src="/assets/royalsociety/images/recommend-04.jpg" alt="ศัพท์บัญญัติและคำศัพท์วิชาการ" loading="lazy" />
                    <span className="rec-type">ฐานข้อมูล</span>
                  </a>
                  <div className="rec-body">
                    <span className="rec-category">ศัพท์บัญญัติ</span>
                    <h3>ศัพท์บัญญัติและคำศัพท์วิชาการ</h3>
                    <p>ค้นหาคำศัพท์เฉพาะทางและคำบัญญัติที่ใช้ในสาขาวิชาต่าง ๆ</p>
                    <a className="rec-link" href="/royalsociety/knowledge">ค้นคำศัพท์ <span>→</span></a>
                  </div>
                </article>

                <article className="rec-card">
                  <a href="/royalsociety/publications" className="rec-cover">
                    <img src="/assets/royalsociety/images/recommend-05.jpg" alt="วารสารราชบัณฑิตยสภา" loading="lazy" />
                    <span className="rec-type">วารสาร</span>
                  </a>
                  <div className="rec-body">
                    <span className="rec-category">งานวิชาการ</span>
                    <h3>วารสารราชบัณฑิตยสภา</h3>
                    <p>บทความวิชาการและผลงานทางความรู้จากราชบัณฑิตและผู้ทรงคุณวุฒิ</p>
                    <a className="rec-link" href="/royalsociety/publications">ดูวารสาร <span>→</span></a>
                  </div>
                </article>

                <article className="rec-card">
                  <a href="/royalsociety/activities" className="rec-cover">
                    <img src="/assets/royalsociety/images/recommend-06.jpg" alt="บรรยายวิชาการราชบัณฑิตยสภา" loading="lazy" />
                    <span className="rec-type">สื่อความรู้</span>
                  </a>
                  <div className="rec-body">
                    <span className="rec-category">บรรยายวิชาการ</span>
                    <h3>บรรยายวิชาการสำหรับประชาชน</h3>
                    <p>สรุปองค์ความรู้จากกิจกรรม บรรยาย และเวทีแลกเปลี่ยนทางวิชาการ</p>
                    <a className="rec-link" href="/royalsociety/activities">ชมกิจกรรม <span>→</span></a>
                  </div>
                </article>

                <article className="rec-card">
                  <a href="/royalsociety/publications" className="rec-cover">
                    <img src="/assets/royalsociety/images/recommend-07.jpg" alt="ประวัติราชบัณฑิตและภาคีสมาชิก" loading="lazy" />
                    <span className="rec-type">บุคคลสำคัญ</span>
                  </a>
                  <div className="rec-body">
                    <span className="rec-category">ราชบัณฑิต</span>
                    <h3>ประวัติราชบัณฑิตและภาคีสมาชิก</h3>
                    <p>ทำความรู้จักบุคคลสำคัญ ผู้สร้างสรรค์องค์ความรู้ของประเทศ</p>
                    <a className="rec-link" href="/royalsociety/about">ดูข้อมูล <span>→</span></a>
                  </div>
                </article>

                <article className="rec-card">
                  <a href="/royalsociety/services" className="rec-cover">
                    <img src="/assets/royalsociety/images/recommend-08.jpg" alt="เอกสารเผยแพร่สำหรับประชาชน" loading="lazy" />
                    <span className="rec-type">ดาวน์โหลด</span>
                  </a>
                  <div className="rec-body">
                    <span className="rec-category">เอกสารเผยแพร่</span>
                    <h3>เอกสารความรู้สำหรับประชาชน</h3>
                    <p>เอกสารสรุปความรู้ คู่มือ และข้อมูลที่สามารถดาวน์โหลดเพื่อใช้อ้างอิง</p>
                    <a className="rec-link" href="/royalsociety/services">ดาวน์โหลด <span>→</span></a>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="public-service section ps-gateway-section" id="service-hub" aria-labelledby="public-service-title">
          <div className="container">
            <div className="ps-gateway-head reveal">
              <div>
                <span className="section-kicker">Public Service</span>
                <h2 id="public-service-title">บริการประชาชน</h2>
                <p>
                  ช่องทางสำหรับสอบถามข้อมูลทางวิชาการ ดาวน์โหลดเอกสาร ขออนุญาตใช้เนื้อหา
                  และติดต่อประสานงานกับราชบัณฑิตยสภา
                </p>
              </div>

              <a className="ps-gateway-all" href="/royalsociety/services">
                บริการทั้งหมด
                <span>→</span>
              </a>
            </div>

            <div className="ps-gateway-layout reveal">
              <a className="ps-main-service" href="/royalsociety/services">
                <span className="ps-main-service__label">บริการแนะนำ</span>

                <span className="ps-main-service__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4.5 5.5h15v10h-8L7 19v-3.5H4.5v-10Z"></path>
                    <path d="M8 9h8M8 12h5"></path>
                  </svg>
                </span>

                <span className="ps-main-service__text">
                  <strong>สอบถามข้อมูลทางวิชาการ</strong>
                  <em>
                    ส่งคำถามเกี่ยวกับภาษาไทย ศัพท์บัญญัติ คำทับศัพท์ ราชาศัพท์
                    และองค์ความรู้ที่เกี่ยวข้อง
                  </em>
                </span>

                <span className="ps-main-service__action">
                  เริ่มสอบถาม
                  <i>→</i>
                </span>
              </a>

              <div className="ps-service-list" aria-label="รายการบริการประชาชน">
                <a className="ps-service-item" href="/royalsociety/services">
                  <span className="ps-service-item__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M6 4h9.5L19 8.5V20H6V4Z"></path>
                      <path d="M15.5 4v4.5H19"></path>
                      <path d="M9 12h6M9 15h4"></path>
                    </svg>
                  </span>

                  <span className="ps-service-item__text">
                    <small>เอกสารบริการ</small>
                    <strong>ดาวน์โหลดแบบฟอร์ม</strong>
                    <em>รวมเอกสารและแบบฟอร์มสำหรับติดต่อราชการ</em>
                  </span>

                  <span className="ps-service-item__arrow">→</span>
                </a>

                <a className="ps-service-item" href="/royalsociety/services">
                  <span className="ps-service-item__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M7 11V8a5 5 0 0 1 10 0v3"></path>
                      <path d="M5.5 11h13v9h-13v-9Z"></path>
                      <path d="M12 15v2"></path>
                    </svg>
                  </span>

                  <span className="ps-service-item__text">
                    <small>การอนุญาต</small>
                    <strong>ขออนุญาตใช้เนื้อหา</strong>
                    <em>ยื่นคำขอใช้หนังสือ ภาพ เอกสาร หรือข้อมูลของสำนักงาน</em>
                  </span>

                  <span className="ps-service-item__arrow">→</span>
                </a>

                <a className="ps-service-item" href="/royalsociety/contact">
                  <span className="ps-service-item__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M4 20h16"></path>
                      <path d="M6 20V8l6-4 6 4v12"></path>
                      <path d="M9 20v-6h6v6"></path>
                      <path d="M9 10h.01M12 10h.01M15 10h.01"></path>
                    </svg>
                  </span>

                  <span className="ps-service-item__text">
                    <small>ติดต่อหน่วยงาน</small>
                    <strong>ติดต่อราชการ</strong>
                    <em>ดูช่องทางติดต่อ แผนที่ และข้อมูลสำหรับประสานงาน</em>
                  </span>

                  <span className="ps-service-item__arrow">→</span>
                </a>
              </div>
            </div>

            <div className="ps-process-strip reveal" aria-label="ขั้นตอนการใช้บริการ">
              <span>เริ่มใช้บริการได้ง่าย</span>
              <ol>
                <li>เลือกบริการที่ต้องการ</li>
                <li>อ่านเงื่อนไขหรือเตรียมเอกสาร</li>
                <li>ส่งคำขอหรือติดต่อเจ้าหน้าที่</li>
              </ol>
            </div>
          </div>
        </section>

        <section className="cn-section cn-marquee-section" id="connected-network" aria-labelledby="network-title">
          <div className="container">
            <div className="cn-marquee-head reveal">
              <div>
                <span className="section-kicker">Connected Network</span>
                <h2 id="network-title">หน่วยงานและระบบที่เกี่ยวข้อง</h2>
                <p>เชื่อมโยงแหล่งข้อมูลและระบบสารสนเทศที่สนับสนุนองค์ความรู้ของชาติ</p>
              </div>

              <a className="cn-view-all" href="#">
                ดูทั้งหมด
                <span>→</span>
              </a>
            </div>
          </div>

          <div className="cn-marquee reveal" aria-label="รายการหน่วยงานและระบบที่เกี่ยวข้อง">
            <div className="cn-marquee__viewport">
              <div className="cn-marquee__track">
                <div className="cn-marquee__group">
                  <a className="cn-logo-card" href="#" target="_blank" rel="noopener">
                    <span><img src="/assets/royalsociety/images/Seal_of_the_Ministry_of_Culture_of_Thailand.svg" alt="กระทรวงวัฒนธรรม" loading="lazy" decoding="async" /></span>
                    <strong>กระทรวงวัฒนธรรม</strong>
                  </a>

                  <a className="cn-logo-card" href="#" target="_blank" rel="noopener">
                    <span><img src="/assets/royalsociety/images/NLT_LOGO.jpg" alt="หอสมุดแห่งชาติ" loading="lazy" decoding="async" /></span>
                    <strong>หอสมุดแห่งชาติ</strong>
                  </a>

                  <a className="cn-logo-card" href="#" target="_blank" rel="noopener">
                    <span><img src="/assets/royalsociety/images/MHESRI.png" alt="สวทช." loading="lazy" decoding="async" /></span>
                    <strong>สวทช.</strong>
                  </a>

                  <a className="cn-logo-card" href="#" target="_blank" rel="noopener">
                    <span><img src="/assets/royalsociety/images/tci-logo.png" alt="TCI" loading="lazy" decoding="async" /></span>
                    <strong>TCI</strong>
                  </a>

                  <a className="cn-logo-card" href="#" target="_blank" rel="noopener">
                    <span><img src="/assets/royalsociety/images/cropped-logo-with-bg-1.png" alt="สำนักศิลปกรรม" loading="lazy" decoding="async" /></span>
                    <strong>สำนักศิลปกรรม</strong>
                  </a>

                  <a className="cn-logo-card" href="#" target="_blank" rel="noopener">
                    <span><img src="/assets/royalsociety/images/backoffice.jpg" alt="ระบบสารสนเทศ" loading="lazy" decoding="async" /></span>
                    <strong>ระบบสารสนเทศ</strong>
                  </a>

                  <a className="cn-logo-card" href="#" target="_blank" rel="noopener">
                    <span><img src="/assets/royalsociety/images/backoffice.jpg" alt="ฐานข้อมูลภาครัฐ" loading="lazy" decoding="async" /></span>
                    <strong>ฐานข้อมูลภาครัฐ</strong>
                  </a>

                  <a className="cn-logo-card" href="#" target="_blank" rel="noopener">
                    <span><img src="/assets/royalsociety/images/backoffice.jpg" alt="หน่วยงานที่เกี่ยวข้อง" loading="lazy" decoding="async" /></span>
                    <strong>หน่วยงานที่เกี่ยวข้อง</strong>
                  </a>
                </div>

                <div className="cn-marquee__group" aria-hidden="true">
                  <a className="cn-logo-card" href="#" tabIndex={-1}>
                    <span><img src="/assets/royalsociety/images/Seal_of_the_Ministry_of_Culture_of_Thailand.svg" alt="" loading="lazy" decoding="async" /></span>
                    <strong>กระทรวงวัฒนธรรม</strong>
                  </a>

                  <a className="cn-logo-card" href="#" tabIndex={-1}>
                    <span><img src="/assets/royalsociety/images/NLT_LOGO.jpg" alt="" loading="lazy" decoding="async" /></span>
                    <strong>หอสมุดแห่งชาติ</strong>
                  </a>

                  <a className="cn-logo-card" href="#" tabIndex={-1}>
                    <span><img src="/assets/royalsociety/images/MHESRI.png" alt="" loading="lazy" decoding="async" /></span>
                    <strong>สวทช.</strong>
                  </a>

                  <a className="cn-logo-card" href="#" tabIndex={-1}>
                    <span><img src="/assets/royalsociety/images/tci-logo.png" alt="" loading="lazy" decoding="async" /></span>
                    <strong>TCI</strong>
                  </a>

                  <a className="cn-logo-card" href="#" tabIndex={-1}>
                    <span><img src="/assets/royalsociety/images/cropped-logo-with-bg-1.png" alt="" loading="lazy" decoding="async" /></span>
                    <strong>สำนักศิลปกรรม</strong>
                  </a>

                  <a className="cn-logo-card" href="#" tabIndex={-1}>
                    <span><img src="/assets/royalsociety/images/backoffice.jpg" alt="" loading="lazy" decoding="async" /></span>
                    <strong>ระบบสารสนเทศ</strong>
                  </a>

                  <a className="cn-logo-card" href="#" tabIndex={-1}>
                    <span><img src="/assets/royalsociety/images/backoffice.jpg" alt="" loading="lazy" decoding="async" /></span>
                    <strong>ฐานข้อมูลภาครัฐ</strong>
                  </a>

                  <a className="cn-logo-card" href="#" tabIndex={-1}>
                    <span><img src="/assets/royalsociety/images/backoffice.jpg" alt="" loading="lazy" decoding="async" /></span>
                    <strong>หน่วยงานที่เกี่ยวข้อง</strong>
                  </a>
                </div>
              </div>
            </div>
          </div>
      </section>
      </main>
    </>
  );
}
