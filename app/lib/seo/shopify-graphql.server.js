// app/lib/seo/shopify-graphql.server.js
// Single entry point for Shopify Admin GraphQL calls from background jobs and
// utility libs. Wraps fetch with:
//   - 15s default timeout via AbortController (configurable)
//   - 3x retry on 429 / 5xx, respecting Retry-After header
//   - exponential backoff (1s, 2s, 4s) capped to 30s
//   - typed errors so callers can branch on .code
//
// Audit P1-12 — previously ~25 fetch sites in lib/seo/* had none of this.
// A single slow Shopify response would stall a background sync indefinitely
// because there was no timeout. 429s were silently retried by Shopify but our
// code didn't honor Retry-After, so we'd hammer right back into the next 429.

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 3;
const SHOPIFY_API_VERSION = "2025-04";

export class ShopifyGraphqlError extends Error {
  constructor(message, { code, status, retryable, attempt } = {}) {
    super(message);
    this.name = "ShopifyGraphqlError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.attempt = attempt;
  }
}

/**
 * Execute a GraphQL query against the Shopify Admin API.
 *
 * @param {Object}   args
 * @param {string}   args.accessToken — offline session access token
 * @param {string}   args.shopDomain  — e.g. "vivimall-ro.myshopify.com"
 * @param {string}   args.query       — GraphQL query string
 * @param {Object}   [args.variables] — optional variables
 * @param {number}   [args.timeoutMs] — per-attempt timeout (default 15s)
 * @param {number}   [args.maxRetries] — max retries on 429/5xx (default 3)
 * @param {string}   [args.apiVersion] — override Shopify API version
 * @returns {Promise<Object>} parsed JSON response body
 * @throws  {ShopifyGraphqlError}
 */
export async function shopifyGraphQL({ accessToken, shopDomain, query, variables, timeoutMs = DEFAULT_TIMEOUT_MS, maxRetries = DEFAULT_MAX_RETRIES, apiVersion = SHOPIFY_API_VERSION }) {
  if (!accessToken) throw new ShopifyGraphqlError("Missing access token", { code: "NO_TOKEN" });
  if (!shopDomain)  throw new ShopifyGraphqlError("Missing shop domain", { code: "NO_SHOP" });

  const url = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;
  let attempt = 0;

  while (true) {
    attempt++;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
        body: JSON.stringify({ query, variables }),
        signal: ac.signal,
      });
      clearTimeout(timer);

      // 429: Shopify rate limit. Respect Retry-After (seconds) if present.
      if (resp.status === 429 && attempt <= maxRetries) {
        const retryAfter = parseInt(resp.headers.get("retry-after") || "", 10);
        const waitMs = retryAfter ? retryAfter * 1000 : Math.min(30_000, 1000 * 2 ** (attempt - 1));
        await sleep(waitMs);
        continue;
      }

      // 5xx: transient server errors. Exponential backoff.
      if (resp.status >= 500 && attempt <= maxRetries) {
        await sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)));
        continue;
      }

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new ShopifyGraphqlError(`Shopify GraphQL ${resp.status}: ${text.slice(0, 200)}`, {
          code: "HTTP_ERROR", status: resp.status, retryable: false, attempt,
        });
      }

      const body = await resp.json();
      if (body.errors?.length) {
        // GraphQL-level errors. We surface but don't retry — they're usually
        // permission / query shape issues, not transient.
        throw new ShopifyGraphqlError(`GraphQL errors: ${body.errors.map(e => e.message).join("; ").slice(0, 200)}`, {
          code: "GRAPHQL_ERROR", status: 200, retryable: false, attempt,
        });
      }
      return body;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof ShopifyGraphqlError) throw err;

      // AbortController timeout
      if (err.name === "AbortError") {
        if (attempt <= maxRetries) {
          await sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)));
          continue;
        }
        throw new ShopifyGraphqlError(`Shopify GraphQL timeout after ${timeoutMs}ms (attempt ${attempt})`, {
          code: "TIMEOUT", retryable: true, attempt,
        });
      }
      // Network error (DNS, connection refused, etc.) — retry
      if (attempt <= maxRetries) {
        await sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)));
        continue;
      }
      throw new ShopifyGraphqlError(`Shopify GraphQL network error: ${err.message}`, {
        code: "NETWORK_ERROR", retryable: true, attempt,
      });
    }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
