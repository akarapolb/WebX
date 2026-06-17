/**
 * สร้างหมายเลขอ้างอิง DGA-JOB-<พ.ศ.>-<6 หลัก> ฝั่งเซิร์ฟเวอร์ + ส่งอีเมลยืนยันรับสมัคร
 */
function genRef(): string {
  const be = new Date().getFullYear() + 543;
  const n = 100000 + Math.floor(Math.random() * 899999);
  return `DGA-JOB-${be}-${n}`;
}

export default {
  async beforeCreate(event: any) {
    const { data } = event.params;
    if (!data.ref) data.ref = genRef();
    if (data.stage == null) data.stage = 0;
  },
  async afterCreate(event: any) {
    const { result } = event;
    if (!result?.email) return;
    try {
      await (strapi as any).plugin('email').service('email').send({
        to: result.email,
        subject: `รับใบสมัครงานแล้ว (${result.ref})`,
        text: `ขอบคุณที่สมัครงานกับ สพร.\nหมายเลขอ้างอิง: ${result.ref}\nตำแหน่ง: ${result.position || '-'}\nตรวจสอบสถานะได้ที่หน้า "ตรวจสอบสถานะใบสมัคร" ของเว็บไซต์`,
      });
    } catch (e: any) {
      strapi.log.warn('[application] confirmation email not sent (configure SMTP for production): ' + e.message);
    }
  },
};
