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
    let externalAnalytics: any = null;
    if (tenantId) {
      const t = await strapi.db.query('api::tenant.tenant')
        .findOne({ where: { id: tenantId }, select: ['key', 'name', 'analytics'] }).catch(() => null);
      externalAnalytics = t?.analytics || null;
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
};
