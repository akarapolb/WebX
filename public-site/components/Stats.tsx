import { Icon } from "./IconSprite";

// Static parity with the original's hard-coded stats band — home.js only
// animated the count-up, it never sourced these from the CMS either.
const STATS = [
  { icon: "i-users", value: "30 ล้าน+", label: "ผู้ใช้บริการ" },
  { icon: "i-grid", value: "1,400+", label: "บริการดิจิทัล" },
  { icon: "i-shield", value: "99.9%", label: "ความพร้อมระบบ" },
  { icon: "i-clock", value: "24/7", label: "ศูนย์ช่วยเหลือ" },
];

export default function Stats() {
  return (
    <section className="stats-band" aria-label="สถิติการให้บริการ">
      <div className="wrap">
        {STATS.map((s) => (
          <div className="stat-item" key={s.label}>
            <span className="ic" aria-hidden="true"><Icon id={s.icon} size="lg" /></span>
            <div className="stat-body">
              <b className="stat-num">{s.value}</b>
              <span className="stat-label">{s.label}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
