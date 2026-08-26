// Ported from the source's pages/about.html, then (Phase 10) rewired so the
// historical timeline / mission cards / org structure are genuine WordPress
// content (wp:timeline, wp:mission, wp:org-unit — see the Phase 10 plan's
// "ACF free, one post per repeatable item" rationale) instead of hardcoded
// JSX. Each section falls back to the exact original hardcoded content when
// its fetcher returns nothing (page not yet seeded), same discipline as the
// "about" prop below.
//
// The "about-intro-v3" section (heading "จากราชบัณฑิตยสภา สู่สำนักงานราช
// บัณฑิตยสภา" + its lead paragraph) maps directly onto the seeded wp:page
// "about" (title/excerpt/content), driven by the `about` prop: `about.title`
// replaces the hardcoded <h2>, `about.excerpt` replaces the "Institution
// Overview" kicker, and `about.content` (trusted, server-seeded WP rich-text
// HTML) replaces the hardcoded lead <p> via dangerouslySetInnerHTML —
// rendered as a <div> rather than a <p> since the seeded content is itself 2
// <p> paragraphs (a <p> can't validly nest <p> children). The "บทบาทสำคัญ"
// highlight box directly below stays static — it's a distinct callout, not
// part of the fetched content.
//
// Still explicitly out of scope: the "about-story-v3" 3-step narrative
// summary (a distinct editorial framing of the timeline, not the timeline
// itself), the knowledge-standards grid, and the contact-strip — all real,
// hand-authored content too structurally/thematically distinct from the new
// content types to wire here.
//
// Header/Footer are NOT rendered here — app/royalsociety/[page]/page.tsx
// wraps this component with <Header active="about" /> / <Footer /> itself
// (same pattern as app/royalsociety/page.tsx wrapping HomePage), so this
// file only owns the <main> content.
import { RsIcon, type RsIconId } from "./icons";

type Entry = { title: string; excerpt: string; content?: string; acf?: Record<string, any> };

// Icon ids a mission item's WordPress acf.icon field is documented to carry
// (see the Phase-11 brief) — a subset of RsIconId (icons.tsx), which also
// covers Header.tsx's own internal icons. Anything else (missing field,
// unrecognized id) falls back to i-book rather than rendering nothing.
const MISSION_ICON_IDS: readonly RsIconId[] = ["i-book", "i-shield", "i-service", "i-people"];
const MISSION_ICON_FALLBACK_CYCLE: readonly RsIconId[] = ["i-book", "i-shield", "i-people", "i-service"];

function missionIconId(entry: Entry, index: number): RsIconId {
  const acfIcon = entry.acf?.icon;
  if (typeof acfIcon === "string" && (MISSION_ICON_IDS as readonly string[]).includes(acfIcon)) {
    return acfIcon as RsIconId;
  }
  return MISSION_ICON_FALLBACK_CYCLE[index % MISSION_ICON_FALLBACK_CYCLE.length];
}

const FALLBACK_MISSION: Entry[] = [
  { title: "ค้นคว้าและวิจัย", excerpt: "ส่งเสริมการศึกษาค้นคว้าในศาสตร์สาขาต่าง ๆ เพื่อพัฒนาองค์ความรู้ที่เป็นประโยชน์แก่ประเทศ" },
  { title: "เผยแพร่และแลกเปลี่ยนความรู้", excerpt: "นำผลงานวิชาการสู่สาธารณะผ่านสิ่งพิมพ์ สื่อดิจิทัล ฐานข้อมูล และกิจกรรมทางวิชาการ" },
  { title: "พัฒนาและอนุรักษ์", excerpt: "ธำรงรักษามรดกทางวิชาการ ภาษา ศิลปกรรม และวัฒนธรรม พร้อมต่อยอดให้ร่วมสมัย" },
  { title: "บริการทางวิชาการ", excerpt: "สนับสนุนข้อมูลอ้างอิง คำศัพท์ หลักเกณฑ์ และคำแนะนำ ที่ประชาชนและหน่วยงานสามารถนำไปใช้ได้จริง" },
];

