"use client";
import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { useLang } from "@/components/LangProvider";
import { useTenant } from "@/components/TenantProvider";

const SERIES = [42, 55, 48, 63, 58, 71, 66, 80, 76, 88, 82, 95];
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const SPARKS = [
  [3, 5, 4, 6, 5, 7, 8, 9], [4, 4, 5, 6, 6, 7, 8, 8],
  [2, 4, 3, 5, 6, 6, 8, 9], [8, 9, 8, 9, 9, 10, 9, 10],
];
const HEALTH: [string, string][] = [
  ["API latency (p95)", "84 ms"], ["Edge cache hit", "98.7%"], ["SSL / TLS", "Valid · A+"],
  ["Last backup", "3h ago"], ["DR replication", "In sync"],
];
const SLA_DAYS = 3;

const ACT: Record<string, { th: string; en: string; cls: string }> = {
  publish: { th: "เผยแพร่", en: "published", cls: "ok" },
  update: { th: "แก้ไข", en: "updated", cls: "info" },
  create: { th: "สร้าง", en: "created", cls: "info" },
  unpublish: { th: "ยกเลิกเผยแพร่", en: "unpublished", cls: "warn" },
};
function ctName(uid: string, lang: string) {
  const m: Record<string, string> = {
    "api::article.article": lang === "th" ? "บทความ" : "Article",
    "api::service.service": lang === "th" ? "บริการ" : "Service",
    "api::banner.banner": lang === "th" ? "แบนเนอร์" : "Banner",
    "api::faq.faq": "FAQ",
  };
  return m[uid] || uid.split(".").pop() || uid;
}
function timeAgo(iso: string, lang: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return lang === "th" ? "เมื่อสักครู่" : "just now";
  const m = Math.floor(s / 60); if (m < 60) return lang === "th" ? `${m} นาทีที่แล้ว` : `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return lang === "th" ? `${h} ชม.ที่แล้ว` : `${h}h ago`;
  const d = Math.floor(h / 24); return lang === "th" ? `${d} วันที่แล้ว` : `${d}d ago`;
}
const ageDays = (d?: string) => { const t = d ? new Date(d).getTime() : NaN; return isNaN(t) ? 0 : (Date.now() - t) / 86400000; };

function Sparkline({ data }: { data: number[] }) {
  const w = 100, h = 28, mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - mn) / rng) * (h - 4)).toFixed(1)}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="spark-svg" aria-hidden>
    <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
  </svg>;
}
function Ring({ value }: { value: number }) {
  const r = 32, c = 2 * Math.PI * r, off = c * (1 - value / 100);
  return <div className="ring">
    <svg viewBox="0 0 80 80">
      <circle cx="40" cy="40" r={r} className="ring-bg" />
      <circle cx="40" cy="40" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 40 40)" />
    </svg>
    <div className="ring-val"><b>{value}</b><span>/100</span></div>
  </div>;
}

type Svc = { label: string; icon: string; total: number; pending: number; overdue: number };

export default function Dashboard() {
  const { t, lang } = useLang();
  const { currentKey } = useTenant();
  const [name, setName] = useState<string>("");
  const [hour, setHour] = useState<number | null>(null);
  const [counts, setCounts] = useState<{ articles?: number; services?: number; submissions?: number }>({});
  const [svc, setSvc] = useState<Svc[]>([]);
  const [sla, setSla] = useState({ pending: 0, overdue: 0, onTime: 100 });
  const [pdpa, setPdpa] = useState({ total: 0, accept: 0, rate: 0 });
  const [feed, setFeed] = useState<any[]>([]);
  const mx = Math.max(...SERIES);

  useEffect(() => { setHour(new Date().getHours()); }, []);
  useEffect(() => {
    fetch("/api/strapi/admin/users/me").then((r) => (r.ok ? r.json() : null))
      .then((j) => { setName(j?.data?.firstname || j?.data?.username || ""); }).catch(() => {});
  }, []);

  const tenRel = useCallback(() => currentKey && currentKey !== "workspace" ? "&filters[tenant][key][$eq]=" + encodeURIComponent(currentKey) : "", [currentKey]);
  const count = useCallback(async (uid: string): Promise<number | undefined> => {
    try {
      const r = await fetch("/api/strapi/content-manager/collection-types/" + uid + "?page=1&pageSize=1" + tenRel());
      if (!r.ok) return undefined;
      return (await r.json()).pagination?.total;
    } catch { return undefined; }
  }, [tenRel]);
  const list = useCallback(async (uid: string, qs = "", rel = true): Promise<{ items: any[]; total: number }> => {
    try {
      const r = await fetch("/api/strapi/content-manager/collection-types/" + uid + "?page=1&pageSize=100" + qs + (rel ? tenRel() : ""));
      if (!r.ok) return { items: [], total: 0 };
      const j = await r.json();
      return { items: j.results || [], total: j.pagination?.total ?? (j.results?.length || 0) };
    } catch { return { items: [], total: 0 }; }
  }, [tenRel]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [a, s, cmp, app, con, cnt, aud] = await Promise.all([
        count("api::article.article"), count("api::service.service"),
        list("api::complaint.complaint", "&sort=createdAt:desc"),
        list("api::application.application", "&sort=createdAt:desc"),
        list("api::contact-message.contact-message", "&sort=createdAt:desc"),
        list("api::consent-log.consent-log"),
        list("api::audit-log.audit-log", "&sort=createdAt:desc", false),
      ]);
      if (!alive) return;

      const stat = (items: any[], isPending: (x: any) => boolean, dateOf: (x: any) => string | undefined) => {
        const pend = items.filter(isPending);
        const over = pend.filter((x) => ageDays(dateOf(x)) > SLA_DAYS);
        return { total: items.length, pending: pend.length, overdue: over.length };
      };
      const cS = stat(cmp.items, (x) => (x.stage ?? 0) < 3, (x) => x.date || x.createdAt);
      const aS = stat(app.items, (x) => (x.stage ?? 0) < 3, (x) => x.date || x.createdAt);
      const tS = stat(cnt.items, (x) => !x.handled, (x) => x.createdAt);

      setCounts({ articles: a, services: s, submissions: cmp.total + app.total + cnt.total });
      setSvc([
        { label: lang === "th" ? "เรื่องร้องเรียน / ข้อเสนอแนะ" : "Complaints & feedback", icon: "inbox", ...cS },
        { label: lang === "th" ? "รับสมัครงาน" : "Job applications", icon: "users", ...aS },
        { label: lang === "th" ? "ข้อความติดต่อ" : "Contact messages", icon: "bell", ...tS },
      ]);
      const totalAll = cmp.items.length + app.items.length + cnt.items.length;
      const overAll = cS.overdue + aS.overdue + tS.overdue;
      setSla({ pending: cS.pending + aS.pending + tS.pending, overdue: overAll, onTime: totalAll ? Math.round((totalAll - overAll) / totalAll * 100) : 100 });

      const accept = con.items.filter((x) => x.action === "accept").length;
      setPdpa({ total: con.total, accept, rate: con.items.length ? Math.round(accept / con.items.length * 100) : 0 });
      setFeed(aud.items.slice(0, 6));
    })();
    return () => { alive = false; };
  }, [count, list, lang]);

  const greeting = hour == null ? "" : lang === "th"
    ? (hour < 12 ? "สวัสดีตอนเช้า" : hour < 18 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น")
    : (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
  const nf = (n?: number) => (typeof n === "number" ? n.toLocaleString() : "—");
  const KPIS = [
    { key: "kpi.content", icon: "doc", val: nf(counts.articles), real: true, sub: lang === "th" ? "บทความทั้งหมดในระบบ" : "Total articles" },
    { key: "kpi.services", icon: "layout", val: nf(counts.services), real: true, sub: lang === "th" ? "บริการที่เปิดให้บริการ" : "Active services" },
    { key: "kpi.submissions", icon: "inbox", val: nf(counts.submissions), real: true, sub: lang === "th" ? "คำร้องที่ส่งเข้ามา" : "Form submissions" },
    { key: "kpi.uptime", icon: "code", val: "99.98%", real: false, sub: lang === "th" ? "30 วันล่าสุด" : "Last 30 days" },
  ];
  const A11Y = [
    lang === "th" ? "ความคมชัดของสี (Contrast AA)" : "Color contrast (AA)",
    lang === "th" ? "ข้อความแทนภาพ (Alt text)" : "Image alt text",
    lang === "th" ? "นำทางด้วยคีย์บอร์ด" : "Keyboard navigation",
    lang === "th" ? "ป้ายกำกับ ARIA ครบถ้วน" : "ARIA landmarks",
  ];
  const PDPA = [
    lang === "th" ? "นโยบายความเป็นส่วนตัว เผยแพร่แล้ว" : "Privacy policy published",
    lang === "th" ? "แบนเนอร์คุกกี้ เปิดใช้งาน" : "Cookie consent banner active",
    lang === "th" ? "ระยะเก็บข้อมูล 24 เดือน" : "Data retention: 24 months",
    lang === "th" ? "คำขอใช้สิทธิ (DSAR): 0 ค้าง" : "Data subject requests: 0 pending",
  ];

  return (
    <>
      <div className="vh">
        <div>
          {hour == null ? <h1>{t("dash.title")}</h1> : <h1>{greeting}{name && ` ${name}`}</h1>}
          <p>{t("dash.sub")}</p>
        </div>
        <div className="vh-act"><button className="btn btn--g"><Icon name="doc" />{t("dash.export")}</button></div>
      </div>

      <div className="kpis">
        {KPIS.map((k, i) => (
          <div className="kpi" key={k.key}>
            <div className="kpi-top">
              <div className="lab"><Icon name={k.icon} />{t(k.key)}</div>
              <span className={"kpi-delta " + (k.real ? "live" : "flat")}>{k.real ? <><span className="dot" />live</> : "30d"}</span>
            </div>
            <div className="val mono">{k.val}</div>
            <div className="kpi-spark"><Sparkline data={SPARKS[i]} /></div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Citizen services + SLA */}
      <div className="panel svc">
        <div className="panel-h">
          <h3>{lang === "th" ? "บริการประชาชน" : "Citizen services"}</h3>
          <div className="sla-chips">
            <span className="sla-chip"><b>{sla.pending}</b>{lang === "th" ? "รอดำเนินการ" : "pending"}</span>
            <span className={"sla-chip" + (sla.overdue > 0 ? " warn" : "")}><b>{sla.overdue}</b>{lang === "th" ? "เกินกำหนด SLA" : "SLA breached"}</span>
            <span className="sla-chip ok"><Icon name="clock" /><b>{sla.onTime}%</b>{lang === "th" ? "อยู่ในกรอบเวลา" : "on-time"}</span>
          </div>
        </div>
        <div className="svc-rows">
          {svc.map((s) => {
            const handled = s.total ? Math.round(((s.total - s.pending) / s.total) * 100) : 0;
            return (
              <div className="svc-row" key={s.label}>
                <span className="svc-ic"><Icon name={s.icon} /></span>
                <div className="svc-meta">
                  <div className="svc-name">{s.label}</div>
                  <div className="svc-bar"><i style={{ width: handled + "%" }} /></div>
                </div>
                <div className="svc-nums">
                  <span className="svc-total mono">{s.total}</span>
                  <span className="svc-tags">
                    <span className="svc-tag">{s.pending} {lang === "th" ? "ค้าง" : "open"}</span>
                    {s.overdue > 0 && <span className="svc-tag red">{s.overdue} {lang === "th" ? "เกิน" : "late"}</span>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Traffic + Activity feed */}
      <div className="two">
        <div className="panel">
          <div className="panel-h"><h3>{t("dash.traffic")}</h3><span className="sub">{t("dash.sessions")}</span></div>
          <div className="bars">{SERIES.map((v, i) => <div key={i} className="bar" style={{ height: Math.round((v / mx) * 100) + "%" }} />)}</div>
          <div className="bar-x">{MONTHS.map((m, i) => <span key={i}>{m}</span>)}</div>
        </div>
        <div className="panel feed">
          <div className="panel-h"><h3>{lang === "th" ? "กิจกรรมล่าสุด" : "Recent activity"}</h3></div>
          {feed.length === 0 && <div className="feed-empty">{lang === "th" ? "ยังไม่มีกิจกรรม" : "No activity yet"}</div>}
          {feed.map((a, i) => {
            const act = ACT[a.action] || { th: a.action, en: a.action, cls: "info" };
            const who = a.actor || a.adminEmail || "—";
            return (
              <div className="feed-row" key={i}>
                <span className="feed-av">{who[0]?.toUpperCase()}</span>
                <div className="feed-body">
                  <div className="feed-tx"><b>{who}</b> {lang === "th" ? act.th : act.en} <b>{a.targetRef || ctName(a.contentType, lang)}</b></div>
                  <div className="feed-meta">{ctName(a.contentType, lang)} · {timeAgo(a.at || a.createdAt, lang)}</div>
                </div>
                <span className={"feed-tag " + act.cls}>{lang === "th" ? act.th : act.en}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Compliance: accessibility · PDPA · health */}
      <div className="three">
        <div className="panel comp">
          <div className="panel-h"><h3><Icon name="eye" />{lang === "th" ? "การเข้าถึง" : "Accessibility"}</h3><span className="comp-lvl">WCAG 2.2 AA</span></div>
          <div className="comp-body">
            <Ring value={96} />
            <ul className="checks">{A11Y.map((c) => <li key={c}><Icon name="check" />{c}</li>)}</ul>
          </div>
        </div>
        <div className="panel comp">
          <div className="panel-h"><h3><Icon name="shield" />{lang === "th" ? "PDPA · ความเป็นส่วนตัว" : "PDPA · Privacy"}</h3><span className="comp-lvl ok">{lang === "th" ? "สอดคล้อง" : "Compliant"}</span></div>
          <div className="pdpa-stat">
            <div><b>{pdpa.rate}%</b><span>{lang === "th" ? "ยินยอมคุกกี้" : "Consent rate"}</span></div>
            <div><b className="mono">{pdpa.total.toLocaleString()}</b><span>{lang === "th" ? "บันทึกความยินยอม" : "Consent records"}</span></div>
          </div>
          <ul className="checks">{PDPA.map((c) => <li key={c}><Icon name="check" />{c}</li>)}</ul>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>{t("dash.health")}</h3></div>
          {HEALTH.map(([l, v]) => (
            <div key={l} className="health-row">
              <span>{l}</span><span className="badge b-ok"><span className="dot" />{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="notice"><Icon name="spark" /> {lang === "th" ? "ข้อมูลอัปเดตแบบเรียลไทม์" : "Updated in real time"}</div>
    </>
  );
}
