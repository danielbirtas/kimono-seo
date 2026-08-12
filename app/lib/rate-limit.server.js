// app/lib/rate-limit.server.js
// In-memory sliding-window rate limiter per key.
// NOTE: per-worker state (cluster mode). For shared counters across workers,
// migrate to Redis in Faza 3.

const buckets = new Map();

function getIp(request) {
  const h = request.headers;
  const xff = h.get("x-forwarded-for") || "";
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip") || h.get("cf-connecting-ip") || "unknown";
}

/**
 * Check rate limit. Returns { ok: true } if allowed, or throws Response 429.
 * @param {Request} request
 * @param {Object} opts
 * @param {string} opts.key        Scope name (e.g. "login"). Combined with IP.
 * @param {number} opts.windowMs   Sliding window duration in ms.
 * @param {number} opts.max        Max requests per window per key+IP.
 */
export function rateLimit(request, { key, windowMs, max }) {
  const ip = getIp(request);
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  let arr = buckets.get(bucketKey);
  if (!arr) {
    arr = [];
    buckets.set(bucketKey, arr);
  }
  // Drop timestamps outside window
  while (arr.length > 0 && arr[0] < windowStart) arr.shift();

  if (arr.length >= max) {
    const retryAfter = Math.ceil((arr[0] + windowMs - now) / 1000);
    throw new Response(
      JSON.stringify({ error: `Prea multe cereri. Încearcă din nou în ${retryAfter} secunde.` }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.max(1, retryAfter)),
        },
      }
    );
  }

  arr.push(now);
  return { ok: true, remaining: max - arr.length };
}

// Periodic cleanup — drop empty buckets to prevent memory leak.
// Only schedule in non-test env to avoid jest timer leaks.
if (process.env.NODE_ENV !== "test") {
  setInterval(() => {
    const now = Date.now();
    // Conservative: remove any bucket whose last entry is older than 1h.
    for (const [k, arr] of buckets.entries()) {
      if (arr.length === 0 || arr[arr.length - 1] < now - 3600_000) buckets.delete(k);
    }
  }, 300_000).unref?.();
}
