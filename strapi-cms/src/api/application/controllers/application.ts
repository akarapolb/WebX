import { factories } from '@strapi/strapi';

/**
 * Application controller — endpoint ตรวจสอบสถานะใบสมัครแบบปลอดภัย (ค้นด้วย ref)
 */
export default factories.createCoreController('api::application.application', ({ strapi }) => ({
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
