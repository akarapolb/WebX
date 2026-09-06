/* เข้ารหัส/ถอดรหัส PII (ชื่อ/อีเมล/เบอร์โทร) ของ contact-message และ
   registration ก่อนบันทึกลงฐานข้อมูล (PDPA: encryption at rest) — mirrors
   webx-studio's lib/crypto.ts (AES-256-GCM) แต่เป็น key คนละดวงโดยตั้งใจ
   (PII_ENCRYPTION_KEY ไม่ใช่ webx-studio's WEBX_ENCRYPTION_KEY, และไม่ใช่
   Strapi core's ENCRYPTION_KEY ใน config/admin.ts — คนละโดเมนความปลอดภัย
   ไม่ควรใช้ key ร่วมกัน) ใช้จาก lifecycles.ts ของทั้งสอง content type */
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // 96-bit, มาตรฐาน GCM

function keyBuffer(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) throw new Error('PII_ENCRYPTION_KEY not configured');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('PII_ENCRYPTION_KEY must decode (base64) to exactly 32 bytes');
  return buf;
}

/** iv.ciphertext.authTag แต่ละส่วนเป็น base64 คั่นด้วยจุด — string เดียว
 * เก็บลง field ธรรมดาได้ตรง ๆ. IV สุ่มใหม่ทุกครั้ง */
export function encryptPII(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, keyBuffer(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, ct, tag].map((b) => b.toString('base64')).join('.');
}

/** โยน error เมื่อ payload ผิดรูปแบบหรือ authTag ไม่ผ่าน (ข้อมูลถูกแก้ไข
 * หรือ key ผิด/ถูกหมุนไปแล้ว) — ห้าม catch แล้วคืนค่าว่างเงียบ ๆ */
export function decryptPII(payload: string): string {
  const [ivB64, ctB64, tagB64] = String(payload || '').split('.');
  if (!ivB64 || !ctB64 || !tagB64) throw new Error('Malformed encrypted PII payload');
  const decipher = crypto.createDecipheriv(ALGO, keyBuffer(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

/** true ถ้าค่าหน้าตาเหมือน payload ที่เข้ารหัสด้วยฟังก์ชันนี้แล้ว (3 ส่วน
 * คั่นด้วยจุด, ทุกส่วนเป็น base64) — ใช้กันเข้ารหัสซ้ำ/ถอดรหัสค่าที่ยังเป็น
 * plaintext อยู่ (เช่น แถวเก่าก่อนฟีเจอร์นี้จะถูก deploy) */
export function looksEncrypted(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0 && /^[A-Za-z0-9+/]+=*$/.test(p));
}

/** เข้ารหัสทุก field ใน `fields` ที่มีค่าเป็น string ไม่ว่างใน `data`
 * (ข้าม field ที่เข้ารหัสอยู่แล้ว — กันเข้ารหัสซ้อนตอน update ที่ไม่ได้แก้
 * field นั้น เพราะ afterFindOne ถอดให้แล้วก่อนส่งขึ้น admin UI แต่บาง flow
 * อาจส่ง payload เดิมกลับมาโดยไม่ผ่าน read ก่อน) */
export function encryptFields(data: Record<string, any>, fields: string[]): void {
  for (const f of fields) {
    const v = data[f];
    if (typeof v === 'string' && v && !looksEncrypted(v)) {
      data[f] = encryptPII(v);
    }
  }
}

/** ถอดรหัสทุก field ใน `fields` ของ entity เดียว (in place) — ข้าม field ที่
 * ไม่ได้เข้ารหัสไว้ (null/ค่าว่าง หรือแถวเก่าก่อน feature นี้) แทนที่จะ throw */
export function decryptFields(entity: Record<string, any> | null | undefined, fields: string[]): void {
  if (!entity) return;
  for (const f of fields) {
    const v = entity[f];
    if (looksEncrypted(v)) {
      entity[f] = decryptPII(v);
    }
  }
}
