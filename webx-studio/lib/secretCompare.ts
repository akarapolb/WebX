import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Whether `given` is the secret `expected`, without the time taken showing how much of a guess was right (a plain `===`
 * stops at the first wrong character). Both sides are hashed first, so neither the content nor the LENGTH of the secret
 * shows in the timing either, and `timingSafeEqual` always gets two buffers of the same size.
 *
 * A secret that is not set protects nothing, so nothing matches it: an empty or missing `expected` is always false,
 * even for an empty `given`.
 */
export function secretMatches(given: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected) return false;
  const a = createHash("sha256").update(given ?? "").digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
