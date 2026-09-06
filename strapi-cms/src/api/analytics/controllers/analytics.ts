import { fetchGa4Metrics } from '../../../utils/ga4';

/**
 * analytics controller — สรุปสถิติเว็บไซต์สำหรับแดชบอร์ดหลังบ้าน
 * - ดึงสถิติ first-party จริงจากฐานข้อมูล (ต่อ tenant)
 * - นับเนื้อหา (published), ฟอร์มที่ส่งเข้ามา (จำนวนรวม — ไม่เปิดเผยตัวเรคคอร์ด/PDPA),
 *   สถิติความยินยอมคุกกี้ (PDPA), บทความยอดนิยม, ผลโพล, กิจกรรมแอดมินล่าสุด
 * - ป้องกันด้วย policy global::admin-only (ต้องล็อกอิน admin)
 * - tenant: อ่านจาก ctx.state.tenantId (ตั้งโดย tenant middleware จาก ?tenant); ไม่ระบุ = รวมทุก tenant
 */
export default {
  async summary(ctx: any) {
    const strapi = (global as any).strapi;
    const tenantId: number | undefined = ctx.state?.tenantId;
    const tenantKey: string | undefined = ctx.state?.tenantKey;
    const scope = tenantId ? { tenant: tenantId } : {};

    // นับเนื้อหาที่ "เผยแพร่แล้ว" (draft&publish → นับเฉพาะเวอร์ชัน published)
    const pub = { ...scope, publishedAt: { $notNull: true } };
    const countPub = (uid: string) => strapi.db.query(uid).count({ where: pub }).catch(() => 0);
    const countAll = (uid: string) => strapi.db.query(uid).count({ where: scope }).catch(() => 0);

    const [
      articles, services, jobs, faqs, downloads, ebooks, galleries, banners, videos, awards, popups, polls, landings,
    ] = await Promise.all([
      countPub('api::article.article'), countPub('api::service.service'), countPub('api::job.job'),
      countPub('api::faq.faq'), countPub('api::download.download'), countPub('api::ebook.ebook'),
      countPub('api::gallery.gallery'), countPub('api::banner.banner'), countPub('api::video.video'),
      countPub('api::award.award'), countPub('api::popup.popup'), countPub('api::poll.poll'),
      countPub('api::landing.landing'),
    ]);

    // ฟอร์มที่ส่งเข้ามา — นับจำนวนรวมเท่านั้น (ไม่ดึงเนื้อหาเรคคอร์ด เพื่อกัน PDPA)
    const [complaints, applications, registrations] = await Promise.all([
      countAll('api::complaint.complaint'), countAll('api::application.application'), countAll('api::registration.registration'),
    ]);

    // ความยินยอมคุกกี้ (PDPA) — แยกตาม action
    const consentRows: any[] = await strapi.db.query('api::consent-log.consent-log')
      .findMany({ where: scope, select: ['action'], limit: 100000 }).catch(() => []);
    const consent = { total: consentRows.length, accept: 0, reject: 0, custom: 0 };
    consentRows.forEach((r) => {
      const a = String(r.action || '').toLowerCase();
      if (a.indexOf('accept') >= 0 || a === 'all' || a === 'opt-in') consent.accept++;
      else if (a.indexOf('reject') >= 0 || a === 'none' || a === 'opt-out') consent.reject++;
      else consent.custom++;
    });

    // บทความยอดนิยม (ตามยอดเข้าชม) + ยอดเข้าชมรวม
    const topArticles: any[] = await strapi.db.query('api::article.article')
      .findMany({ where: pub, select: ['title', 'views'], orderBy: { views: 'desc' }, limit: 5 }).catch(() => []);
    const totalViews = (await strapi.db.query('api::article.article')
      .findMany({ where: pub, select: ['views'], limit: 100000 }).catch(() => []))
      .reduce((s: number, r: any) => s + (r.views || 0), 0);

    // ผลโพล
    const pollRows: any[] = await strapi.db.query('api::poll.poll')
      .findMany({ where: scope, select: ['question', 'options', 'totalVotes'], limit: 20 }).catch(() => []);

    // กิจกรรมแอดมินล่าสุด (audit log)
    const auditWhere = tenantKey ? { tenantKey } : {};
    const recentAudit: any[] = await strapi.db.query('api::audit-log.audit-log')
      .findMany({ where: auditWhere, select: ['action', 'contentType', 'adminEmail', 'at'], orderBy: { at: 'desc' }, limit: 10 }).catch(() => []);

    // ค่าตั้ง analytics ของ tenant (GA4 / Clarity) สำหรับลิงก์ไปแดชบอร์ดภายนอก
    // — และตอนนี้ดึงตัวเลขจริงจาก GA4 Data API ด้วย เมื่อ tenant ตั้ง
    // ga4PropertyId ไว้และมี service-account credentials (GA4_SERVICE_ACCOUNT_
    // EMAIL/KEY) อยู่ในสภาพแวดล้อม — ไม่มีทั้งสองอย่างนี้ในสภาพแวดล้อม dev นี้
    // เลย (ไม่มี GA4 property จริงให้ดึง) จึงลดกลับไปพฤติกรรมเดิมเสมอ (echo
    // แค่ tracking id) แทนที่จะพัง — ดู utils/ga4.ts's เหตุผลแบบเต็ม
    let externalAnalytics: any = null;
    if (tenantId) {
      const t = await strapi.db.query('api::tenant.tenant')
        .findOne({ where: { id: tenantId }, select: ['key', 'name', 'analytics'] }).catch(() => null);
      externalAnalytics = t?.analytics || null;
      const propertyId = externalAnalytics?.ga4PropertyId;
      if (propertyId) {
        const real = await fetchGa4Metrics(String(propertyId));
        if (real) externalAnalytics = { ...externalAnalytics, ga4Metrics: real };
      }
    }

    // รายชื่อ tenant สำหรับตัวสลับในแดชบอร์ด
    const tenants: any[] = await strapi.db.query('api::tenant.tenant')
      .findMany({ select: ['key', 'name'], limit: 100 }).catch(() => []);

    ctx.body = {
      scope: tenantKey || 'all',
      generatedAt: new Date().toISOString(),
      tenants,
      content: { articles, services, jobs, faqs, downloads, ebooks, galleries, banners, videos, awards, popups, polls, landings },
      contentTotal: articles + services + jobs + faqs + downloads + ebooks + galleries + banners + videos + awards + popups + polls + landings,
      submissions: { complaints, applications, registrations, total: complaints + applications + registrations },
      consent,
      engagement: { totalArticleViews: totalViews, topArticles },
      polls: pollRows,
      recentAudit,
      externalAnalytics,
    };
  },

  /**
   * Monthly report (real gap — no "report" concept existed anywhere in the
   * app before this; the Dashboard's own "Export" button had no onClick at
   * all). Same first-party metrics as summary() above, scoped to one
   * calendar month, delivered as a real downloadable .xlsx workbook — reuses
   * the exact xlsx-generation pattern console.exportData already proved out
   * for form-submission exports (TOR ข้อ 17.9), just a different sheet set.
   * ?month=YYYY-MM (defaults to the current month if missing/malformed).
   */
  async report(ctx: any) {
    const strapi = (global as any).strapi;
    const XLSX = require('xlsx');
    const tenantId: number | undefined = ctx.state?.tenantId;
    const tenantKey: string | undefined = ctx.state?.tenantKey;
    const scope = tenantId ? { tenant: tenantId } : {};

    const m = /^(\d{4})-(\d{2})$/.exec(String(ctx.query.month || ''));
    const now = new Date();
    const year = m ? Number(m[1]) : now.getUTCFullYear();
    const monthIdx = m ? Number(m[2]) - 1 : now.getUTCMonth();
    const rangeStart = new Date(Date.UTC(year, monthIdx, 1));
    const rangeEnd = new Date(Date.UTC(year, monthIdx + 1, 1));
    const monthLabel = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
    const inMonth = { ...scope, createdAt: { $gte: rangeStart.toISOString(), $lt: rangeEnd.toISOString() } };
    const inMonthPub = { ...inMonth, publishedAt: { $notNull: true } };
    const countInMonthPub = (uid: string) => strapi.db.query(uid).count({ where: inMonthPub }).catch(() => 0);
    const countInMonth = (uid: string) => strapi.db.query(uid).count({ where: inMonth }).catch(() => 0);

    const contentTypes: [string, string][] = [
      ['Articles', 'api::article.article'], ['Services', 'api::service.service'], ['Jobs', 'api::job.job'],
      ['FAQs', 'api::faq.faq'], ['Downloads', 'api::download.download'], ['E-books', 'api::ebook.ebook'],
      ['Galleries', 'api::gallery.gallery'], ['Banners', 'api::banner.banner'], ['Videos', 'api::video.video'],
      ['Awards', 'api::award.award'], ['Popups', 'api::popup.popup'], ['Polls', 'api::poll.poll'], ['Landing pages', 'api::landing.landing'],
    ];
    const contentCounts = await Promise.all(contentTypes.map(([, uid]) => countInMonthPub(uid)));

    const submissionTypes: [string, string][] = [
      ['Complaints', 'api::complaint.complaint'], ['Applications', 'api::application.application'], ['Registrations', 'api::registration.registration'],
    ];
    const submissionCounts = await Promise.all(submissionTypes.map(([, uid]) => countInMonth(uid)));

    const consentRows: any[] = await strapi.db.query('api::consent-log.consent-log')
      .findMany({ where: inMonth, select: ['action'], limit: 100000 }).catch(() => []);
    const consent = { accept: 0, reject: 0, custom: 0 };
    consentRows.forEach((r) => {
      const a = String(r.action || '').toLowerCase();
      if (a.indexOf('accept') >= 0 || a === 'all' || a === 'opt-in') consent.accept++;
      else if (a.indexOf('reject') >= 0 || a === 'none' || a === 'opt-out') consent.reject++;
      else consent.custom++;
    });

    // Article views are a cumulative counter, not naturally month-scoped —
    // reported as an all-time snapshot (clearly labeled below), not
    // fabricated into a monthly figure the data can't actually support.
    const topArticles: any[] = await strapi.db.query('api::article.article')
      .findMany({ where: { ...scope, publishedAt: { $notNull: true } }, select: ['title', 'views'], orderBy: { views: 'desc' }, limit: 5 }).catch(() => []);

    const auditWhere = tenantKey ? { tenantKey, ...inMonth } : inMonth;
    const auditRows: any[] = await strapi.db.query('api::audit-log.audit-log')
      .findMany({ where: auditWhere, select: ['action', 'contentType', 'adminEmail', 'at'], orderBy: { at: 'desc' }, limit: 500 }).catch(() => []);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { Metric: 'Tenant', Value: tenantKey || 'all' },
      { Metric: 'Month', Value: monthLabel },
      { Metric: 'Generated at', Value: new Date().toISOString() },
      { Metric: 'Content published this month', Value: contentCounts.reduce((a, b) => a + b, 0) },
      { Metric: 'Form submissions this month', Value: submissionCounts.reduce((a, b) => a + b, 0) },
      { Metric: 'Cookie-consent events this month', Value: consentRows.length },
      { Metric: 'Admin actions this month', Value: auditRows.length },
      { Metric: 'Total article views (all-time snapshot, not month-scoped)', Value: topArticles.reduce((s, a) => s + (a.views || 0), 0) },
    ]), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      contentTypes.map(([label], i) => ({ 'Content type': label, 'Published this month': contentCounts[i] }))
    ), 'Content Published');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      submissionTypes.map(([label], i) => ({ 'Form': label, 'Submissions this month': submissionCounts[i] }))
    ), 'Form Submissions');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { Response: 'Accepted', Count: consent.accept }, { Response: 'Rejected', Count: consent.reject }, { Response: 'Custom', Count: consent.custom },
    ]), 'Cookie Consent');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      topArticles.map((a) => ({ Title: a.title, Views: a.views || 0 }))
    ), 'Top Articles (all-time)');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      auditRows.map((r) => ({ At: r.at, Action: r.action, 'Content type': r.contentType, Admin: r.adminEmail }))
    ), 'Admin Activity');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    ctx.set('Content-Disposition', `attachment; filename="monthly-report-${tenantKey || 'all'}-${monthLabel}.xlsx"`);
    ctx.body = buf;
  },
};
