/**
 * เข้ารหัส PII (name/email/phone) ก่อนบันทึก, ถอดรหัสตอนอ่าน — ฟอร์ม
 * ติดต่อสาธารณะ POST ตรงมาที่ Strapi REST API เลย ไม่ผ่านชั้น governance
 * ของ webx-studio จึงต้องเข้ารหัสที่ระดับ Strapi lifecycle นี้โดยตรง
 * (PDPA: encryption at rest — เดิม field เหล่านี้เก็บเป็น plaintext ทั้งหมด,
 * TOR gap audit). ถอดรหัสอัตโนมัติตอนอ่านทำให้ webx-studio's FormsInbox/
 * EntryEditor เห็น plaintext เหมือนเดิมโดยไม่ต้องแก้โค้ดฝั่งนั้นเลย.
 */
import { encryptFields, decryptFields } from '../../../../utils/pii-crypto';

const PII_FIELDS = ['name', 'email', 'phone'];

export default {
  async beforeCreate(event: any) {
    encryptFields(event.params.data, PII_FIELDS);
  },
  async beforeUpdate(event: any) {
    encryptFields(event.params.data, PII_FIELDS);
  },
  async afterCreate(event: any) {
    decryptFields(event.result, PII_FIELDS);
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
