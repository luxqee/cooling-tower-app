import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Inert by default: with no Upstash credentials configured (the default —
// no deployment target requires them), checkRateLimit() always returns
// true and this whole module never touches the network. Only becomes
// active once both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are
// set, which is an opt-in per-deployment decision.
let limiter: Ratelimit | null | undefined;

function getLimiter(): Ratelimit | null {
  if (limiter !== undefined) return limiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    limiter = null;
    return limiter;
  }

  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(20, "60 s"),
    prefix: "ratelimit",
  });
  return limiter;
}

/** True if `key` is still within its rate limit (or rate limiting is inert). */
export async function checkRateLimit(key: string): Promise<boolean> {
  const rl = getLimiter();
  if (!rl) return true;

  const { success } = await rl.limit(key);
  return success;
}
