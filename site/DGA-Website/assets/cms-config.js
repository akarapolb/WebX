/* =====================================================================
   cms-config.js — ตั้งค่าการเชื่อมต่อ Strapi CMS
   • เว้นว่าง ('')  = ปิด CMS → ใช้ข้อมูลสำรอง (news-data.js / jobs-data.js)
   • ใส่ URL ของ Strapi เพื่อดึงเนื้อหาสด เช่น 'https://cms.dga.or.th'
   • ออโต้: ถ้ารันบน GitHub Codespaces (หน้าบ้านพอร์ต 8080) จะชี้ไป CMS
     พอร์ต 1337 ของ Codespace เดียวกันให้เอง — ไม่ต้องตั้งค่าเอง
   ===================================================================== */
(function () {
  if (window.DGA_CMS_URL) return; // เคารพค่าที่ตั้งไว้ก่อน

  var h = location.hostname;
  // GitHub Codespaces: ...-8080.app.github.dev  →  ...-1337.app.github.dev
  var m = h.match(/^(.*)-8080(\.app\.github\.dev)$/);
  if (m) {
    window.DGA_CMS_URL = location.protocol + '//' + m[1] + '-1337' + m[2];
    return;
  }

  // localhost dev: หน้าบ้าน :8080 → Strapi :1337
  if (h === 'localhost' || h === '127.0.0.1') {
    window.DGA_CMS_URL = 'http://127.0.0.1:1337';
    return;
  }

  // ค่าเริ่มต้น (production ให้ตั้งเป็นโดเมน CMS จริง เช่น 'https://cms.dga.or.th')
  window.DGA_CMS_URL = '';
})();
