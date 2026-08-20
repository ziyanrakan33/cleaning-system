/**
 * §SEC-08 — a minimal in-process rate limiter for expensive/abusable
 * endpoints (file uploads, plan generation) that have no permission tight
 * enough to rule out repeated calls by design (e.g. plan generation is
 * granted to several roles, not just admins).
 *
 * Deliberately not backed by Redis/a shared store — this app runs as a
 * single instance today. A per-instance limiter means the ceiling is
 * per-instance too; see docs/EXTERNAL_INTEGRATIONS.md §4 for what a
 * multi-instance deployment would need instead. Good enough to stop a single
 * runaway client, not meant as a DoS-hardened defense.
 */

const buckets = new Map<string, number[]>();

/**
 * Returns true if `key` (e.g. `"plan-generate:${userId}"`) has made fewer
 * than `limit` calls in the trailing `windowMs`, recording this call if so.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) {
    buckets.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  buckets.set(key, timestamps);
  return true;
}
