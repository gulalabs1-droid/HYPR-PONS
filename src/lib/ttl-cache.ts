/**
 * A tiny per-instance cache for public, viewer-independent reads.
 *
 * Every open room polls live status; without coalescing, N viewers turn into
 * N provider calls every few seconds. Concurrent callers share one in-flight
 * request, and a settled value is reused for `ttlMs`. Failures are never
 * cached, so the next caller retries immediately.
 *
 * Never use this for authorization decisions: those must read fresh state.
 */
export function createTtlCache<T>(ttlMs: number, maxEntries = 256) {
  const entries = new Map<string, { value: T; expires: number }>();
  const inflight = new Map<string, Promise<T>>();
  return {
    async get(key: string, load: () => Promise<T>, now = Date.now): Promise<T> {
      const hit = entries.get(key);
      if (hit && hit.expires > now()) return hit.value;
      const pending = inflight.get(key);
      if (pending) return pending;
      const request = load().then((value) => {
        if (entries.size >= maxEntries) entries.delete(entries.keys().next().value as string);
        entries.set(key, { value, expires: now() + ttlMs });
        return value;
      }).finally(() => { inflight.delete(key); });
      inflight.set(key, request);
      return request;
    },
    clear() { entries.clear(); inflight.clear(); },
  };
}
