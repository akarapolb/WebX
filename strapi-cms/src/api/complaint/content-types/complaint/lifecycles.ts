/**
 * สร้างหมายเลขอ้างอิง DGA-CMP-<พ.ศ.>-<6 หลัก> ฝั่งเซิร์ฟเวอร์ + ส่งอีเมลรับเรื่อง
 * + เข้ารหัส PII (name/email/phone) ก่อนบันทึก, ถอดรหัสตอนอ่าน — เดิม field
 * เหล่านี้เก็บเป็น plaintext ทั้งหมด แม้ complaint เก็บเนื้อหาแจ้งเบาะแส
 * ("whistleblower") ซึ่งอ่อนไหวกว่าฟอร์มทั่วไป (audit gap, พบว่า
 * contact-message/registration มี pattern นี้อยู่แล้วแต่ complaint/
 * application ไม่มี). เหมือน contact-message/content-types/contact-
 * message/lifecycles.ts's ทุกประการ.
 */
import { encryptFields, decryptFields } from '../../../../utils/pii-crypto';

const PII_FIELDS = ['name', 'email', 'phone'];

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
    encryptFields(data, PII_FIELDS);
  },
  async beforeUpdate(event: any) {
    encryptFields(event.params.data, PII_FIELDS);
  },
  async afterCreate(event: any) {
    const { result } = event;
    // ต้องถอดรหัสก่อนใช้ result.name/result.email ด้านล่าง (ถูกเข้ารหัสไปแล้ว
    // ตั้งแต่ beforeCreate ข้างบน) — ลำดับสำคัญ ไม่เหมือน contact-message ที่
    // ไม่มีการอ่านค่า PII หลังบันทึกเลย
    decryptFields(result, PII_FIELDS);
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
  async afterUpdate(event: any) {
    decryptFields(event.result, PII_FIELDS);
  },
  async afterFindOne(event: any) {
    decryptFields(event.result, PII_FIELDS);
  },
  async afterFindMany(event: any) {
    const rows = event.result;
    if (Array.isArray(rows)) rows.forEach((r: any) => decryptFields(r, PII_FIELDS));
  },
};
