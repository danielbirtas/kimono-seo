// app/lib/log.server.js
// Lightweight structured logger so log triage is grep-friendly.
// Every line carries: [TAG] shopDomain (or "-") message  optional-ctx-json
//
// Audit P2-3 — previously ~150 console.error/warn calls across lib/seo/*
// without consistent prefixing or shop context. Tail-and-grep was unreliable.
// Adopt this in new code; refactor existing console.* incrementally when
// touching a file for another reason.

function format(tag, shop, msg, ctx) {
  const prefix = `[${tag}] ${shop || "-"}`;
  if (ctx && Object.keys(ctx).length > 0) {
    try { return `${prefix} ${msg} ${JSON.stringify(ctx)}`; }
    catch { return `${prefix} ${msg}`; }
  }
  return `${prefix} ${msg}`;
}

const throttleState = new Map();
const DEFAULT_WINDOW_MS = 60_000;

export const log = {
  info:  (tag, shop, msg, ctx) => console.log  (format(tag, shop, msg, ctx)),
  warn:  (tag, shop, msg, ctx) => console.warn (format(tag, shop, msg, ctx)),
  error: (tag, shop, msg, ctx) => console.error(format(tag, shop, msg, ctx)),

  infoThrottled: (tag, shop, msg, ctx, windowMs = DEFAULT_WINDOW_MS) => {
    const key   = `${tag}|${shop || "-"}`;
    const now   = Date.now();
    const state = throttleState.get(key);
    if (!state || now >= state.nextAt) {
      const suppressed = state?.dropped || 0;
      const enriched   = suppressed > 0 ? { ...(ctx || {}), suppressedInWindow: suppressed } : ctx;
      console.log(format(tag, shop, msg, enriched));
      throttleState.set(key, { nextAt: now + windowMs, dropped: 0 });
    } else {
      state.dropped++;
    }
  },
};
