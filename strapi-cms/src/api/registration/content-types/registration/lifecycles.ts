/**
 * สร้าง username ฝั่งเซิร์ฟเวอร์ (ไม่เก็บรหัสผ่าน) + ส่งอีเมลต้อนรับ
 */
function genUsername(email?: string): string {
  const local = String(email || 'user').split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 16) || 'user';
  const n = 1000 + Math.floor(Math.random() * 9000);
  return `${local}${n}`;
}

export default {
  async beforeCreate(event: any) {
    const { data } = event.params;
    if (!data.username) data.username = genUsername(data.email);
    // กันไม่ให้มีฟิลด์รหัสผ่านหลุดเข้าฐานข้อมูล
    delete data.password;
    delete data.password2;
  },
  async afterCreate(event: any) {
    const { result } = event;
    if (!result?.email) return;
    try {
      await (strapi as any).plugin('email').service('email').send({
        to: result.email,
        subject: `ลงทะเบียนผู้ใช้งานสำเร็จ (${result.username})`,
        text: `ยินดีต้อนรับสู่ระบบของ สพร.\nชื่อผู้ใช้: ${result.username}\nกรุณาเข้าสู่ระบบด้วยรหัสผ่านที่ท่านตั้งไว้`,
      });
    } catch (e: any) {
      strapi.log.warn('[registration] welcome email not sent (configure SMTP for production): ' + e.message);
    }
  },
};
