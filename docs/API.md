# API & Route Reference

HTTP endpoint reference for Kimono SEO. This app is built on **React Router v7 (framework mode, SSR)**, so most routes are file-based `loader`/`action` handlers under [`app/routes`](../app/routes):

- **`loader`** handles **GET** (reads / data fetch).
- **`action`** handles **POST** (and other mutating methods).

A route may export both, in which case it responds to GET *and* POST. Resource routes (`api.*.js`) return JSON via `Response.json(...)`. UI routes (`app.*.jsx`, `login.jsx`, etc.) return HTML.

See also: [README](../README.md) · [Installation](./INSTALLATION.md) · [Configuration](./CONFIGURATION.md) · [Architecture](./ARCHITECTURE.md) · [Contributing](../CONTRIBUTING.md)

> All example values (secrets, domains, tokens) are placeholders. Replace `example.com`, `sk-ant-xxxx`, `changeme`, etc. with your own. Response shapes marked *(representative)* are illustrative of the fields the code returns — treat exact wire formats as subject to change.

---

## Authentication models

There are four distinct ways routes are protected. Every endpoint table below states which applies.

| Auth model | How it works | Where enforced |
|---|---|---|
| **public** | No auth. Anyone can call. | — |
| **session (`requireAuth`)** | Reads the `kimono_session` cookie, validates the DB-backed `UserSession`, loads the user + active `StoreConnection`, and resolves a `Store`. Returns `{ user, connection, store, storeId }`. Throws `redirect('/login')` if no valid session; API routes return `400` JSON if there is no active store. | [`app/lib/auth/middleware.server.js`](../app/lib/auth/middleware.server.js) |
| **`requireGuest`** | Inverse of the above — redirects to `/app` if a session already exists. Used on login/register loaders. | same |
| **`CRON_SECRET`** | Machine endpoints compare a shared secret against the `X-Cron-Secret` request header (some also accept a `?s=` query param). All reject on a **mismatched** secret (`401`). Four routes are fully fail-closed on an *unset* secret too (`api.cleanup`, `api.ai-citations.runner`, `api.pinterest.scheduled-runner`, `api.seo.cron.monitor`); the other four (`api.seo.job-runner`, `api.seo.kick`, `api.seo.reconcile`, `api.seo.audit-resume`) compare `header \|\| ''` against `CRON_SECRET \|\| ''`, so with `CRON_SECRET` **unset** an empty/absent secret passes — always set a strong `CRON_SECRET` (see Security note below). | per route |
| **HMAC / state (OAuth)** | Shopify OAuth callback verifies a CSRF `state` cookie and optional `HMAC-SHA256` (using `SHOPIFY_CLIENT_SECRET`). | [`api.shopify-oauth.callback.jsx`](../app/routes/api.shopify-oauth.callback.jsx) |
| **per-store URL secret** | Product webhooks verify a per-store secret passed as `?s=` (constant-time compare) against `SeoSetting.webhook_secret` + the `x-shopify-shop-domain` header. This is **not** Shopify's standard HMAC webhook verification. | [`app/lib/webhook-verify.server.js`](../app/lib/webhook-verify.server.js) |

