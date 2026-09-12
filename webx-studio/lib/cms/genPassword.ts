// Shared temp-password generator for CmsAdapter.auth.create() — one place
// so Strapi and WordPress account creation don't each invent their own
// rule. 16 chars, guarantees at least one of each class so it always
// satisfies Strapi's own rule (8-72 chars, 1 lower/1 upper/1 digit —
// see common-validators.js) and is comfortably strong for WordPress, which
// has no complexity rule of its own.
//
// This is a REAL, standing credential, not a display-only placeholder — it
// becomes the actual login for every admin-created account, and (via
// selfServeSignup/ssoLogin) the never-seen-by-a-human password behind every
// SSO JIT-provisioned shadow Strapi admin account. Used to be generated with
// Math.random(), which is not cryptographically secure — found in a
// full-codebase audit (2026-09-12); contrast lib/totp.ts's own recovery-code
// generator in the same codebase, which already used crypto.randomInt
// correctly. Switched to crypto.randomInt throughout.
import { randomInt } from "crypto";

const LOWER = "abcdefghjkmnpqrstuvwxyz"; // no i/l/o — avoid visual ambiguity when shown once
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGIT = "23456789"; // no 0/1
const SYMBOL = "!@#$%^&*-_+=";
const ALL = LOWER + UPPER + DIGIT + SYMBOL;

function randChar(set: string): string {
  return set[randomInt(set.length)];
}

export function genTempPassword(length = 16): string {
  const required = [randChar(LOWER), randChar(UPPER), randChar(DIGIT), randChar(SYMBOL)];
  const rest = Array.from({ length: length - required.length }, () => randChar(ALL));
  const chars = [...required, ...rest];
  // Fisher-Yates shuffle so the guaranteed classes aren't always in the same position
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
