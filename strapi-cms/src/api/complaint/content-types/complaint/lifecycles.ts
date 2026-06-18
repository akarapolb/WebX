/**
 * สร้างหมายเลขอ้างอิง DGA-CMP-<พ.ศ.>-<6 หลัก> ฝั่งเซิร์ฟเวอร์ + ส่งอีเมลรับเรื่อง
 */
function genRef(): string {
  const be = new Date().getFullYear() + 543;
  const n = 100000 + Math.floor(Math.random() * 899999);
  return `DGA-CMP-${be}-${n}`;
}

export default {
  async beforeCreate(event: any) {
    const { data } = event.params;
    if (!data.ref) data.ref = genRef();
    if (data.stage == null) data.stage = 0;
  },
  async afterCreate(event: any) {
    const { result } = event;
    const email = (strapi as any).plugin('email').service('email');
    // 13.6 แจ้งเตือนผู้ดูแลระบบเมื่อมีเรื่องร้องเรียนใหม่ (ตั้ง COMPLAINT_NOTIFY_EMAIL)
    const notify = process.env.COMPLAINT_NOTIFY_EMAIL;
    if (notify) {
      try {
        await email.send({
          to: notify,
          subject: `[ร้องเรียนใหม่] ${result.ref} — ${result.subject || ''}`,
          text: `มีเรื่องร้องเรียน/แจ้งเบาะแสใหม่\nเลขอ้างอิง: ${result.ref}\nประเภท: ${result.type || '-'}\nหัวข้อ: ${result.subject || '-'}\nผู้แจ้ง: ${result.anonymous ? 'ไม่ประสงค์ออกนาม' : (result.name || '-') + ' / ' + (result.email || '-')}`,
        });
      } catch (e: any) { strapi.log.warn('[complaint] admin notify email not sent: ' + e.message); }
    }
    // 13.5 ตอบรับอัตโนมัติถึงผู้แจ้ง
    if (!result?.email || result?.anonymous) return;
    try {
      await email.send({
        to: result.email,
        subject: `รับเรื่องร้องเรียนแล้ว (${result.ref})`,
        text: `เราได้รับเรื่องร้องเรียนของท่านแล้ว\nหมายเลขอ้างอิง: ${result.ref}\nหัวข้อ: ${result.subject || '-'}\nติดตามสถานะได้ที่หน้า "ติดตามเรื่องร้องเรียน" ของเว็บไซต์`,
      });
    } catch (e: any) {
      strapi.log.warn('[complaint] acknowledgement email not sent (configure SMTP for production): ' + e.message);
    }
  },
};
