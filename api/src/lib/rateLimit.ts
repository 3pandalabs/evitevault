// A fixed-window, in-memory request counter.
//
// Deliberately the small version: this API is a single long-running container
// (see CLAUDE.md, "Background work"), so a process-local Map sees every request
// there is. Nothing here survives a restart, which is fine for its two callers —
// the public contact form and account deletion — where the point is to make a
// flood or a password-guessing loop expensive, not to meter anyone precisely.
//
// Each call to `rateLimiter` gets its own Map, so the contact form's budget and
// account deletion's budget never share a bucket.
export function rateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function allow(key: string, now = Date.now()): boolean {
    // Sweep expired windows opportunistically so the Map cannot grow without
    // bound under a spray of distinct IPs.
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }

    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= max) return false;
    entry.count += 1;
    return true;
  };
}