const FALLBACK_ORG_UNITS: Entry[] = [
  { title: "สำนักธรรมศาสตร์และการเมือง", excerpt: "องค์ความรู้ด้านสังคม กฎหมาย รัฐศาสตร์ และศาสตร์ที่เกี่ยวข้อง" },
  { title: "สำนักวิทยาศาสตร์", excerpt: "องค์ความรู้ด้านวิทยาศาสตร์ เทคโนโลยี และสาขาวิชาที่เกี่ยวข้อง" },
  { title: "สำนักศิลปกรรม", excerpt: "องค์ความรู้ด้านศิลปะ วัฒนธรรม ภาษา วรรณกรรม และภูมิปัญญา" },
];

export default function AboutPage({
  about,
  timeline = [],
  missionItems = [],
  orgUnits = [],
}: {
  about: { title: string; excerpt: string; content: string } | null;
  timeline?: Entry[];
  missionItems?: Entry[];
  orgUnits?: Entry[];
}) {
  const founded = timeline[0]?.acf?.year;
  const currentLaw = timeline[timeline.length - 1]?.acf?.year;
  const bureauCount = orgUnits.length;
  return (
    <>
      {/* About-page-only styles — see HomePage.tsx's matching <link> for why
          this lives here rather than in main.css. */}
      <link rel="stylesheet" href="/assets/royalsociety/css/pages/about.css" />
      <main id="main-content" className="about-page">
        <section className="about-hero-clean" aria-labelledby="about-hero-title">
          <div className="about-container">
            <div className="about-hero-clean-grid">
              <div className="about-hero-clean-content">
                <span className="about-hero-label">เกี่ยวกับองค์กร</span>

                <h1 id="about-hero-title">เกี่ยวกับราชบัณฑิตยสภา</h1>

                <p className="about-hero-clean-subtitle">
                  สถาบันหลักของชาติด้านภาษาและวัฒนธรรม
                </p>

                <p className="about-hero-clean-desc">
                  แหล่งรวมผู้ทรงความรู้และงานวิชาการของประเทศ ทำหน้าที่ค้นคว้า วิจัย
                  พัฒนา อนุรักษ์ และเผยแพร่องค์ความรู้ เพื่อประโยชน์แก่สังคมไทยและประชาชนทุกกลุ่ม
                </p>

                <div className="about-hero-clean-actions" aria-label="ลิงก์ลัดเกี่ยวกับราชบัณฑิตยสภา">
                  <a href="#history" className="about-clean-btn primary">ประวัติความเป็นมา</a>
                  <a href="#mission" className="about-clean-btn secondary">บทบาทและภารกิจ</a>
                </div>
              </div>

              <aside className="about-hero-clean-visual" aria-label="ภาพประกอบราชบัณฑิตยสภา">
                <img src="/assets/royalsociety/images/hero01.jpg" alt="ภาพประกอบราชบัณฑิตยสภาและองค์ความรู้ของชาติ" loading="eager" />
              </aside>
            </div>

            <dl className="about-hero-clean-facts" aria-label="ข้อมูลสำคัญโดยสรุป">
              <div>
                <dt>สถาปนา</dt>
                <dd>{founded || "๑๙ เม.ย. ๒๔๖๙"}</dd>
              </div>
              <div>
                <dt>กฎหมายปัจจุบัน</dt>
                <dd>{currentLaw || "พ.ศ. ๒๕๕๘"}</dd>
              </div>
              <div>
                <dt>โครงสร้างวิชาการ</dt>
                <dd>{bureauCount ? bureauCount + " สำนัก" : "๓ สำนัก"}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="about-intro-v3 section-soft" aria-labelledby="about-intro-title">
          <div className="about-container">
            <div className="about-intro-v3-grid">
              <div className="about-intro-v3-feature">
                <span className="about-kicker-light">{about?.excerpt || "Institution Overview"}</span>

                <h2 id="about-intro-title">
                  {about?.title ? (
                    about.title
                  ) : (
                    <>
                      จากราชบัณฑิตยสภา<br />
                      สู่สำนักงานราชบัณฑิตยสภา
                    </>
                  )}
                </h2>

                {about?.content ? (
                  <div dangerouslySetInnerHTML={{ __html: about.content }} />
                ) : (
                  <p>
                    พัฒนาการของสถาบันทางวิชาการของชาติ ที่ทำหน้าที่รวบรวม
                    สร้างสรรค์ และเผยแพร่องค์ความรู้ด้านภาษา วิทยาการ และวัฒนธรรม
                    ให้เข้าถึงประชาชนได้มากขึ้น
                  </p>
                )}

                <div className="about-intro-v3-highlight">
                  <strong>บทบาทสำคัญ</strong>
                  <span>เชื่อมโยงองค์ความรู้จากผู้ทรงคุณวุฒิ สู่สังคมไทยในรูปแบบที่ใช้งานได้จริง</span>
                </div>
              </div>

              <div className="about-intro-v3-story" aria-label="ภาพรวมพัฒนาการของราชบัณฑิตยสภา">
                <article className="about-story-v3-card">
                  <span className="story-v3-label">อดีต</span>
                  <div className="story-v3-number">01</div>
                  <div>
                    <h3>รากฐานจากงานราชบัณฑิตย์</h3>
                    <p>
                      ราชบัณฑิตยสภามีรากฐานจากการฟื้นฟูกิจการของกรมราชบัณฑิตย์
                      โดยมีเป้าหมายในการรวบรวมผู้ทรงความรู้เพื่อค้นคว้าและเผยแพร่วิชาการแก่ประชาชน
                    </p>
                  </div>
                </article>

                <article className="about-story-v3-card">
                  <span className="story-v3-label">พัฒนา</span>
                  <div className="story-v3-number">02</div>
                  <div>
                    <h3>ยกระดับงานวิชาการและภาษาไทย</h3>
                    <p>
                      บทบาทขององค์กรพัฒนาอย่างต่อเนื่อง ทั้งการจัดทำพจนานุกรม
                      การบัญญัติศัพท์ สารานุกรม และหลักเกณฑ์การใช้ภาษาไทยให้เป็นมาตรฐานเดียวกัน
                    </p>
                  </div>
                </article>

                <article className="about-story-v3-card accent">
                  <span className="story-v3-label">ปัจจุบัน</span>
                  <div className="story-v3-number">03</div>
                  <div>
                    <h3>เชื่อมโยงองค์ความรู้สู่สังคม</h3>
                    <p>
                      สำนักงานราชบัณฑิตยสภาสนับสนุนภารกิจของราชบัณฑิตยสภา
                      ผ่านสื่อ สิ่งพิมพ์ ฐานข้อมูล และบริการทางวิชาการ
                      เพื่อให้ประชาชนเข้าถึงความรู้ที่ถูกต้อง
                    </p>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="about-history-v2" id="history" aria-labelledby="history-title">
          <div className="about-container">
            <div className="about-history-head">
              <span className="about-kicker">Historical Timeline</span>
              <h2 id="history-title">เส้นทางประวัติศาสตร์</h2>
              <p>
                สรุปเหตุการณ์สำคัญที่สะท้อนพัฒนาการของราชบัณฑิตยสภา
                และบทบาทด้านงานวิชาการของประเทศ
              </p>
            </div>

            <div className="history-timeline-v2" aria-label="ลำดับเหตุการณ์สำคัญของราชบัณฑิตยสภา">
              {timeline.length ? (
                timeline.map((e, i) => (
                  <article
                    className={"history-item-v2" + (i === 0 ? " is-featured" : i === timeline.length - 1 ? " is-current" : "")}
                    key={e.title + i}
                  >
                    <div className="history-year">
                      <time dateTime={e.acf?.year || ""}>{e.acf?.year || ""}</time>
                    </div>
                    <div className="history-card">
                      {e.acf?.status_label ? <span className="history-status">{e.acf.status_label}</span> : null}
                      <h3>{e.title}</h3>
                      {/* excerpt is plain text; content is trusted, server-seeded
                          WP rich-text HTML (same trust boundary as `about.content`
                          above) — rendering it through plain-text interpolation
                          would print literal "<p>...</p>" tags instead of parsing
                          them, which is exactly what a timeline item with an empty
                          excerpt used to do here. */}
                      {e.excerpt ? (
                        <p>{e.excerpt}</p>
                      ) : e.content ? (
                        <div dangerouslySetInnerHTML={{ __html: e.content }} />
                      ) : null}
                    </div>
                  </article>
                ))
              ) : (
                <article className="history-item-v2 is-featured">
                  <div className="history-year">
                    <time dateTime="1926">พ.ศ. ๒๔๖๙</time>
                  </div>
                  <div className="history-card">
                    <span className="history-status">จุดเริ่มต้น</span>
                    <h3>ประกาศจัดตั้ง &ldquo;ราชบัณฑิตยสภา&rdquo;</h3>
                    <p>
                      พระบาทสมเด็จพระปกเกล้าเจ้าอยู่หัวทรงพระกรุณาโปรดเกล้าฯ
                      ให้จัดตั้งราชบัณฑิตยสภาขึ้น เมื่อวันที่ ๑๙ เมษายน พ.ศ. ๒๔๖๙
                    </p>
                  </div>
                </article>
              )}
            </div>
          </div>
        </section>

        <section className="mission-v2" id="mission" aria-labelledby="mission-title">
          <div className="about-container">
            <div className="mission-v2-grid">
              <div className="mission-v2-head">
                <span className="about-kicker">Mission &amp; Public Value</span>

                <h2 id="mission-title">บทบาทและภารกิจสำคัญ</h2>

                <p>
                  สร้างองค์ความรู้ พัฒนามาตรฐานภาษาไทย และให้บริการทางวิชาการแก่ประชาชน
                  เพื่อให้ความรู้ที่ถูกต้อง เชื่อถือได้ และนำไปใช้ประโยชน์ได้จริง
                </p>

                <a href="#service" className="mission-v2-link">
                  ดูบริการสำหรับประชาชน
                  <span>→</span>
                </a>
              </div>

              <div className="mission-v2-list" aria-label="บทบาทและภารกิจสำคัญของราชบัณฑิตยสภา">
                {(missionItems.length ? missionItems : FALLBACK_MISSION).map((e, i, arr) => (
                  <article className={"mission-v2-card" + (i === arr.length - 1 ? " is-emphasis" : "")} key={e.title + i}>
                    <span className="mission-v2-icon" aria-hidden="true">
                      <RsIcon id={missionIconId(e, i)} />
                    </span>
                    <span className="mission-v2-number">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <h3>{e.title}</h3>
                      <p>{e.excerpt}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="structure-v2" aria-labelledby="structure-title">
          <div className="about-container">
            <div className="structure-v2-grid">
              <div className="structure-v2-head">
                <span className="about-kicker">Organization</span>

                <h2 id="structure-title">โครงสร้างการดำเนินงาน</h2>

                <p>
                  การดำเนินงานของราชบัณฑิตยสภาเชื่อมโยงระหว่างส่วนสภาราชบัณฑิตและสำนักงาน
                  เพื่อขับเคลื่อนงานวิชาการและบริการสาธารณะอย่างเป็นระบบ
                </p>

                <figure className="structure-v2-image">
                  <img src="/assets/royalsociety/images/about-structure.png" alt="ภาพประกอบโครงสร้างการดำเนินงานของราชบัณฑิตยสภา" loading="lazy" />
                </figure>
              </div>

              <div className="structure-v2-content">
                <div className="structure-main-flow" aria-label="ส่วนงานหลักของราชบัณฑิตยสภา">
                  <article className="structure-main-card">
                    <span className="structure-label">ส่วนสภา</span>
                    <h3>ราชบัณฑิตยสภา</h3>
                    <p>
                      ทำหน้าที่กำหนดทิศทางและวางนโยบายด้านวิชาการ พิจารณาให้ความเห็นชอบ
                      ข้อบังคับ ระเบียบ และการดำเนินงานสำคัญที่เกี่ยวข้องกับราชบัณฑิต
                      และงานวิชาการของประเทศ
                    </p>
                  </article>

                  <div className="structure-connector" aria-hidden="true">
                    <span></span>
                  </div>

                  <article className="structure-main-card soft">
                    <span className="structure-label">ส่วนสำนักงาน</span>
                    <h3>สำนักงานราชบัณฑิตยสภา</h3>
                    <p>
                      ทำหน้าที่สนับสนุนงานวิชาการ งานธุรการ การเผยแพร่ผลงาน
                      การประสานงานกับสำนักต่าง ๆ และการให้บริการประชาชนอย่างต่อเนื่อง
                    </p>
                  </article>
                </div>

                <div className="structure-schools">
                  <div className="structure-schools-head">
                    <h3>สามสำนักทางวิชาการ</h3>
                    <p>กลไกสำคัญในการขับเคลื่อนองค์ความรู้ในสาขาต่าง ๆ</p>
                  </div>

                  <div className="school-v2-grid" aria-label="สามสำนักของราชบัณฑิตยสภา">
                    {(orgUnits.length ? orgUnits : FALLBACK_ORG_UNITS).map((e, i) => (
                      <a href="#" className="school-v2-card" key={e.title + i}>
                        <span className="school-index">{String(i + 1).padStart(2, "0")}</span>
                        <strong>{e.title}</strong>
                        <span>{e.excerpt}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="knowledge-standards-v2" aria-labelledby="knowledge-title">
          <div className="about-container">
            <div className="knowledge-standards-head">
              <span className="about-kicker">Knowledge Standards</span>
              <h2 id="knowledge-title">ผลงานอ้างอิงที่ประชาชนใช้ประโยชน์</h2>
              <p>
                งานวิชาการสำคัญที่ช่วยสร้างมาตรฐานภาษาไทย
                และฐานความรู้ของประเทศ ให้ประชาชน หน่วยงาน และผู้เรียนสามารถนำไปใช้อ้างอิงได้
              </p>
            </div>

            <div className="knowledge-standards-layout">
              <article className="knowledge-feature-card">
                <span className="knowledge-feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h12v16H7a2.5 2.5 0 0 0-2.5 2.5v-16Z"></path>
                    <path d="M4.5 18.5A2.5 2.5 0 0 1 7 16h12"></path>
                    <path d="M8 7h7M8 10h5"></path>
                  </svg>
                </span>

                <span className="knowledge-label">ใช้บ่อยที่สุด</span>
                <h3>พจนานุกรม</h3>
                <p>
                  งานชำระและจัดทำพจนานุกรม เพื่อเป็นมาตรฐานการใช้คำภาษาไทย
                  ทั้งความหมาย การสะกด และการใช้คำอย่างถูกต้อง
                </p>

                <a href="/royalsociety/knowledge" className="knowledge-feature-link">
                  ค้นหาคำในพจนานุกรม
                  <span>→</span>
                </a>
              </article>

              <div className="knowledge-standards-grid">
                <article className="knowledge-standard-card">
                  <span className="knowledge-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M5 4h9.5L19 8.5V20H5V4Z"></path>
                      <path d="M14.5 4v4.5H19"></path>
                      <path d="M8 12h8M8 15h6"></path>
                    </svg>
                  </span>
                  <div>
                    <h3>สารานุกรม</h3>
                    <p>รวบรวมองค์ความรู้หลากหลายสาขา ให้ประชาชนเข้าถึงและศึกษาได้ง่าย</p>
                    <a href="/royalsociety/knowledge">เปิดดูสารานุกรม <span>→</span></a>
                  </div>
                </article>

                <article className="knowledge-standard-card">
                  <span className="knowledge-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M4 6h16"></path>
                      <path d="M7 10h10"></path>
                      <path d="M9 14h6"></path>
                      <path d="M11 18h2"></path>
                    </svg>
                  </span>
                  <div>
                    <h3>บัญญัติศัพท์</h3>
                    <p>จัดทำคำศัพท์และคำอธิบายศัพท์ในสาขาวิชาต่าง ๆ เพื่อใช้เป็นแนวทางอ้างอิง</p>
                    <a href="/royalsociety/knowledge">ค้นศัพท์บัญญัติ <span>→</span></a>
                  </div>
                </article>

                <article className="knowledge-standard-card">
                  <span className="knowledge-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"></path>
                      <path d="M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z"></path>
                    </svg>
                  </span>
                  <div>
                    <h3>อักขรานุกรมภูมิศาสตร์</h3>
                    <p>สนับสนุนข้อมูลชื่อภูมิศาสตร์และการเขียนชื่อที่ถูกต้องเป็นมาตรฐาน</p>
                    <a href="/royalsociety/knowledge">ดูข้อมูลภูมิศาสตร์ <span>→</span></a>
                  </div>
                </article>

                <article className="knowledge-standard-card">
                  <span className="knowledge-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M6 4h12v16H6V4Z"></path>
                      <path d="M9 8h6M9 12h6M9 16h3"></path>
                      <path d="M18 7l2-2"></path>
                    </svg>
                  </span>
                  <div>
                    <h3>หลักเกณฑ์ภาษาไทย</h3>
                    <p>กำหนดหลักเกณฑ์การใช้ภาษา การถอดอักษร และแนวทางการเขียนที่เหมาะสม</p>
                    <a href="/royalsociety/knowledge">อ่านหลักเกณฑ์ <span>→</span></a>
                  </div>
                </article>

                <article className="knowledge-standard-card">
                  <span className="knowledge-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M4.5 5.5h15v10h-8L7 19v-3.5H4.5v-10Z"></path>
                      <path d="M8 9h8M8 12h5"></path>
                    </svg>
                  </span>
                  <div>
                    <h3>บริการวิชาการ</h3>
                    <p>เผยแพร่ความรู้ผ่านสื่อ สิ่งพิมพ์ ฐานข้อมูล และกิจกรรมเพื่อประชาชน</p>
                    <a href="/royalsociety/services">ใช้บริการวิชาการ <span>→</span></a>
                  </div>
                </article>

                <article className="knowledge-standard-card soft">
                  <span className="knowledge-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z"></path>
                      <path d="M4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7"></path>
                      <path d="M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5"></path>
                    </svg>
                  </span>
                  <div>
                    <h3>ฐานข้อมูลอ้างอิง</h3>
                    <p>เชื่อมโยงผลงานวิชาการ คำศัพท์ หนังสือ และข้อมูลมาตรฐานสำหรับการค้นคว้า</p>
                    <a href="/royalsociety/knowledge">ไปยังฐานข้อมูล <span>→</span></a>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="about-contact-strip" aria-labelledby="contact-title">
          <div className="about-container contact-card">
            <div>
              <span className="about-kicker">Contact</span>
              <h2 id="contact-title">ที่ทำการสำนักงานราชบัณฑิตยสภา</h2>
              <p>
                เลขที่ ๑๒๐ หมู่ ๓ ศูนย์ราชการเฉลิมพระเกียรติ ๘๐ พรรษา ๕ ธันวาคม ๒๕๕๐ อาคารซี
                แขวงทุ่งสองห้อง เขตหลักสี่ กรุงเทพมหานคร ๑๐๒๑๐
              </p>
            </div>
            <a href="/royalsociety/contact" className="about-btn primary">ติดต่อเรา</a>
          </div>
        </section>
      </main>
    </>
  );
}
