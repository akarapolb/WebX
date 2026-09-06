/**
 * สร้าง username ฝั่งเซิร์ฟเวอร์ (ไม่เก็บรหัสผ่าน) + ส่งอีเมลต้อนรับ + เข้ารหัส
 * PII (email/firstname/lastname/phone — ไม่รวม nidMasked ที่ mask แบบ
 * one-way อยู่แล้ว) ก่อนบันทึก, ถอดรหัสตอนอ่าน (PDPA: encryption at rest,
 * TOR gap audit) เดิม field เหล่านี้เก็บเป็น plaintext ทั้งหมด
 */
import { encryptFields, decryptFields } from '../../../../utils/pii-crypto';

const PII_FIELDS = ['email', 'firstname', 'lastname', 'phone'];

function genUsername(email?: string): string {
  const local = String(email || 'user').split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 16) || 'user';
  const n = 1000 + Math.floor(Math.random() * 9000);
  return `${local}${n}`;
}

export default {
  async beforeCreate(event: any) {
    const { data } = event.params;
    // ต้องสร้าง username จากอีเมล plaintext ก่อนเข้ารหัส
    if (!data.username) data.username = genUsername(data.email);
    // กันไม่ให้มีฟิลด์รหัสผ่านหลุดเข้าฐานข้อมูล
    delete data.password;
    delete data.password2;
    encryptFields(data, PII_FIELDS);
  },
  async beforeUpdate(event: any) {
    encryptFields(event.params.data, PII_FIELDS);
  },
  async afterCreate(event: any) {
    decryptFields(event.result, PII_FIELDS);
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
