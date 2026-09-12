/**
 * สร้างหมายเลขอ้างอิง DGA-JOB-<พ.ศ.>-<6 หลัก> ฝั่งเซิร์ฟเวอร์ + ส่งอีเมลยืนยันรับสมัคร
 * + เข้ารหัส PII (name/email/phone) ก่อนบันทึก, ถอดรหัสตอนอ่าน — เดิม field
 * เหล่านี้เก็บเป็น plaintext ทั้งหมด (audit gap, เหมือน complaint's own fix —
 * ดู content-types/complaint/lifecycles.ts's comment สำหรับรายละเอียด)
 */
import { encryptFields, decryptFields } from '../../../../utils/pii-crypto';

const PII_FIELDS = ['name', 'email', 'phone'];

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
    encryptFields(data, PII_FIELDS);
  },
  async beforeUpdate(event: any) {
    encryptFields(event.params.data, PII_FIELDS);
  },
  async afterCreate(event: any) {
    const { result } = event;
    // ถอดรหัสก่อนใช้ result.email ด้านล่าง (ถูกเข้ารหัสไปแล้วตอน beforeCreate)
    decryptFields(result, PII_FIELDS);
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
