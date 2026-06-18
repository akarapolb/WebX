/**
 * เส้นทาง stat (สาธารณะ) — เพิ่มตัวนับสถิติเข้าชม/ดาวน์โหลด
 * mount ที่ /api/stat
 */
export default {
  routes: [
    { method: 'POST', path: '/stat', handler: 'stat.hit', config: { auth: false } },
  ],
};
