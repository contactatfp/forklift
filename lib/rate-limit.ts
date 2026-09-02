const globalForLimit = globalThis as unknown as {
  forkliftRate?: Map<string, number[]>;
};

function buckets(): Map<string, number[]> {
  if (!globalForLimit.forkliftRate) globalForLimit.forkliftRate = new Map();
  return globalForLimit.forkliftRate;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "local";
}

/**
 * Sliding window. Returns seconds until the oldest hit falls out when over
 * the cap, or null if this request is allowed.
 */
export function takeToken(
  request: Request,
  bucket: string,
  limit: number,
  windowMs: number,
): number | null {
  const id = `${bucket}:${clientIp(request)}`;
  const now = Date.now();
  const store = buckets();
  const hits = (store.get(id) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const oldest = hits[0] ?? now;
    store.set(id, hits);
    return Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
  }
  hits.push(now);
  store.set(id, hits);
  return null;
}

export function resetRateLimitsForTests() {
  buckets().clear();
}

export const JOB_LIMIT = 10;
export const JOB_WINDOW_MS = 15 * 60_000;
export const REPLAY_LIMIT = 60;
export const REPLAY_WINDOW_MS = 60_000;
