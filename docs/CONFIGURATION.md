# Configuration

This document describes every environment variable Kimono SEO reads, and — for each external service — **where to obtain the credential** and **how to connect it** (OAuth clients, redirect URIs, scopes, API keys).

Kimono SEO is **self-hosted**: you supply your own database and your own API keys. Copy [`.env.example`](../.env.example) to `.env` and fill in the values that apply to the features you want to enable.

```bash
cp .env.example .env
# edit .env, then:
npm run seed   # creates the SUPER_ADMIN account (prisma/seed.js)
```

**Conventions**

- **REQUIRED** — the app (or a core flow) does not work without it.
- **OPTIONAL** — feature-specific; the related feature is disabled or degraded when unset. A safe default is noted where one exists.
- Every value shown is a placeholder. Never commit real secrets.

Related docs: [README.md](../README.md) · [INSTALLATION.md](./INSTALLATION.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [API.md](./API.md) · [CONTRIBUTING.md](../CONTRIBUTING.md) · [LICENSING.md](../LICENSING.md)

---

## Quick reference

| Variable | Required? | Default | Group |
| --- | --- | --- | --- |
| `DATABASE_URL` | **Required** | — | Database |
| `NODE_ENV` | Optional | *(unset)* | Core / App |
| `PORT` | Optional | `3000` | Core / App |
| `APP_URL` | **Required in practice** | `https://seo.example.com` | Core / App |
| `SHOPIFY_APP_URL` | Optional | `https://kimono-bi-production.up.railway.app` | Core / App |
| `SHOPIFY_APP_HANDLE` | Optional | `kimono-ultimate-seo` | Core / App |
| `ADMIN_EMAIL` | Optional | `admin@kimonogroup.ro` | Auth (seed) |
| `ADMIN_PASSWORD` | Optional | `KimonoSEO2026!` | Auth (seed) |
| `ADMIN_NAME` | Optional | `Kimono Admin` | Auth (seed) |
| `SMTP_HOST` | Optional | `127.0.0.1` | Email |
| `SMTP_PORT` | Optional | `25` | Email |
| `SMTP_USER` | Optional | — | Email |
| `SMTP_PASS` | Optional | — | Email |
| `SMTP_FROM` | Optional | `Kimono SEO <noreply@kimonogroup.ro>` | Email |
| `CRON_SECRET` | **Required (jobs)** | *(empty string)* | Cron |
| `ANTHROPIC_API_KEY` | **Required (AI)** | — | AI |
| `AI_MODEL_QUALITY` | Optional | `claude-sonnet-4-6` | AI |
| `AI_MODEL_FAST` | Optional | `claude-haiku-4-5-20251001` | AI |
| `OPENAI_API_KEY` | Optional | — | AI |
| `AI_MODEL_OPENAI` | Optional | `gpt-4o` | AI |
| `SHOPIFY_CLIENT_ID` | **Required (OAuth)** | — | Shopify |
| `SHOPIFY_CLIENT_SECRET` | **Required (OAuth)** | — | Shopify |
| `SHOPIFY_API_KEY` | **Required (token refresh)** | — | Shopify |
| `SHOPIFY_API_SECRET` | **Required (token refresh)** | — | Shopify |
| `SHOPIFY_API_VERSION` | Optional | modules hardcode `2025-04` | Shopify |
| `GSC_CLIENT_ID` | **Required (GSC/GA4)** | — | Google |
| `GSC_CLIENT_SECRET` | **Required (GSC/GA4)** | — | Google |
| `GOOGLE_CLIENT_ID` | **Required (GSC redirect/404 scan)** | — | Google |
| `GOOGLE_CLIENT_SECRET` | **Required (GSC redirect/404 scan)** | — | Google |
| `PAGESPEED_API_KEY` | Optional | keyless (rate-limited) | Google |
| `DATAFORSEO_LOGIN` | Optional | — | DataForSEO |
| `DATAFORSEO_PASSWORD` | Optional | — | DataForSEO |
| `BING_OAUTH_CLIENT_ID` | Optional | — | Bing |
| `BING_OAUTH_CLIENT_SECRET` | Optional | — | Bing |
| `BING_API_KEY` | Optional | — | Bing |
| `PINTEREST_CLIENT_ID` | Optional | — | Pinterest |
| `PINTEREST_CLIENT_SECRET` | Optional | — | Pinterest |

> **Not environment variables:** WooCommerce credentials, the IndexNow key, and per-store Bing/GSC/GA4/Pinterest OAuth tokens are all stored **in the database** (per store), not in `.env`. See [WooCommerce](#woocommerce-partial-support) and [IndexNow](#indexnow) below.
>
> **`SESSION_SECRET`** appears in `ecosystem.config.cjs` but is **not read anywhere in the application code**. Sessions are DB-backed: the `kimono_session` cookie holds an opaque database token (`UserSession.token`), not a signed cookie. You do not need to set it.

---

## Redirect / callback URLs (summary)

Register these exact paths with each provider. `{APP_URL}` / `{SHOPIFY_APP_URL}` are your public HTTPS base URLs.

| Provider | Redirect URI the code builds | Base variable used |
| --- | --- | --- |
| Shopify OAuth | `/api/shopify-oauth/callback` | Derived from `APP_URL` — register `${APP_URL}/api/shopify-oauth/callback` in the Shopify app |
| Google Search Console | `{APP_URL}/gsc-callback` | `APP_URL` → `SHOPIFY_APP_URL` |
| Google Analytics 4 | `{APP_URL}/ga4-callback` | `APP_URL` → `SHOPIFY_APP_URL` |
| Bing Webmaster | `{SHOPIFY_APP_URL}/bing-callback` | `SHOPIFY_APP_URL` |
| Pinterest | `{SHOPIFY_APP_URL}/pinterest-callback` | `SHOPIFY_APP_URL` |
| IndexNow | `/{key}.txt` (served by the app) | key stored in DB |

---

## Core / App

### `DATABASE_URL` — **Required**
PostgreSQL connection string used by Prisma as the datasource.

```
postgresql://USER:PASSWORD@HOST:PORT/DBNAME?schema=public
```

If your managed Postgres only exposes port 443 or requires TLS, use the provider's pooled/SSL endpoint and append `?sslmode=require`. Run migrations with the standard Prisma tooling and then `npm run seed`.

### `NODE_ENV` — Optional (default: unset)
Standard Node environment. When set to `test`, the auth rate-limiter cleanup interval is skipped. Set to `production` in deployment.

### `PORT` — Optional (default: `3000`)
HTTP port for the React Router server (`react-router-serve`).

### `APP_URL` — Required in practice
Public HTTPS base URL of **this** app. Used to build:

- account **verify / reset** links in auth emails;
- the **GSC** (`/gsc-callback`) and **GA4** (`/ga4-callback`) OAuth redirect URIs.

If unset, the code falls back to `http://localhost:3000` — do not rely on this in production. Set it to your own domain, e.g. `https://seo.example.com`.

### `SHOPIFY_APP_URL` — Optional
Alternate public base URL. Used as the base for the **Bing** (`/bing-callback`) and **Pinterest** (`/pinterest-callback`) redirect URIs, and as a fallback for GSC/GA4 when `APP_URL` is unset. If you use Bing or Pinterest OAuth, set this to the same value as `APP_URL`. Code fallback if unset: `https://kimono-bi-production.up.railway.app`.

### `SHOPIFY_APP_HANDLE` — Optional (default: `kimono-ultimate-seo`)
The Shopify app slug. Used only when constructing a fallback GA4 callback URL.

---

## Auth / Session

Sessions are **database-backed**. On login, a `UserSession` row is created and its token is stored in the `kimono_session` cookie (HttpOnly, SameSite=Lax, 30-day expiry; `Secure` is added in HTTPS/production). There is no cookie-signing secret to configure.

The following variables seed the initial **SUPER_ADMIN** account via `prisma/seed.js` (`npm run seed`). Change them before seeding a production DB, then change the password again from the UI.

| Variable | Required? | Default |
| --- | --- | --- |
| `ADMIN_EMAIL` | Optional | `admin@kimonogroup.ro` |
| `ADMIN_PASSWORD` | Optional | `KimonoSEO2026!` — **change this** |
| `ADMIN_NAME` | Optional | `Kimono Admin` |

---

## Email / SMTP (nodemailer)

Sends account-verification, password-reset, and weekly-digest emails. Authentication is only enabled when **both** `SMTP_USER` and `SMTP_PASS` are set.

| Variable | Required? | Default | Notes |
| --- | --- | --- | --- |
| `SMTP_HOST` | Optional | `127.0.0.1` | SMTP server host |
| `SMTP_PORT` | Optional | `25` | `465` → secure TLS; `25` → STARTTLS with `tls.rejectUnauthorized=false` |
| `SMTP_USER` | Optional | — | username; enables auth when paired with `SMTP_PASS` |
| `SMTP_PASS` | Optional | — | password |
| `SMTP_FROM` | Optional | `Kimono SEO <noreply@kimonogroup.ro>` | From address |

**Where to obtain:** any SMTP provider (e.g. your mail host, Amazon SES, Mailgun, Postmark, or a self-hosted MTA). Create SMTP credentials in the provider dashboard, then set host/port/user/pass. Use port `587` (STARTTLS) or `465` (implicit TLS) for hosted providers.

---

## Cron / Background jobs

### `CRON_SECRET` — **Required for background jobs**
Shared secret compared against the `X-Cron-Secret` header (and, on some routes, a `?s=` query parameter) to authorize the self-triggering SEO job runner and scheduled cron endpoints:

- `/api/seo/job-runner` — batch pipeline processor (SYNC / EXTRACT / ENRICH / TAG / TAXONOMY)
- `/api/seo/kick` — pipeline orchestrator
- `/api/seo/reconcile` — nightly Shopify↔local reconcile
- `/api/seo/audit-resume` — resume stale AUDIT jobs
- `/api/seo/cron/monitor` — weekly per-store SEO monitor
- `/api/cleanup` — purge old dedupe/session rows
- `/api/ai-citations/runner` — due AI-citation scans
- `/api/pinterest/scheduled-runner` — post due scheduled pins

> **Security note:** the guard compares the header to `process.env.CRON_SECRET || ""`. If you leave `CRON_SECRET` unset, an empty/missing header would pass. **Always** set a strong random value:
>
> ```bash
> openssl rand -hex 32
> ```

Point your scheduler (cron, systemd timer, or an external cron service) at these endpoints and send the header, e.g.:

```bash
curl -fsS -H "X-Cron-Secret: $CRON_SECRET" https://seo.example.com/api/seo/job-runner
```

---

## AI

### Anthropic Claude (primary) — `ANTHROPIC_API_KEY` **Required for AI**
Powers keyword discovery, taxonomy/collection proposals, product tagging, on-page audits, article & schema generation, GEO/AI-citation recommendations, image alt-text (Vision), title normalization, and `llms.txt` enrichment. AI steps throw or skip when the key is missing.

**Where to obtain / how to connect:**
1. Sign in at <https://console.anthropic.com/>.
2. Go to **API Keys → Create Key**.
3. Copy the `sk-ant-...` value into `ANTHROPIC_API_KEY`.

| Variable | Required? | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | **Required (AI)** | — |
| `AI_MODEL_QUALITY` | Optional | `claude-sonnet-4-6` |
| `AI_MODEL_FAST` | Optional | `claude-haiku-4-5-20251001` |

`AI_MODEL_QUALITY` is used for large/quality tasks; `AI_MODEL_FAST` for cheap/fast tasks. Per-store `StoreSettings.aiModel` overrides the quality model where set.

### OpenAI (ChatGPT citation measurement) — Optional
Used **only** by the AI-Citations module to measure ChatGPT brand citations (OpenAI Responses API, forced web-search tool). If `OPENAI_API_KEY` is unset, ChatGPT measurement is disabled; other platforms and Claude still work.

**Where to obtain:** create a key at <https://platform.openai.com/api-keys> and set `OPENAI_API_KEY`.

| Variable | Required? | Default |
| --- | --- | --- |
| `OPENAI_API_KEY` | Optional | — |
| `AI_MODEL_OPENAI` | Optional | `gpt-4o` |

---

## Shopify

Shopify is the primary commerce platform. The app both **installs via OAuth** (to obtain a permanent Admin API token) and **refreshes offline tokens** for background jobs. Two credential pairs are referenced:

- `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` — the one-click OAuth **install + callback** flow (the secret is also used for HMAC verification of the callback).
- `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` — background **offline access-token refresh**.

For a single Shopify app, set **both pairs to the same app credentials**.

### Creating the Shopify app

You can use either a **custom app** (single store) or a **distribution app** (multiple stores) from the [Shopify Partner Dashboard](https://partners.shopify.com/):

1. **Partners → Apps → Create app** (or **Shopify admin → Settings → Apps and sales channels → Develop apps** for a store-level custom app).
2. Note the app's **Client ID** and **Client secret** → set them as `SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET` **and** `SHOPIFY_API_KEY`/`SHOPIFY_API_SECRET`.
3. **Scopes.** The install flow requests:
   ```
   read_customers, write_customers, read_products, read_orders, read_inventory, read_reports
   ```
   Configure the app with (at least) these access scopes.
4. **Allowed redirection URL(s).** Add your callback URL (see the critical note below).

### Callback URL

The install route (`app/routes/api.shopify-oauth.install.jsx`) derives the redirect URI from your
**`APP_URL`** (falling back to `SHOPIFY_APP_URL`, then `http://localhost:3000`):

```js
const appUrl = process.env.APP_URL || process.env.SHOPIFY_APP_URL || "http://localhost:3000";
const redirectUri = `${appUrl}/api/shopify-oauth/callback`;
```

So you only need to **set `APP_URL`** to your public URL. Then register
`${APP_URL}/api/shopify-oauth/callback` — e.g. `https://seo.example.com/api/shopify-oauth/callback` —
as an **Allowed redirection URL** in the Shopify app. The install entry point is
`GET /api/shopify-oauth/install?shop=your-store.myshopify.com`.

### `SHOPIFY_API_VERSION` — Optional
Admin API version override. **Note:** most modules hardcode `2025-04` in their request URLs, so this variable is not consistently honored. Leave it unset unless you have verified a specific need.

---

## Google (Search Console, Analytics 4, PageSpeed)

The app references **two** Google OAuth client pairs:

- `GSC_CLIENT_ID` / `GSC_CLIENT_SECRET` — GSC, GA4, and crawl-budget token flows.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — the GSC-based redirect (404) scan and GA4 token refresh.

You can create **one** OAuth client and set both pairs to the same values.

### Redirect URIs the code builds

| Feature | Redirect URI | Base |
| --- | --- | --- |
| Search Console | `{APP_URL}/gsc-callback` | `APP_URL` → `SHOPIFY_APP_URL` |
| Analytics 4 | `{APP_URL}/ga4-callback` | `APP_URL` → `SHOPIFY_APP_URL` |

(The base is `APP_URL` if set, otherwise `SHOPIFY_APP_URL`, otherwise the hardcoded fallback.)

### How to create the OAuth client

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create/select a project.
2. **APIs & Services → Library** — enable **Google Search Console API** and **Google Analytics Data API** (GA4). For PageSpeed, enable **PageSpeed Insights API**.
3. **APIs & Services → OAuth consent screen** — configure the consent screen (External), add your scopes and test users as needed.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application.**
5. Under **Authorized redirect URIs**, add **both**:
   - `https://seo.example.com/gsc-callback`
   - `https://seo.example.com/ga4-callback`
6. Copy the generated **Client ID** and **Client secret** into `GSC_CLIENT_ID`/`GSC_CLIENT_SECRET` **and** `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.

Merchants then connect their own GSC/GA4 properties from the app UI; the resulting refresh tokens are stored **per store** in the database (`SeoSetting`), not in `.env`.

### `PAGESPEED_API_KEY` — Optional
Google PageSpeed Insights API key for Core Web Vitals audits. The endpoint works **keyless** but is rate-limited; a key raises your quota.

**Where to obtain:** in **Google Cloud Console → APIs & Services → Credentials → Create Credentials → API key**, then restrict it to the PageSpeed Insights API.

---

## DataForSEO (keyword enrichment + PAA)

Provides keyword metrics (volume, difficulty, CPC, competition, SERP features, trend) and People-Also-Ask questions for the ENRICH and PAA pipeline steps. Auth is HTTP Basic using your account login/password. If unset, these steps are skipped and the app falls back to AI where possible.

**Where to obtain / how to connect:**
1. Create an account at <https://app.dataforseo.com/>.
2. Your **API login** (email) and **API password** are shown in the dashboard under API access.
3. Set `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD`.

| Variable | Required? | Default |
| --- | --- | --- |
| `DATAFORSEO_LOGIN` | Optional | — |
| `DATAFORSEO_PASSWORD` | Optional | — |

---

## Bing Webmaster (Microsoft Entra OAuth)

> **Note:** the `/bing-callback` OAuth *callback route* is **not shipped** in this repo, so the full redirect flow will 404. Use the API-key / access-token method (paste the token in the app) instead.

Enables listing sites, URL submission quota, single/batch URL submission, and rank/traffic/query stats via OAuth 2.0. Gated by `isBingConfigured()` — both the client ID and secret must be present.

**Redirect URI the code builds:** `{SHOPIFY_APP_URL}/bing-callback`

**Where to obtain / how to connect:**
1. In the [Microsoft Entra admin center](https://entra.microsoft.com/) (Azure AD): **App registrations → New registration**.
2. Under **Redirect URI (Web)**, add `https://seo.example.com/bing-callback`.
3. Copy the **Application (client) ID** → `BING_OAUTH_CLIENT_ID`.
4. **Certificates & secrets → New client secret** → copy the value → `BING_OAUTH_CLIENT_SECRET`.
5. Ensure the app has permission to call the Bing Webmaster API and that your site is verified in [Bing Webmaster Tools](https://www.bing.com/webmasters/).

| Variable | Required? | Notes |
| --- | --- | --- |
| `BING_OAUTH_CLIENT_ID` | Optional | Entra app client ID |
| `BING_OAUTH_CLIENT_SECRET` | Optional | Entra app client secret |
| `BING_API_KEY` | Optional | **Presence flag only** — surfaces "Bing configured" on the dashboard. The per-store Bing API key used for legacy calls is stored in the DB (`SeoSetting.bing_api_key`), not here. |

Per-store Bing OAuth tokens are stored in the database (`SeoSetting`, `bing_*` keys), not in `.env`.

---

## Pinterest (API v5 OAuth)

> **Note:** the `/pinterest-callback` OAuth *callback route* is **not shipped** in this repo, so the full redirect flow will 404. Use the access-token method (paste the token in the app) instead.

Enables creating pins/boards, listing boards/pins, reading the user account, and scheduled auto-posting via OAuth 2.0. Gated by `isPinterestConfigured()` — both the client ID and secret must be present.

**Redirect URI the code builds:** `{SHOPIFY_APP_URL}/pinterest-callback`

**Where to obtain / how to connect:**
1. Create an app in the [Pinterest Developer portal](https://developers.pinterest.com/).
2. Add `https://seo.example.com/pinterest-callback` as a **Redirect URI**.
3. Copy the **App ID** → `PINTEREST_CLIENT_ID` and **App secret** → `PINTEREST_CLIENT_SECRET`.
4. Request the scopes needed for boards/pins (and, for auto-posting, write access) and, if required, apply for standard/production access.

| Variable | Required? |
| --- | --- |
| `PINTEREST_CLIENT_ID` | Optional |
| `PINTEREST_CLIENT_SECRET` | Optional |

Per-store Pinterest OAuth tokens are stored in the database (`SeoSetting`, `pinterest_*` keys), not in `.env`.

---

## WooCommerce (partial support)

WooCommerce has **no environment variables**. Stores are connected from the app UI, and the REST API credentials are stored **in the database** as `consumer_key:consumer_secret` (`StoreConnection.accessToken`).

**How to generate the WooCommerce keys:**
1. In WordPress admin: **WooCommerce → Settings → Advanced → REST API → Add key**.
2. Set **Permissions** to **Read/Write** (needed to apply SEO changes: title, slug, Yoast meta, image alt text).
3. Copy the generated **Consumer key** and **Consumer secret**.
4. In Kimono SEO, connect a WooCommerce store and paste the store URL plus the key/secret; the app validates them against the WooCommerce REST API (v3) and stores them for that store.

---

## IndexNow

IndexNow has **no environment variables and no provider key**. The app self-generates a 32-hex key per store, stores it in the database (`SeoSetting.seo_indexnow_key`), and serves it at `/{key}.txt` (route `indexnow-verify.$.jsx`) as ownership proof. URLs are then submitted to Bing/Copilot/Yandex from the `/api/indexnow` endpoint. There is nothing to configure in `.env`.

---

## Billing

There is **no payment processor and no billing environment variables** in this app. Plans exist only as:

- a static **plan catalog** for feature-gating (`app/lib/billing.js`: `FREE` / `STARTER` / `GROWTH` / `SCALE`), enforced by `plan-gate.server.js` (blocked modules redirect to `/app/billing`, which has no route); and
- a separate **User-plan** system (`TRIAL` / `STARTER` / `GROWTH` / `AGENCY` / `ADMIN`) used by `plan-guard` and `prisma/seed.js`.

No Stripe, checkout, or webhook billing is wired.

> **Caveat:** the shipped static legal pages (`app/routes/legal.terms.jsx`, `app/routes/legal.privacy.jsx`) contain boilerplate that mentions "Stripe" as a payment processor / sub-processor. This does **not** reflect any wired integration — self-hosters should edit those legal pages to match their actual setup.

---

## Minimal `.env` to get started

The smallest configuration to run the app and use the core AI SEO engine on a Shopify store:

```dotenv
DATABASE_URL=postgresql://user:changeme@localhost:5432/kimono_seo?schema=public
APP_URL=https://seo.example.com
CRON_SECRET=<openssl rand -hex 32>
ANTHROPIC_API_KEY=sk-ant-xxxx
SHOPIFY_CLIENT_ID=your-shopify-client-id
SHOPIFY_CLIENT_SECRET=your-shopify-client-secret
SHOPIFY_API_KEY=your-shopify-client-id
SHOPIFY_API_SECRET=your-shopify-client-secret
```

Add Google, DataForSEO, Bing, Pinterest, OpenAI, and SMTP credentials to enable the corresponding integrations. See [`.env.example`](../.env.example) for the full, grouped list.
