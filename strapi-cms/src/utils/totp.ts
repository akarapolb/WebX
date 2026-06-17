/* TOTP (RFC 6238) — ใช้กับ MFA หลังบ้าน เข้ากันได้กับ Google Authenticator/Authy */
import crypto from 'crypto';

function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(s).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = '';
  for (const c of clean) {
    const v = alphabet.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totp(secret: string, t = Date.now(), step = 30, digits = 6): string {
  const key = base32Decode(secret);
  let counter = Math.floor(t / 1000 / step);
  const buf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) { buf[i] = counter & 0xff; counter = Math.floor(counter / 256); }
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (code % Math.pow(10, digits)).toString().padStart(digits, '0');
}

/** ยอมรับ ±1 หน้าต่างเวลา (กันนาฬิกาเหลื่อม) */
export function verifyTOTP(secret: string, token: string, window = 1): boolean {
  const tok = String(token || '').trim();
  if (!/^\d{6}$/.test(tok)) return false;
  for (let w = -window; w <= window; w++) {
    if (totp(secret, Date.now() + w * 30000) === tok) return true;
  }
  return false;
}

export function otpauthUri(secret: string, label = 'admin', issuer = 'WebX-CMS'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&period=30&digits=6`;
}
