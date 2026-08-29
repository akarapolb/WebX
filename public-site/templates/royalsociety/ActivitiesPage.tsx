
const TH_MONTHS_ABBR = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// Formats an ISO date the same way the source hand-writes its list-item date
// badge: <span class="rs-list-item__date"><strong>18</strong>ก.พ. 69</span>
// — day split out for the <strong>, "<Thai month abbr.> <2-digit Buddhist
// year>" for the rest. Falls back to em dashes for an unparsable date rather
// than throwing, since this runs over CMS-supplied strings.
function formatActivityDate(iso: string): { day: string; monthYear: string } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { day: "--", monthYear: "" };
  const day = String(d.getDate()).padStart(2, "0");
  const yy = String((d.getFullYear() + 543) % 100).padStart(2, "0");
  return { day, monthYear: `${TH_MONTHS_ABBR[d.getMonth()]} ${yy}` };
}

// Ported from RoyalSociety/pages/activities.html. Only the news/activity list
// (source: <ul class="rs-list" data-cms-repeat="activities">) is CMS content —
// mapped from the `activities` prop. The filter tags and pagination beside it
// have no matching data in the CMS shape given here (`title`/`excerpt`/`date`/
// `slug`) and aren't marked as CMS-repeated in the source either, so they stay
// static. The monthly calendar panel and the reports/downloads table also stay
// static, verbatim from the source.
//
// The source's list item also carries a `.rs-list-item__tag` category badge
// (e.g. "ประชุมวิชาการ") with no matching field in the given CMS shape, so
// it's omitted rather than invented.
export default function ActivitiesPage({
  activities,
}: {
  activities: { title: string; excerpt: string; date: string; slug: string }[];
}) {
  return (
      <main id="main-content">
        <section className="page-hero">
          <div className="container page-hero__inner">
            <nav className="breadcrumb" aria-label="เส้นทางนำทาง">
              <a href="/royalsociety">หน้าหลัก</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">งานวิชาการและกิจกรรม</span>
            </nav>

            <span className="page-hero__kicker">Academic Activities</span>
            <h1 className="page-hero__title">งานวิชาการและกิจกรรม</h1>
            <p className="page-hero__lead">
              ติดตามการประชุมวิชาการ การบรรยาย โครงการเผยแพร่ความรู้ ประกาศของหน่วยงาน
              และปฏิทินกิจกรรมที่เปิดให้ประชาชนเข้าร่วม
            </p>
          </div>
        </section>

        <section className="section" aria-labelledby="ac-list-title">
          <div className="container">
            <div className="rs-grid rs-grid--sidebar">
              <div>
                <div className="section-head">
                  <span className="eyebrow">ล่าสุด</span>
                  <h2 id="ac-list-title">ข่าวสารและกิจกรรม</h2>
                </div>

                <div className="rs-tags" style={{ marginBottom: 18 }} aria-label="กรองตามประเภท">
                  <a className="rs-tag is-active" href="#">ทั้งหมด</a>
                  <a className="rs-tag" href="#">ข่าวกิจกรรม</a>
                  <a className="rs-tag" href="#">ประชุมวิชาการ</a>
                  <a className="rs-tag" href="#">บรรยายวิชาการ</a>
                  <a className="rs-tag" href="#">ประกาศ</a>
                </div>

                <ul className="rs-list">
                  {activities.map((a, i) => {
                    const { day, monthYear } = formatActivityDate(a.date);
                    return (
                      <li className="rs-list-item" key={a.slug || i}>
                        <span className="rs-list-item__date">
                          <strong>{day}</strong>{monthYear}
                        </span>
                        <div className="rs-list-item__body">
                          <h3>
                            <a href="/royalsociety/activities">{a.title}</a>
                          </h3>
                          <p>{a.excerpt}</p>
                        </div>
                        <span className="rs-list-item__arrow" aria-hidden="true">→</span>
                      </li>
                    );
                  })}
                </ul>

                <nav className="rs-pagination" aria-label="แบ่งหน้ารายการกิจกรรม">
                  <span aria-current="page">1</span>
                  <a href="#">2</a>
                  <a href="#">3</a>
                  <a href="#">ถัดไป →</a>
                </nav>
              </div>

              <aside>
                <div className="rs-panel rs-panel--soft">
                  <h3 style={{ marginTop: 0 }}>ปฏิทินกิจกรรมเดือนนี้</h3>
                  <ul className="rs-list" style={{ gap: 8 }}>
                    <li className="rs-list-item" style={{ padding: 12 }}>
                      <span className="rs-list-item__date"><strong>18</strong>ก.พ.</span>
                      <div className="rs-list-item__body">
                        <h3 style={{ fontSize: ".98rem" }}>ประชุมใหญ่สามัญประจำปี</h3>
                        <p>09:00 น. · ห้องประชุมใหญ่</p>
                      </div>
                      <span className="rs-list-item__arrow" aria-hidden="true">→</span>
                    </li>
                    <li className="rs-list-item" style={{ padding: 12 }}>
                      <span className="rs-list-item__date"><strong>24</strong>ก.พ.</span>
                      <div className="rs-list-item__body">
                        <h3 style={{ fontSize: ".98rem" }}>บรรยายวิชาการสำหรับประชาชน</h3>
                        <p>13:30 น. · ถ่ายทอดสดออนไลน์</p>
                      </div>
                      <span className="rs-list-item__arrow" aria-hidden="true">→</span>
                    </li>
                  </ul>
                </div>

                <div className="rs-note" style={{ marginTop: 16 }}>
                  <strong>ลงทะเบียนเข้าร่วมกิจกรรม</strong>
                  กิจกรรมส่วนใหญ่เปิดให้เข้าร่วมฟรี แต่ต้องลงทะเบียนล่วงหน้าอย่างน้อย 3 วันทำการ
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="ac-report-title">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">เอกสารเผยแพร่</span>
              <h2 id="ac-report-title">รายงานและสรุปผลการดำเนินงาน</h2>
            </div>

            <div className="rs-table-wrap">
              <table className="rs-table">
                <caption className="sr-only">รายการรายงานประจำปีและเอกสารสรุปผลการดำเนินงาน</caption>
                <thead>
                  <tr>
                    <th scope="col">ชื่อเอกสาร</th>
                    <th scope="col">ปีงบประมาณ</th>
                    <th scope="col">ประเภทไฟล์</th>
                    <th scope="col">ดาวน์โหลด</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>รายงานประจำปีสำนักงานราชบัณฑิตยสภา</td>
                    <td>2568</td>
                    <td>PDF · 8.2 MB</td>
                    <td><a href="#">ดาวน์โหลด</a></td>
                  </tr>
                  <tr>
                    <td>สรุปผลการประชุมวิชาการประจำปี</td>
                    <td>2568</td>
                    <td>PDF · 3.4 MB</td>
                    <td><a href="#">ดาวน์โหลด</a></td>
                  </tr>
                  <tr>
                    <td>รายงานผลการดำเนินงานตามแผนยุทธศาสตร์</td>
                    <td>2567</td>
                    <td>PDF · 5.1 MB</td>
                    <td><a href="#">ดาวน์โหลด</a></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    );
}
