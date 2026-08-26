/**
 * เส้นทาง internal (ป้องกันด้วย shared secret ไม่ใช่ Strapi auth) — สำหรับ
 * webx-studio governance layer เท่านั้น mount ที่ /api/internal/*
 */
export default {
  routes: [
    { method: 'GET', path: '/internal/tenant-of', handler: 'internal.tenantOf', config: { auth: false } },
  ],
};
