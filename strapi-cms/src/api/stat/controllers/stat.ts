/**
 * stat controller — เพิ่มตัวนับสถิติ (เข้าชม/ดาวน์โหลด) แบบสาธารณะ
 * TOR: เก็บสถิติการเปิดอ่าน/เข้าชมอัลบั้ม/ดาวน์โหลด (ข้อ 4.10, 6.9, 7.3, 20.7, 21.5)
 * POST /api/stat { type, documentId } → +1 ที่ฟิลด์ตัวนับของชนิดนั้น (อัปเดตเวอร์ชัน published)
 */
const MAP: Record<string, { uid: string; field: string }> = {
  gallery: { uid: 'api::gallery.gallery', field: 'views' },
  video: { uid: 'api::video.video', field: 'views' },
  download: { uid: 'api::download.download', field: 'downloads' },
  faq: { uid: 'api::faq.faq', field: 'views' },
  article: { uid: 'api::article.article', field: 'views' },
  blog: { uid: 'api::blog.blog', field: 'views' },
  banner: { uid: 'api::banner.banner', field: 'clicks' },
  'banner-view': { uid: 'api::banner.banner', field: 'impressions' },
};

export default {
  async hit(ctx: any) {
    const strapi = (global as any).strapi;
    const body = ctx.request.body || {};
    const m = MAP[body.type];
    if (!m || !body.documentId) { ctx.status = 400; ctx.body = { error: 'bad request' }; return; }
    try {
      const row = await strapi.db.query(m.uid).findOne({
        where: { documentId: body.documentId, publishedAt: { $notNull: true } },
        select: ['id', m.field],
      });
      if (!row) { ctx.status = 404; ctx.body = { error: 'not found' }; return; }
      const next = (row[m.field] || 0) + 1;
      await strapi.db.query(m.uid).update({ where: { id: row.id }, data: { [m.field]: next } });
      ctx.body = { ok: true, count: next };
    } catch (e) {
      ctx.status = 500; ctx.body = { error: 'failed' };
    }
  },
};
