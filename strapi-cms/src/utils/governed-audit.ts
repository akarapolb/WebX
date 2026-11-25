import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Compare two secrets without the time taken showing how much of the guess was right. Both sides are hashed first, so
 * neither the content nor the length of the secret shows either.
 */
export function sameSecret(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Whether this write was already audited by WebX Studio, so that Strapi's own backstop audit row (src/index.ts) would be
 * a second row for one action.
 *
 * Studio writes its audit row itself and says so with `X-WebX-Governed: 1`. That header alone proves nothing: anyone
 * with a Strapi login can send it, and then their writes to Strapi left no audit row at all, which is exactly the
 * writes the backstop exists for (the ones that did not go through Studio). So the claim only counts when the request
 * also carries the internal secret (`X-Internal-Secret`, the same WEBX_INTERNAL_SECRET Studio already sends on every
 * call it makes here), which only Studio and the other servers of the deployment hold.
 *
 * Without WEBX_INTERNAL_SECRET set the claim cannot be checked, so it is not believed: the backstop row is written.
 * That can mean two rows for one action in a deployment that never configured the secret; a missing row is the worse
 * of the two.
 */
export function auditedByWebx(governedHeader: string, secretHeader: string, expectedSecret: string | undefined): boolean {
  if (governedHeader !== '1') return false;
  if (!expectedSecret) return false;
  return sameSecret(secretHeader, expectedSecret);
}