> There is **no** role/plan check inside individual `api.*` routes beyond `requireAuth`. Plan/feature gating is applied once, at the `app.jsx` layout loader (`gateCurrentRoute`), which governs the authenticated **UI** pages — not the raw API endpoints. See [Security notes](#security-notes).

---

## Auth & account

Public flows in [`login.jsx`](../app/routes/login.jsx), [`register.jsx`](../app/routes/register.jsx), [`reset.jsx`](../app/routes/reset.jsx), [`reset_.$token.jsx`](../app/routes/reset_.$token.jsx), [`verify_.$token.jsx`](../app/routes/verify_.$token.jsx), [`resend.jsx`](../app/routes/resend.jsx), [`logout.jsx`](../app/routes/logout.jsx). Forms submit `application/x-www-form-urlencoded`.

| Method | Path | Purpose | Key params | Auth |
|---|---|---|---|---|
| GET / POST | `/login` | Login form + authenticate. On success creates a DB session and sets `kimono_session` cookie, redirects `/app`. | `email`, `password` | GET: `requireGuest`. POST: public, **rate-limited (login: 10/60s)**, rejects unverified accounts |
| GET / POST | `/register` | Create account, issue email-verification token, send verify email. | `email`, `password`, `name` | GET: `requireGuest`. POST: public, **rate-limited (register: 5/60s)** |
| GET | `/verify/:token` | Confirm email — sets `emailVerified=true`, clears `verifyToken`. | path `:token` | public (token possession is the credential) |
| GET / POST | `/reset` | Request a password-reset link; sets `resetToken` (+1h expiry), emails link. Neutral response (no user enumeration). | `email` | public, **rate-limited (reset: 3/60s)** |
| GET / POST | `/reset/:token` | Validate reset token, set new password, clear token. | path `:token`, `password` | public (token+expiry is the credential; not rate-limited) |
| GET / POST | `/resend` | Resend verification email for unverified accounts; regenerates `verifyToken`. Neutral response. | `email` | public, **rate-limited (resend: 3/60s)** |
| GET / POST | `/logout` | Destroy the DB session, clear cookie, redirect `/login`. | — | public (deletes the `UserSession` matching the cookie) |
| GET / POST | `/auth/*` (`auth.$`) | Legacy Shopify auth catch-all; redirects everything to `/login`. | — | public (redirect only) |

The authenticated shell:

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/app` and all `/app/*` | Authenticated UI shell; single enforcement point for module plan-gating. | `requireAuth` **then** `gateCurrentRoute(...)` (may redirect to `/app/billing`) |

> `/app/billing` is referenced by the plan gate but has **no route file** — a blocked module currently redirects to a 404. There is no payment processor wired into this app; plans are a feature catalog only. See [CONFIGURATION](./CONFIGURATION.md).

---

## Store connection & Shopify OAuth

Routes: [`connect-store.jsx`](../app/routes/connect-store.jsx), [`api.shopify-oauth.install.jsx`](../app/routes/api.shopify-oauth.install.jsx), [`api.shopify-oauth.callback.jsx`](../app/routes/api.shopify-oauth.callback.jsx).

| Method | Path | Purpose | Key params | Auth |
|---|---|---|---|---|
| GET / POST | `/connect-store` | List/manage `StoreConnection`s; connect Shopify (manual token) or WooCommerce; disconnect; set-active. Also consumes the `shopify_pending` cookie to link a store after OAuth. | intent + connection fields | `requireAuth` |
| GET | `/api/shopify-oauth/install` | Start Shopify OAuth: build the authorize URL, set a random CSRF `state` cookie (5-min), redirect to Shopify. | `?shop=your-store.myshopify.com` (**required**) | public; relies on random `state` cookie for CSRF |
| GET | `/api/shopify-oauth/callback` | OAuth callback: verify `state` cookie + optional HMAC, exchange `code` for a permanent access token, test it, upsert `StoreConnection`/`Store`, register product webhooks (if logged in) or stash a `shopify_pending` cookie for post-login linking. | `?shop`, `?code`, `?state`, `?hmac` | CSRF `state`-cookie check + optional HMAC-SHA256 (`SHOPIFY_CLIENT_SECRET`); attempts `requireAuth` to attach `userId`, falls back to pending-cookie flow |

> The install/callback redirect URI is derived from `APP_URL` (`${APP_URL}/api/shopify-oauth/callback`); only the OAuth **scopes** are hardcoded. Set `APP_URL` to your own domain and register that callback URL as an Allowed redirection URL in the Shopify app, e.g. `https://app.example.com/api/shopify-oauth/callback`.

### OAuth callbacks for external providers

These are Google/Bing/Pinterest OAuth redirect targets. State carries the target `shopDomain`.

| Method | Path | Route file | Auth |
|---|---|---|---|
| GET | `/gsc-callback` | [`gsc-callback.jsx`](../app/routes/gsc-callback.jsx) | Google auth code + base64 `shopDomain` state |
| GET | `/ga4-callback` | [`ga4-callback.jsx`](../app/routes/ga4-callback.jsx) | Google auth code + base64url `shopDomain` state |
| GET | `/bing-callback` | referenced by Bing OAuth helper (`getRedirectUri()`) — **no matching route file** in this checkout | signed state via `oauth-state.server.js` |
| GET | `/pinterest-callback` | referenced by Pinterest OAuth helper — **no matching route file** in this checkout | signed state via `oauth-state.server.js` |

> The Bing/Pinterest callback route files are referenced by the OAuth helpers but were not present in the audited checkout. If you enable those integrations you may need to add the corresponding routes. See [CONFIGURATION](./CONFIGURATION.md).

---

## SEO engine & pipeline API

Core pipeline routes under `api.seo.*`. Unless noted, all are **`requireAuth`** and operate on the caller's active `storeId`. POST bodies are JSON. Full list in the [SEO engine](#seo-engine--pipeline-api) analysis.

| Method | Path | Purpose | Key params | Auth |
|---|---|---|---|---|
| POST | `/api/seo/status` | Product/keyword/tag counts + live Shopify product count. | — | `requireAuth` |
| POST | `/api/seo/scan` | Paginated Shopify product scan → upsert `SeoProduct`. | `{ cursor, isFirst }` | `requireAuth` |
| POST | `/api/seo/sync` | Layer-1 product sync (GraphQL) → `SeoProduct` + `SeoSyncLog`. | `{ isFirst, cursor }` | `requireAuth` |
| POST | `/api/seo/reset` | Reset SEO data. `what=tags` clears tags; else deletes `SeoProduct`+`SeoKeyword`. | `{ what }` | `requireAuth` |
| POST | `/api/seo/enrich` | `phase=extract` (Claude candidate extraction) or `phase=enrich` (DataForSEO). | `{ phase }` | `requireAuth` |
| POST | `/api/seo/tag` | AI-tag products (Claude) and push tags to Shopify. | — | `requireAuth` |
| POST | `/api/seo/taxonomy` | Generate taxonomy proposals (Claude). | `{ isFirst }` | `requireAuth` |
| POST | `/api/seo/proposals` | Manage taxonomy proposals: `approve` / `reject` / `approve_all` / `apply`. `apply` creates Shopify smart collections + tags for APPROVED proposals. | `{ intent, proposalId, proposalIds }` | `requireAuth` |
| POST | `/api/seo/categories` | Create automated Shopify collections from keywords. | — | `requireAuth` |
| GET / POST | `/api/seo/keywords` | Keyword research (DataForSEO with Claude fallback). Loader intents: `top_keywords` / `top_product_keywords` / `fallback_keywords`. | GET `?intent&limit`; POST `{ isFirst, tag }` | `requireAuth` |
| GET / POST | `/api/seo/job-status` | GET current job status for active store; POST queues a job or cancels. See [example](#queue-a-background-job). | POST `{ intent: sync\|extract\|enrich\|taxonomy\|cancel }` | `requireAuth` |
| POST | `/api/schema/generate` | Product JSON-LD schema `preview` / `apply_one` / `apply_batch`; writes `SeoSchema` + Shopify metafields. | `{ intent, productId, productIds }` | `requireAuth` |
| GET | `/api/dashboard` | Dashboard aggregate stats + setup checks (which API keys / connections are present). | — | `requireAuth` |
| GET / POST | `/api/paa/batch` | People-Also-Ask batch job `start` / `status` (creates a `PAA_BATCH` `SeoJob`). | `{ intent }` | `requireAuth` |

### Background job runner (self-triggering)

The pipeline runs as `SeoJob` rows processed by a self-re-triggering runner. The runner and orchestrator are **machine endpoints protected by `CRON_SECRET`** — see [Cron / runner endpoints](#cron--runner-endpoints).

`POST /api/seo/job-status` creates a `SeoJob` (QUEUED), caps at **2 active jobs per store**, then fires `GET /api/seo/job-runner` internally with the `X-Cron-Secret` header. The runner claims one job via `FOR UPDATE SKIP LOCKED`, processes one batch, and re-triggers itself until done.

#### Queue a background job

```bash
curl -X POST https://app.example.com/api/seo/job-status \
  -H 'Content-Type: application/json' \
  -H 'Cookie: kimono_session=<your-session-cookie>' \
  -d '{"intent":"sync"}'
```

Example response *(representative — actual fields from `api.seo.job-status.js`)*:

```json
{ "success": true, "jobId": "clw...", "type": "SYNC" }
```

Cancel path returns `{ "success": true }`; hitting the per-store cap returns HTTP `429` with `{ "success": false, "error": "..." }`.

`GET /api/seo/job-status` returns the active or last-done job:

```json
{
  "job": {
    "id": "clw...", "type": "SYNC", "status": "RUNNING",
    "totalItems": 240, "processedItems": 100, "progressPct": 41,
    "statusMessage": "…", "errorMessage": null
  },
  "lastDone": null
}
```

---

## External SEO data providers

### Google Search Console

Routes: [`api.gsc.data.js`](../app/routes/api.gsc.data.js), [`api.gsc.triage.js`](../app/routes/api.gsc.triage.js).

| Method | Path | Purpose | Key params | Auth |
|---|---|---|---|---|
| GET / POST | `/api/gsc/data` | Search Analytics (queries/pages/trend); POST `set_site` / `disconnect` / `list_sites`. | GET `?view&days`; POST `{ intent, siteUrl }` | `requireAuth` |
| POST | `/api/gsc/triage` | GSC keyword triage `run` / `results` → `GscTriageResult` (AUDIT/BLOG/MONITOR). | `{ intent, action }` | `requireAuth` |

### Google Analytics 4

Routes: [`api.ga4.js`](../app/routes/api.ga4.js), [`api.ga4.save-property.js`](../app/routes/api.ga4.save-property.js).

| Method | Path | Purpose | Key params | Auth |
|---|---|---|---|---|
| GET / POST | `/api/ga4` | GA4 AI-referrer traffic; POST `fetch_data` / `disconnect`. Returns an OAuth `authUrl` when not connected. | GET `?days`; POST `{ intent, days }` | `requireAuth` |
| POST | `/api/ga4/save-property` | Persist the chosen GA4 property to `SeoSetting`. Called by the OAuth-callback property picker. | `{ propertyId, propertyName, storeId }` | ⚠️ **NONE** — trusts `storeId` from the request body. See [Security notes](#security-notes). |

### Core Web Vitals, crawl budget, robots, Bing

Routes: [`api.cwv.js`](../app/routes/api.cwv.js), [`api.crawl-budget.js`](../app/routes/api.crawl-budget.js), [`api.robots.js`](../app/routes/api.robots.js), [`api.bing-ai.js`](../app/routes/api.bing-ai.js).

| Method | Path | Purpose | Key params | Auth |
|---|---|---|---|---|
| GET / POST | `/api/cwv` | Core Web Vitals audit via PageSpeed Insights (`PAGESPEED_API_KEY`, works keyless but rate-limited). | `{ intent }` | `requireAuth` |
| GET / POST | `/api/crawl-budget` | Crawl-budget audit; `apply_robots` writes rules. | `{ intent, rules }` | `requireAuth` |
| GET / POST | `/api/robots` | Robots.txt AI-crawler audit. | `{ intent }` | `requireAuth` |
| GET / POST | `/api/bing-ai` | Bing AI performance panel; `save_settings` / `fetch` (per-store Bing key). | `{ intent, ... }` | `requireAuth` |

### Redirects

Route: [`api.redirects.js`](../app/routes/api.redirects.js). GSC-driven 404 detection and Shopify URL-redirect management.

| Method | Path | Purpose | Key params | Auth |
|---|---|---|---|---|
| GET / POST | `/api/redirects` | `scan` / `apply` / `apply_all` / `dismiss` / `dismiss_all` / `update_destination`. Applies via Shopify URL redirects. | GET `?status`; POST `{ intent, ... }` | `requireAuth` |

---

## Blog & content

Routes: [`api.blog.generate.js`](../app/routes/api.blog.generate.js), [`api.blog.recommend.js`](../app/routes/api.blog.recommend.js), [`api.blog.banner.js`](../app/routes/api.blog.banner.js), [`api.content-refresh.js`](../app/routes/api.content-refresh.js), [`api.content-decay.js`](../app/routes/api.content-decay.js), [`api.faq.js`](../app/routes/api.faq.js), [`api.programmatic.js`](../app/routes/api.programmatic.js), [`api.llmstxt.js`](../app/routes/api.llmstxt.js), [`api.indexnow.js`](../app/routes/api.indexnow.js).

| Method | Path | Purpose | Key params | Auth |
|---|---|---|---|---|
| POST | `/api/blog/generate` | List / generate blog articles (Claude) + publish to Shopify. | `{ intent, ... }` | `requireAuth` |
| POST | `/api/blog/recommend` | AI blog recommendations + calendar; `generate_recommendations` / `list` / `accept` / `dismiss` / `calendar` / `schedule`. | `{ intent, ... }` | `requireAuth` |
| POST | `/api/blog/banner` | Blog banner image/prompt; `find_product_image` / `generate_banner_prompt`. | `{ intent, articleId, ... }` | `requireAuth` |
| POST | `/api/content-refresh` | Refresh decaying articles: `analyze` / `generate` / `publish`. | `{ intent, articleUrl, ... }` | `requireAuth` |
| GET / POST | `/api/content-decay` | Content-decay detection `scan`. | `{ intent }` | `requireAuth` |
| GET / POST | `/api/faq` | FAQ/PAA `preview` / `apply_article` / `batch_generate` / `save_faq` / `debug_paa` (direct DataForSEO SERP + Shopify metafields). | GET `?articleId`; POST `{ intent, ... }` | `requireAuth` |
| GET / POST | `/api/programmatic` | Programmatic-SEO template/row/batch CRUD + generate/enrich/publish. | `{ intent, ... }` | `requireAuth` |
| GET / POST | `/api/llmstxt` | `llms.txt` generator: `generate` / `regenerate_section` / `save_sections` / `restore_history` / `fix_titles` / `ai_recommendations`. | `{ intent, ... }` | `requireAuth` |
| POST | `/api/indexnow` | IndexNow manual submit: `status` / `submit_products` / `submit_urls`. | `{ intent, urls }` | `requireAuth` |

> Several of these routes have **latent bugs** flagged during the code audit (e.g. `api.blog.banner.js`, `api.blog.recommend.js`, `api.indexnow.js`, and some `api.llmstxt.js` branches reference undefined variables in certain code paths, which would throw at runtime). These are reported here for transparency, not documented as intended behavior, and are tracked as known issues.

---

## AI-citations (GEO) & AI-visibility

Routes: [`api.ai-citations.js`](../app/routes/api.ai-citations.js), [`api.brand-serp.js`](../app/routes/api.brand-serp.js), [`api.citation-monitor.js`](../app/routes/api.citation-monitor.js), [`api.llm-sentiment.js`](../app/routes/api.llm-sentiment.js), [`api.competitor-gap.js`](../app/routes/api.competitor-gap.js), [`api.cannibalization.js`](../app/routes/api.cannibalization.js), [`api.intent-shift.js`](../app/routes/api.intent-shift.js), [`api.pinterest.js`](../app/routes/api.pinterest.js).

| Method | Path | Purpose | Key params | Auth |
|---|---|---|---|---|
| POST | `/api/ai-citations` | AI-Citations / GEO: `save_brand` / `generate_prompts` / `save_prompt` / `archive*` / `start_scan` / `cancel_scan` / `get_scan` / `recommendations`. Runs scans across Claude / ChatGPT / AI-Overview. | `{ intent, ... }` | `requireAuth` **+ trial limits** |
| GET / POST | `/api/brand-serp` | Brand SERP scan + Organization schema injection; `save_brand` / `scan` / `cleanup_script_tags` / `add_org_schema` (writes `theme.liquid` via Shopify Asset API). | `{ intent, ... }` | `requireAuth` |
| GET / POST | `/api/citation-monitor` | Citation monitor `save_settings` / `monitor` (surfaces DataForSEO config presence). | `{ intent, ... }` | `requireAuth` |
| GET / POST | `/api/llm-sentiment` | LLM sentiment `scan` / `save_brand`. | `{ intent, ... }` | `requireAuth` |
| GET / POST | `/api/competitor-gap` | Competitor gap `save_competitors` / `analyze`. | `{ intent, ... }` | `requireAuth` |
| GET / POST | `/api/cannibalization` | Keyword cannibalization `analyze`. | `{ intent }` | `requireAuth` |
| GET / POST | `/api/intent-shift` | Search-intent shift `save_keywords` / `run`. | `{ intent, ... }` | `requireAuth` |
| GET / POST | `/api/pinterest` | Pinterest SEO `save_token` / `audit` / `auto_post` (per-store Pinterest token). | `{ intent, ... }` | `requireAuth` |

> `OPENAI_API_KEY` powers the ChatGPT-citation measurement inside `/api/ai-citations`; if unset, that platform is skipped. All other AI generation uses `ANTHROPIC_API_KEY`. See [CONFIGURATION](./CONFIGURATION.md).

---

## Cron / runner endpoints

Machine endpoints for background processing. **All require `CRON_SECRET`** — the value is compared against the `X-Cron-Secret` header (some also accept `?s=`). All return `401` on a **mismatched** secret. Only four (`api.cleanup`, `api.ai-citations.runner`, `api.pinterest.scheduled-runner`, `api.seo.cron.monitor`) also reject when `CRON_SECRET` is **unset**; the other four (`api.seo.job-runner`, `api.seo.kick`, `api.seo.reconcile`, `api.seo.audit-resume`) are only safe when `CRON_SECRET` is **set** — leaving it unset lets an empty/absent secret pass (see the Security note below). These are meant to be invoked by an external scheduler (crontab / PM2 / a third-party pinger); this repo does not ship a scheduler.

| Method | Path | Purpose | Secret source | Route file |
|---|---|---|---|---|
| GET | `/api/seo/job-runner` | Claim & process one `SeoJob` batch (SYNC/EXTRACT/ENRICH/TAG/TAXONOMY), then self-trigger. | `X-Cron-Secret` header | [`api.seo.job-runner.js`](../app/routes/api.seo.job-runner.js) |
| GET | `/api/seo/kick` | Pipeline orchestrator: for `AUTO_PILOT` stores, auto-apply eligible taxonomy proposals and queue the next pending job. | `x-cron-secret` header **or** `?s=` | [`api.seo.kick.js`](../app/routes/api.seo.kick.js) |
| GET | `/api/seo/reconcile` | Nightly Shopify ↔ local `SeoProduct` reconcile (insert missing, soft-delete orphans). | `x-cron-secret` header **or** `?s=` | [`api.seo.reconcile.js`](../app/routes/api.seo.reconcile.js) |
| GET | `/api/seo/audit-resume` | Resume stale RUNNING `AUDIT` jobs. | `x-cron-secret` header | [`api.seo.audit-resume.js`](../app/routes/api.seo.audit-resume.js) |
| GET | `/api/seo/cron/monitor` | Weekly per-store SEO monitor: GSC sync, CTR anomaly, cluster/dup detection, cannibalization, ECS re-eval. | `X-Cron-Secret` header | [`api.seo.cron.monitor.js`](../app/routes/api.seo.cron.monitor.js) |
| GET | `/api/cleanup` | TTL cleanup: delete `WebhookDedupe` > 7 days old and expired `Session` rows. | `X-Cron-Secret` header | [`api.cleanup.js`](../app/routes/api.cleanup.js) |
| GET | `/api/ai-citations/runner` | Trigger due scheduled AI-citation scans (SCALE / GROWTH plans only). | `X-Cron-Secret` header | [`api.ai-citations.runner.js`](../app/routes/api.ai-citations.runner.js) |
| GET | `/api/pinterest/scheduled-runner` | Post due scheduled pins; self-trigger if a batch is full. | `X-Cron-Secret` header | [`api.pinterest.scheduled-runner.js`](../app/routes/api.pinterest.scheduled-runner.js) |

> There is also a standalone Node script, [`scripts/cron-seo-digest.js`](../scripts/cron-seo-digest.js) (weekly SEO digest email). It is **not** an HTTP route and has no secret — it runs directly via `node`/crontab and talks to the DB and SMTP directly.

### Example: trigger a cron endpoint

HTTP header matching is case-insensitive, so `X-Cron-Secret` and `x-cron-secret` are equivalent.

```bash
# Preferred: secret in a header (does not leak into logs)
curl https://app.example.com/api/seo/kick \
  -H 'X-Cron-Secret: changeme-cron-secret'
```

`?s=` is accepted by `kick` and `reconcile` only, but leaks the secret into URLs/access logs — prefer the header:

```bash
# Discouraged (secret in URL): only kick / reconcile support ?s=
curl "https://app.example.com/api/seo/reconcile?s=changeme-cron-secret"
```

On success these return `200` with a per-run summary JSON *(shape varies per endpoint)*; on missing/wrong secret they return:

```json
{ "error": "Unauthorized" }
```

---

## Webhooks

### Product sync webhooks (verified)

Routes: [`webhooks.products.create.jsx`](../app/routes/webhooks.products.create.jsx), [`webhooks.products.update.jsx`](../app/routes/webhooks.products.update.jsx), [`webhooks.products.delete.jsx`](../app/routes/webhooks.products.delete.jsx). These keep the `SeoProduct` table in sync and are the **only** webhooks with authentication — a **per-store URL secret** (`?s=`) plus the `x-shopify-shop-domain` header, compared constant-time against `SeoSetting.webhook_secret`. This is **not** Shopify's standard HMAC verification.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/webhooks/products/create` | Upsert `SeoProduct` as `pending`. | per-store URL secret (`?s=`) + shop-domain header; `401` on fail |
| POST | `/webhooks/products/update` | Update `SeoProduct` title, preserve `aiTag`/status, resurrect deleted→pending if active. | per-store URL secret |
| POST | `/webhooks/products/delete` | Soft-delete `SeoProduct` (`status=deleted`). | per-store URL secret |
| GET | (same three paths) | Health check — returns `OK`. | public (health only) |

Example (the secret is provisioned per store at webhook-registration time):

```bash
curl -X POST "https://app.example.com/webhooks/products/create?s=changeme-store-secret" \
  -H 'x-shopify-shop-domain: your-store.myshopify.com' \
  -H 'Content-Type: application/json' \
  -d '{"id":123456789,"title":"Example Product"}'
```

Response is a plain `200`:

```
OK
```

### Stub webhooks (no verification)

The following are **no-op stubs** that always return `200` — Shopify webhooks are disabled in standalone mode. They perform no work and have **no verification**.

| Method | Path | Route file |
|---|---|---|
| POST | `/webhooks/gdpr` | [`webhooks.gdpr.jsx`](../app/routes/webhooks.gdpr.jsx) |
| POST | `/webhooks/customers/data_request` | [`webhooks.customers.data_request.jsx`](../app/routes/webhooks.customers.data_request.jsx) |
| POST | `/webhooks/customers/redact` | [`webhooks.customers.redact.jsx`](../app/routes/webhooks.customers.redact.jsx) |
| POST | `/webhooks/shop/redact` | [`webhooks.shop.redact.jsx`](../app/routes/webhooks.shop.redact.jsx) |
| POST | `/webhooks/app/uninstalled` | [`webhooks.app.uninstalled.jsx`](../app/routes/webhooks.app.uninstalled.jsx) |
| POST | `/webhooks/app/subscription-update` | [`webhooks.app.subscription-update.jsx`](../app/routes/webhooks.app.subscription-update.jsx) |
| POST | `/webhooks/app/scopes_update` | [`webhooks.app.scopes_update.jsx`](../app/routes/webhooks.app.scopes_update.jsx) |
| POST | `/webhooks/articles/create` | [`webhooks.articles.create.jsx`](../app/routes/webhooks.articles.create.jsx) |

---

## Public endpoints (no auth)

Intentionally public, keyed by a public identifier rather than a session.

| Method | Path | Purpose | Key params | Route file |
|---|---|---|---|---|
| GET | `/api/org-schema.js` | Serve Organization JSON-LD as a JS snippet for a Shopify Script Tag (injected on every storefront page). `Content-Type: application/javascript`, cached 1h. | `?shop=your-store.myshopify.com` | [`api.org-schema.js`](../app/routes/api.org-schema.js) |
| GET | `/{key}.txt` | IndexNow domain-verification file. Echoes the key back as `text/plain` if a `SeoSetting.seo_indexnow_key` matches the 32-hex key in the path. | path `/{32-hex}.txt` | [`indexnow-verify.$.jsx`](../app/routes/indexnow-verify.$.jsx) |
| GET | `/pricing` | Marketing pricing page (static). | — | [`pricing.jsx`](../app/routes/pricing.jsx) |
| GET | `/privacy` | Privacy page (static). | — | [`privacy.jsx`](../app/routes/privacy.jsx) |
| GET | `/legal`, `/legal/privacy`, `/legal/terms`, `/legal/cookies`, `/legal/data-deletion` | Legal pages (static). | — | `legal.*.jsx` |

Example — fetch the storefront Organization schema snippet:

```bash
curl "https://app.example.com/api/org-schema.js?shop=your-store.myshopify.com"
```

Representative response (a self-injecting IIFE; empty/`// ...` comment when nothing is configured):

```javascript
(function(){
  if (document.getElementById('openclaw-org-schema')) return;
  var s = document.createElement('script');
  s.type = 'application/ld+json';
  s.id = 'openclaw-org-schema';
  s.textContent = "{\"@context\":\"https://schema.org\",\"@type\":\"Organization\", ...}";
  document.head.appendChild(s);
})();
```

---

## Security notes

The following were flagged during the code audit. They matter to self-hosters and are stated as facts from the source.

1. **`/api/ga4/save-property` has no auth (potential IDOR).** [`api.ga4.save-property.js`](../app/routes/api.ga4.save-property.js) does **not** call `requireAuth`; it reads `{ propertyId, propertyName, storeId }` straight from the JSON body and upserts `SeoSetting` for that `storeId`. Any unauthenticated caller can overwrite the GA4 property setting for an arbitrary store. It exists to be called by the OAuth-callback property picker. Consider adding session auth or a signed token if you expose this app publicly.

2. **Public storefront endpoints are unauthenticated by design.** `/api/org-schema.js` and the `/{key}.txt` IndexNow file are keyed only by `?shop=` / the key path. `org-schema.js` will disclose whatever Organization JSON-LD is stored for any known `shopDomain`. This is intended (they are loaded by anonymous storefront/crawler traffic) but is worth knowing.

3. **Stub webhooks are unverified.** All `/webhooks/*` endpoints except the three `products/*` handlers are no-op stubs with **no signature/secret check**. They do nothing but return `200`, so the risk is limited, but they will accept any request. Notably there is **no** GDPR/mandatory-webhook processing.

4. **Product webhooks use a custom per-store URL secret, not Shopify HMAC.** [`webhook-verify.server.js`](../app/lib/webhook-verify.server.js) checks a `?s=` secret + `x-shopify-shop-domain` header against `SeoSetting.webhook_secret` (constant-time). This is a reasonable shared-secret scheme but differs from Shopify's standard `X-Shopify-Hmac-Sha256` verification; the secret travels in the URL query string.

5. **`CRON_SECRET` in the URL leaks.** `/api/seo/kick` and `/api/seo/reconcile` accept the secret as `?s=` in addition to the header. Query-string secrets end up in web-server access logs and proxies. Prefer the `X-Cron-Secret` header and treat `?s=` as a fallback only.

6. **`CRON_SECRET` fail-closed depends on it being set.** If `CRON_SECRET` is **empty/unset**, the comparison is `"" === ""`, so a request with an empty/absent secret would match. **Always set a strong `CRON_SECRET`** — see [CONFIGURATION](./CONFIGURATION.md).

7. **No per-route plan/role enforcement on the API.** `requireAuth` authenticates the user and resolves their active store, but the `api.*` routes themselves do not re-check plan/role. Feature/plan gating is applied only at the authenticated **UI** layout (`app.jsx` → `gateCurrentRoute`). A logged-in user can therefore call gated `api.*` endpoints directly. `/api/ai-citations` is the exception that also enforces trial limits.

8. **Provide production config via environment.** OAuth redirect URIs are derived from `APP_URL` (set it to your own domain), and `ecosystem.config.cjs` is git-ignored so no secrets are committed. Provide all secrets via `.env` — never commit real values. See [INSTALLATION](./INSTALLATION.md) and [CONFIGURATION](./CONFIGURATION.md).

---

## Quick reference: auth per endpoint group

| Group | Typical auth |
|---|---|
| `/login`, `/register`, `/reset*`, `/verify*`, `/resend`, `/logout` | public (rate-limited; `requireGuest` on login/register loaders) |
| `/app`, `/app/*` | `requireAuth` + plan gate |
| `/connect-store` | `requireAuth` |
| `/api/shopify-oauth/*` | state cookie + optional HMAC |
| `/api/seo/*` (user), `/api/gsc/*`, `/api/ga4` (not save-property), `/api/*` feature routes | `requireAuth` |
| `/api/ga4/save-property` | ⚠️ **none** |
| `/api/seo/job-runner`, `/api/seo/kick`, `/api/seo/reconcile`, `/api/seo/audit-resume`, `/api/seo/cron/monitor`, `/api/cleanup`, `/api/ai-citations/runner`, `/api/pinterest/scheduled-runner` | `CRON_SECRET` |
| `/webhooks/products/*` | per-store URL secret |
| other `/webhooks/*` | none (no-op stubs) |
| `/api/org-schema.js`, `/{key}.txt`, `/pricing`, `/privacy`, `/legal/*` | public |
