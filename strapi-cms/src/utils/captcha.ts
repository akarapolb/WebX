/* CAPTCHA แบบเลขคณิตง่าย ๆ (ออกโจทย์ฝั่งเซิร์ฟเวอร์ เก็บคำตอบ in-memory + TTL) */
import crypto from 'crypto';

export const CAPTCHA_ENABLED = process.env.CAPTCHA_ENABLED === 'true'; // ค่าเริ่มต้น: ปิด (เปิดเมื่อ wire ฟอร์มครบ)
const store = new Map<string, { a: number; exp: number }>();
const TTL = 5 * 60 * 1000;

export function issueCaptcha(): { id: string; question: string } {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const id = crypto.randomBytes(9).toString('hex');
  store.set(id, { a: a + b, exp: Date.now() + TTL });
  if (store.size > 5000) for (const [k, v] of store) if (v.exp < Date.now()) store.delete(k);
  return { id, question: `${a} + ${b} = ?` };
}

export function verifyCaptcha(id: any, answer: any): boolean {
  const rec = store.get(String(id));
  if (!rec) return false;
  store.delete(String(id)); // ใช้ครั้งเดียว
  if (rec.exp < Date.now()) return false;
  return Number(answer) === rec.a;
}
