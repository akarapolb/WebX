// Shared temp-password generator for CmsAdapter.auth.create() — one place
// so Strapi and WordPress account creation don't each invent their own
// rule. 16 chars, guarantees at least one of each class so it always
// satisfies Strapi's own rule (8-72 chars, 1 lower/1 upper/1 digit —
// see common-validators.js) and is comfortably strong for WordPress, which
// has no complexity rule of its own.
const LOWER = "abcdefghjkmnpqrstuvwxyz"; // no i/l/o — avoid visual ambiguity when shown once
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGIT = "23456789"; // no 0/1
const SYMBOL = "!@#$%^&*-_+=";
const ALL = LOWER + UPPER + DIGIT + SYMBOL;

function randChar(set: string): string {
  return set[Math.floor(Math.random() * set.length)];
}

export function genTempPassword(length = 16): string {
  const required = [randChar(LOWER), randChar(UPPER), randChar(DIGIT), randChar(SYMBOL)];
  const rest = Array.from({ length: length - required.length }, () => randChar(ALL));
  const chars = [...required, ...rest];
  // Fisher-Yates shuffle so the guaranteed classes aren't always in the same position
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
