import { Shell, base, searchPath } from "@/templates/dgahub/Site";

// Hub-styled "page not found". The static export writes /dgahub/404.html; a host
// serving only the hub uses it as its 404 page (see tools/webx/publish-dgahub.mjs).
export const metadata = { title: "ไม่พบหน้านี้ · Page not found", robots: { index: false } };

export default function Page() {
  return (
    <Shell locale="th" path={base("th") + "/404"}>
      <div className="page-head">
        <div className="wrap">
          <p className="eyebrow" style={{ color: "var(--hero-accent)" }}>404</p>
          <h1>ไม่พบหน้านี้</h1>
          <p lang="en">Page not found</p>
        </div>
      </div>
      <section className="section">
        <div className="wrap prose">
          <p>หน้าที่คุณเรียกอาจถูกย้ายหรือไม่มีอยู่แล้ว ลองค้นหา หรือกลับไปที่หน้าแรก</p>
          <p lang="en">The page may have moved or no longer exists. Try searching, or go back to the home page.</p>
          <p style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
            <a className="btn" href={base("th")}>หน้าแรก</a>
            <a className="btn ghost" href={searchPath("th")}>ค้นหา</a>
            <a className="btn ghost" href={base("en")} lang="en">English home</a>
          </p>
        </div>
      </section>
    </Shell>
  );
}
