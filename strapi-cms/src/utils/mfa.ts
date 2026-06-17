/* การตั้งค่า MFA หลังบ้าน + cookie ของ gate (ลงนามด้วย HMAC) */
import crypto from 'crypto';

export const MFA_ENABLED = process.env.MFA_ENABLED !== 'false';          // ค่าเริ่มต้น: เปิด
export const MFA_SECRET = process.env.MFA_SECRET || 'JBSWY3DPEHPK3PXP';  // เดโม — เปลี่ยนใน .env (base32)
const COOKIE_SECRET = process.env.MFA_COOKIE_SECRET || process.env.ADMIN_JWT_SECRET || 'dga-mfa-cookie-secret';
export const COOKIE_NAME = 'dga_mfa';

export function signCookie(exp: number): string {
  const sig = crypto.createHmac('sha256', COOKIE_SECRET).update(String(exp)).digest('hex').slice(0, 32);
  return exp + '.' + sig;
}
export function verifyCookie(v?: string): boolean {
  if (!v) return false;
  const parts = String(v).split('.');
  const exp = Number(parts[0]);
  if (!exp || exp < Date.now()) return false;
  const good = crypto.createHmac('sha256', COOKIE_SECRET).update(parts[0]).digest('hex').slice(0, 32);
  return parts[1] === good;
}
