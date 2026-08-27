// AES-256-GCM encrypt/decrypt for secrets that must be readable again later
// (a per-tenant Keycloak client secret, a JIT-provisioned shadow Strapi
// password) — unlike totp.ts's one-way HMAC/SHA-256 hashing, these values
// have to come back out. No encryption helper existed anywhere in this
// codebase before SSO needed one.
import "server-only";
import crypto from "crypto";
import { WEBX_ENCRYPTION_KEY } from "./config";

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // 96-bit GCM-standard IV

function keyBuffer(): Buffer {
  if (!WEBX_ENCRYPTION_KEY) throw new Error("WEBX_ENCRYPTION_KEY not configured");
  const buf = Buffer.from(WEBX_ENCRYPTION_KEY, "base64");
  if (buf.length !== 32) throw new Error("WEBX_ENCRYPTION_KEY must decode (base64) to exactly 32 bytes");
  return buf;
}

/** iv.ciphertext.authTag, each base64, dot-joined — one opaque string so
 * callers can store it in a single JSON field. Fresh random IV every call. */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, keyBuffer(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, ct, tag].map((b) => b.toString("base64")).join(".");
}

/** Throws on a malformed payload or a failed auth tag (tampered ciphertext,
 * or the wrong/rotated key) — callers must not swallow this into "treat as
 * empty", since that would silently break a stored credential. */
export function decrypt(payload: string): string {
  const [ivB64, ctB64, tagB64] = String(payload || "").split(".");
  if (!ivB64 || !ctB64 || !tagB64) throw new Error("Malformed encrypted payload");
  const decipher = crypto.createDecipheriv(ALGO, keyBuffer(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
