/**
 * เส้นทาง analytics (หลังบ้าน) — สรุปสถิติเว็บไซต์ต่อ tenant
 * auth:false + policy global::admin-only → ต้องส่ง Bearer admin JWT เท่านั้น
 * mount ที่ /api/analytics/summary
 * ข้อมูลฟอร์มถูกนับเป็น "จำนวนรวม" เท่านั้น ไม่เปิดเผยตัวเรคคอร์ด (PDPA)
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/analytics/summary',
      handler: 'analytics.summary',
      config: { auth: false, policies: ['global::admin-only'] },
    },
  ],
};
