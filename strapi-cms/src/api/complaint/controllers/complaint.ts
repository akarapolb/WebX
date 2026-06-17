import { factories } from '@strapi/strapi';

/**
 * Complaint controller — เพิ่ม endpoint ติดตามสถานะแบบปลอดภัย (ค้นด้วย ref เท่านั้น)
 * ไม่เปิด find/findOne สาธารณะ เพื่อกันข้อมูลร้องเรียนรั่ว (PDPA)
 */
export default factories.createCoreController('api::complaint.complaint', ({ strapi }) => ({
  async track(ctx) {
    const ref = String(ctx.params.ref || '').trim().toUpperCase();
    if (!ref) return ctx.badRequest('ref is required');
    const rows = await strapi.documents('api::complaint.complaint').findMany({
      filters: { ref },
      fields: ['ref', 'type', 'subject', 'date', 'stage', 'steps'],
      limit: 1,
    });
    const rec = rows && rows[0];
    if (!rec) return ctx.notFound('complaint not found');
    ctx.body = {
      data: {
        ref: rec.ref, type: rec.type, subject: rec.subject,
        date: rec.date, stage: rec.stage, steps: rec.steps,
      },
    };
  },
}));
