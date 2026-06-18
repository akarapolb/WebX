import { factories } from '@strapi/strapi';

/**
 * Complaint controller — เพิ่ม endpoint ติดตามสถานะแบบปลอดภัย (ค้นด้วย ref เท่านั้น)
 * ไม่เปิด find/findOne สาธารณะ เพื่อกันข้อมูลร้องเรียนรั่ว (PDPA)
 */
export default factories.createCoreController('api::complaint.complaint', ({ strapi }) => ({
  /**
   * submit — รับเรื่องร้องเรียนพร้อม "แนบไฟล์" (multipart) TOR ภาคผนวก ก ข้อ 13.2
   * อัปโหลดไฟล์ผ่าน upload service แล้วสร้าง complaint (tenant ใส่อัตโนมัติโดย middleware)
   * CAPTCHA ตรวจโดย captcha-guard (path นี้อยู่ใน GUARDED)
   */
  async submit(ctx: any) {
    const body = ctx.request.body || {};
    let data: any = {};
    if (typeof body.data === 'string') { try { data = JSON.parse(body.data); } catch (e) { data = {}; } }
    else if (body.data && typeof body.data === 'object') data = body.data;
    else data = { type: body.type, subject: body.subject, detail: body.detail, anonymous: body.anonymous === 'true' || body.anonymous === true, name: body.name, email: body.email, phone: body.phone, date: body.date };

    const files = ctx.request.files || {};
    const file = files['files.attachment'] || files.attachment || files.file;
    let attachmentId: number | null = null;
    if (file) {
      const f = Array.isArray(file) ? file[0] : file;
      if (f.size && f.size > 5 * 1024 * 1024) { ctx.status = 400; ctx.body = { error: { message: 'ไฟล์เกิน 5MB' } }; return; }
      try {
        const uploaded = await strapi.plugin('upload').service('upload').upload({ data: {}, files: f });
        attachmentId = uploaded?.[0]?.id ?? null;
      } catch (e) { /* อัปโหลดล้มเหลว → บันทึกเรื่องต่อไปโดยไม่มีไฟล์ */ }
    }

    const clean: any = {
      type: data.type, subject: data.subject, detail: data.detail,
      anonymous: !!data.anonymous,
      name: data.anonymous ? '' : data.name, email: data.anonymous ? '' : data.email, phone: data.anonymous ? '' : data.phone,
      date: data.date, stage: 0,
    };
    if (attachmentId) clean.attachment = attachmentId;
    const created = await strapi.documents('api::complaint.complaint').create({ status: 'published', data: clean });
    ctx.body = { data: { ref: (created as any).ref } };
  },

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
