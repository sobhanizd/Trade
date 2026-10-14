/**
 * In-memory fixed-window rate limiter. Adequate for a single-instance,
 * single-user deployment. (For multiple instances, back this with Redis/DB.)
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; remaining: number; retryAfterMs: number } {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
  }
  b.count++;
  return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), retryAfterMs: b.count <= limit ? 0 : b.resetAt - now };
}

export function resetRateLimits() {
  buckets.clear();
  failures.clear();
}

/** Failure-only throttling (e.g. logins): successful attempts never consume the budget. */
const failures = new Map<string, { count: number; resetAt: number }>();

export function tooManyFailures(key: string, limit: number, now = Date.now()): boolean {
  const f = failures.get(key);
  if (!f || f.resetAt <= now) return false;
  return f.count >= limit;
}

export function recordFailure(key: string, windowMs: number, now = Date.now()) {
  const f = failures.get(key);
  if (!f || f.resetAt <= now) failures.set(key, { count: 1, resetAt: now + windowMs });
  else f.count++;
}

export function clearFailures(key: string) {
  failures.delete(key);
}

export function resetFailureLimits() {
  failures.clear();
}
