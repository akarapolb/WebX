import { factories } from '@strapi/strapi';

/**
 * Application controller — endpoint ตรวจสอบสถานะใบสมัครแบบปลอดภัย (ค้นด้วย ref)
 */
export default factories.createCoreController('api::application.application', ({ strapi }) => ({
  /**
   * submit — รับใบสมัครงานพร้อมแนบไฟล์ Resume (multipart) TOR ภาคผนวก ก ข้อ 17.5
   */
  async submit(ctx: any) {
    const body = ctx.request.body || {};
    let data: any = {};
    if (typeof body.data === 'string') { try { data = JSON.parse(body.data); } catch (e) { data = {}; } }
    else if (body.data && typeof body.data === 'object') data = body.data;
    else data = { jobId: body.jobId, position: body.position, name: body.name, email: body.email, phone: body.phone, note: body.note };

    const files = ctx.request.files || {};
    const file = files['files.resume'] || files.resume || files.file;
    let resumeId: number | null = null;
    if (file) {
      const f = Array.isArray(file) ? file[0] : file;
      if (f.size && f.size > 5 * 1024 * 1024) { ctx.status = 400; ctx.body = { error: { message: 'ไฟล์เกิน 5MB' } }; return; }
      try {
        const uploaded = await strapi.plugin('upload').service('upload').upload({ data: {}, files: f });
        resumeId = uploaded?.[0]?.id ?? null;
      } catch (e) { /* noop */ }
    }
    const clean: any = { jobId: data.jobId, position: data.position, name: data.name, email: data.email, phone: data.phone, note: data.note, stage: 0 };
    if (resumeId) clean.resume = resumeId;
    const created = await strapi.documents('api::application.application').create({ status: 'published', data: clean });
    ctx.body = { data: { ref: (created as any).ref } };
  },

  async track(ctx) {
    const ref = String(ctx.params.ref || '').trim().toUpperCase();
    if (!ref) return ctx.badRequest('ref is required');
    const rows = await strapi.documents('api::application.application').findMany({
      filters: { ref },
      fields: ['ref', 'jobId', 'position', 'date', 'stage'],
      limit: 1,
    });
    const rec = rows && rows[0];
    if (!rec) return ctx.notFound('application not found');
    ctx.body = {
      data: { ref: rec.ref, jobId: rec.jobId, position: rec.position, date: rec.date, stage: rec.stage },
    };
  },
}));
