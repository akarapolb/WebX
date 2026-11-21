/**
 * A visitor's search as it is stored for search analytics: trimmed, single
 * spaces, lower case, at most 100 characters. Returns "" (do not store) for an
 * empty query or one that looks like personal data: an email address, or a
 * number of 9+ digits, with or without spaces/dashes (phone, national ID,
 * account number); runs of 4-digit years such as "2566-2570" are kept.
 */
export function normaliseQuery(q: unknown): string {
  const s = String(q ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 100);
  if (!s) return '';
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(s)) return '';
  for (const run of s.match(/\d+(?:[\s-]\d+)*/g) || []) {
    const groups = run.split(/[\s-]/);
    // 9+ digits (phone, national ID, account) — but not a list/range of years ("2566-2570").
    if (groups.join('').length >= 9 && !groups.every((g) => g.length === 4)) return '';
  }
  return s;
}
