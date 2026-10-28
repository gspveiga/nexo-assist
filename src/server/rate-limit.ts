import { ServiceError } from "./services/errors.ts";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastPrunedAt = 0;

export function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || "local";
}

export function assertRateLimit(
  scope: string,
  subject: string,
  limit: number,
  windowMs = 60_000,
  now = Date.now(),
): void {
  if (now - lastPrunedAt > 60_000) {
    lastPrunedAt = now;
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  const key = `${scope}:${subject}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (current.count >= limit) {
    throw new ServiceError(
      "Muitas solicitações em sequência. Aguarde alguns instantes e tente novamente.",
      429,
      "RATE_LIMITED",
    );
  }

  current.count += 1;
}

export function resetRateLimits(): void {
  buckets.clear();
}

