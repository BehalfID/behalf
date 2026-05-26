import crypto from "crypto";

/**
 * Constant-time string equality check.
 *
 * When the two strings have different byte lengths this function still performs
 * a dummy `timingSafeEqual` call before returning false, so callers cannot
 * infer the length of the expected value by timing how quickly a wrong-length
 * candidate is rejected.
 *
 * All comparisons in this codebase are between SHA-256 hex digests (always
 * 64 chars) so the early-exit path is rarely taken, but the protection is
 * cheap and correct regardless.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    // Perform a dummy comparison of equal-length buffers to prevent
    // length-based timing leaks before returning false.
    crypto.timingSafeEqual(bBuffer, bBuffer);
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}
