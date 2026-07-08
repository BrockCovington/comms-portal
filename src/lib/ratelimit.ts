import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Per-user rate limiting for the message send route, backed by Upstash Redis
// (REST-based — no TCP connection to manage, works the same in Node or Edge
// runtime). Also accepts Vercel KV's env var names, since Vercel KV is
// Upstash-backed and exposes Upstash-compatible REST credentials — either
// provisioning path works without changing this file.
//
// Fails OPEN, not closed: if the env vars aren't set at all (e.g. local dev
// without an Upstash account), rate limiting is skipped entirely rather than
// crashing the app. If Redis *is* configured but a check call throws (a
// network blip), the message still sends rather than blocking the whole
// feature on an availability failure — same "a failed side-effect shouldn't
// block the core action" reasoning already used for Pusher broadcasts in
// this route. This is a spam filter, not a security boundary.
// ---------------------------------------------------------------------------

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

let limiter: Ratelimit | null = null;

if (url && token) {
  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(20, "10 s"),
    prefix: "ratelimit:messages",
  });
} else {
  console.warn(
    "Rate limiting disabled: set UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN " +
      "(or KV_REST_API_URL/KV_REST_API_TOKEN) to enable it. See .env.example."
  );
}

export type RateLimitResult = { ok: true } | { ok: false; reset: number };

export async function checkMessageRateLimit(userId: string): Promise<RateLimitResult> {
  if (!limiter) return { ok: true };

  try {
    const result = await limiter.limit(userId);
    return result.success ? { ok: true } : { ok: false, reset: result.reset };
  } catch (err) {
    console.error("Rate limit check failed, allowing the request through:", err);
    return { ok: true };
  }
}
