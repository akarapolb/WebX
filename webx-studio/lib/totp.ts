// TOTP (RFC 6238) — ported from strapi-cms/src/utils/totp.ts (same
// algorithm, kept as a straight port rather than an import since the two
// apps are separate deployables that can't share code directly). Used by
// governance.ts's real per-user MFA — unlike strapi-cms's own
// utils/mfa.ts + middlewares/admin-mfa.ts, which gate only direct browser
// navigation to Strapi's native /admin UI with one shared demo secret, this
// is wired into webx-studio's actual login path with a real secret per user.
import "server-only";
import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(s: string): Buffer {
  const clean = String(s).toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = "";
  for (const c of clean) {
    const v = BASE32_ALPHABET.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function base32Encode(buf: Buffer): string {
  let bits = "";
  for (const byte of buf) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  const rem = bits.length % 5;
  if (rem) out += BASE32_ALPHABET[parseInt(bits.slice(bits.length - rem).padEnd(5, "0"), 2)];
  return out;
}

/** A fresh random per-user secret — never reused, never shared (unlike
 * strapi-cms's single demo MFA_SECRET). */
export function generateSecret(): string {
  return base32Encode(crypto.randomBytes(20)); // 160 bits, standard TOTP secret length
}

export function totp(secret: string, t = Date.now(), step = 30, digits = 6): string {
  const key = base32Decode(secret);
  let counter = Math.floor(t / 1000 / step);
  const buf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) { buf[i] = counter & 0xff; counter = Math.floor(counter / 256); }
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (code % Math.pow(10, digits)).toString().padStart(digits, "0");
}

/** Accepts +-1 time step (30s) either side, same tolerance as strapi-cms's
 * own verifyTOTP, to absorb clock drift between server and phone. */
export function verifyTOTP(secret: string, token: string, window = 1): boolean {
  const tok = String(token || "").trim();
  if (!/^\d{6}$/.test(tok)) return false;
  for (let w = -window; w <= window; w++) {
    if (totp(secret, Date.now() + w * 30000) === tok) return true;
  }
  return false;
}

export function otpauthUri(secret: string, label: string, issuer = "WebX Studio"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&period=30&digits=6`;
}

/** 8 recovery codes, 10 chars each (uppercase alphanumeric, unambiguous
 * charset) — shown once at enrollment, same "show once" convention as
 * genPassword.ts's temp passwords. Only their hashes are ever stored. */
export function generateRecoveryCodes(count = 8): string[] {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 — visual ambiguity
  return Array.from({ length: count }, () => {
    let code = "";
    for (let i = 0; i < 10; i++) code += chars[crypto.randomInt(chars.length)];
    return code.slice(0, 5) + "-" + code.slice(5);
  });
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(code.toUpperCase().replace(/-/g, "")).digest("hex");
}
