// app/lib/anthropic.server.js
// Universal wrapper for Anthropic API calls with 429/5xx retry logic.
// Respects Retry-After header (capped at 60s), exponential backoff otherwise.
//
// Usage:
//   import { anthropicMessage } from "~/lib/anthropic.server.js";
//   const resp = await anthropicMessage({ model, max_tokens, system, messages });
//   // resp = { content: "text...", raw: <full response JSON>, usage }

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const MAX_RETRIES = 4;
const MAX_BACKOFF_MS = 60_000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfter(resp) {
  const h = resp.headers.get("retry-after");
  if (!h) return null;
  const seconds = Number(h);
  if (!Number.isNaN(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_BACKOFF_MS);
  const date = Date.parse(h);
  if (!Number.isNaN(date)) return Math.min(Math.max(0, date - Date.now()), MAX_BACKOFF_MS);
  return null;
}

export async function anthropicFetch(body, { apiKey, signal } = {}) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");

  let attempt = 0;
  while (true) {
    let resp;
    try {
      resp = await fetch(ENDPOINT, {
        method:  "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body:    JSON.stringify(body),
        signal,
      });
    } catch (netErr) {
      if (attempt >= MAX_RETRIES) throw netErr;
      const delay = Math.min(500 * 2 ** attempt, MAX_BACKOFF_MS);
      console.warn(`[anthropic] network err attempt=${attempt + 1} delay=${delay}ms msg=${netErr.message}`);
      await sleep(delay);
      attempt++;
      continue;
    }

    if (resp.ok) return resp;

    // Transient: 429, 500, 502, 503, 504, 529
    if ([429, 500, 502, 503, 504, 529].includes(resp.status) && attempt < MAX_RETRIES) {
      const retryAfter = parseRetryAfter(resp);
      const backoff = retryAfter ?? Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
      const errText = await resp.text().catch(() => "");
      console.warn(`[anthropic] ${resp.status} attempt=${attempt + 1} delay=${backoff}ms body=${errText.slice(0, 200)}`);
      await sleep(backoff);
      attempt++;
      continue;
    }

    // Non-transient: throw with body for caller diagnostics
    const errText = await resp.text().catch(() => "");
    const err = new Error(`Anthropic ${resp.status}: ${errText.slice(0, 500)}`);
    err.status = resp.status;
    err.body = errText;
    throw err;
  }
}

export async function anthropicMessage(body, opts = {}) {
  const resp = await anthropicFetch(body, opts);
  const json = await resp.json();
  const text = json?.content?.[0]?.text || "";
  return { content: text, raw: json, usage: json?.usage };
}
