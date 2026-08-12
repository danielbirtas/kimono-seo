# Getting Started

Welcome! This guide takes you from a freshly installed **Kimono SEO** to a
running store with AI and your first integrations connected. It's written for
the person operating a self-hosted deployment.

If you haven't installed the app yet, do that first:

- [docs/INSTALLATION.md](INSTALLATION.md) — manual, step-by-step install.
- [docs/INSTALL_WITH_CLAUDE_CODE.md](INSTALL_WITH_CLAUDE_CODE.md) — let Claude
  Code install it for you on your server.

For the complete environment-variable reference (every var, where to obtain each
credential, and the exact redirect URIs), keep
[docs/CONFIGURATION.md](CONFIGURATION.md) open alongside this guide — this page
adds the friendly, click-by-click provider walkthroughs, and links back to it
for the full reference.

> Throughout this guide, `${APP_URL}` means the public HTTPS base URL of **your**
> deployment (for example `https://seo.example.com`). Everything else uses
> obvious placeholders — replace them with your own values. You always bring
> your **own** API keys.

---

## 1. After installation & first login

Once the app is built and running (see the install docs), it listens on `PORT`
(default **3000**) behind your reverse proxy.

1. **Open the app** at your `${APP_URL}` — you should land on the **login page**.
2. **Log in as the seeded admin.** Running `npm run seed` (`prisma/seed.js`)
   creates a single **SUPER_ADMIN** account from these variables (all optional,
   with defaults):

   | Variable | Default | Meaning |
   |----------|---------|---------|
   | `ADMIN_EMAIL` | `admin@kimonogroup.ro` | Admin login email |
   | `ADMIN_PASSWORD` | `KimonoSEO2026!` | Admin password (**change this**) |
   | `ADMIN_NAME` | `Kimono Admin` | Display name |

   The `SUPER_ADMIN` role bypasses plan/feature gating, so you can reach every
   module. The seeded admin is **pre-verified**, so it works even before SMTP is
   configured.
3. **Change the admin password.** Set a strong `ADMIN_PASSWORD` in `.env`
   *before* seeding a production database, then log in and change the password
   again from the UI. Never keep the default `KimonoSEO2026!` on a public server.
4. **(Optional) Invite other users.** New accounts can also register at
   `/register`; registration sends an email-verification link (`/verify/:token`),
   which requires SMTP (`SMTP_*`) to be configured. See the Email section of
   [docs/CONFIGURATION.md](CONFIGURATION.md#email--smtp-nodemailer).

---

## 2. Set `APP_URL` correctly (do this before any OAuth)

**`APP_URL` is the single most important setting for integrations.** Every OAuth
redirect/callback URL the app builds is derived from it:

```
${APP_URL}/api/shopify-oauth/callback   ← Shopify
${APP_URL}/gsc-callback                 ← Google Search Console
${APP_URL}/ga4-callback                 ← Google Analytics 4
```

Set it to your **public HTTPS** hostname (not `localhost`, not an internal IP):

```dotenv
APP_URL=https://seo.example.com
```

If `APP_URL` is unset, the code falls back to `SHOPIFY_APP_URL`, then to
`http://localhost:3000` — do **not** rely on that in production. `SHOPIFY_APP_URL`
is only a secondary fallback (the Bing and Pinterest OAuth code uses `APP_URL`
first, then `SHOPIFY_APP_URL`, then localhost). The simplest, least surprising setup is to
set both to the same value:

```dotenv
APP_URL=https://seo.example.com
SHOPIFY_APP_URL=https://seo.example.com
```

Whatever you choose, the redirect URIs you register with each provider (below)
must match your `APP_URL` **exactly**, including `https://` and no trailing slash.

Full details: [docs/CONFIGURATION.md → Core / App](CONFIGURATION.md#core--app).

---

## 3. Connect your first store

Kimono SEO manages SEO for products/content on a connected store. Two platforms
are supported: **Shopify** (primary) and **WooCommerce** (partial). Open the
in-app **Connect Store** page at `/connect-store`.

### 3a. Shopify (recommended: one-click OAuth)

**Create the Shopify app** (once) in the
[Shopify Partner Dashboard](https://partners.shopify.com/):

1. **Partners → Apps → Create app** (choose a **custom** app for a single store,
   or a **distribution** app for multiple stores). Alternatively, for a
   store-level custom app: **Shopify admin → Settings → Apps and sales channels
   → Develop apps**.
2. Open the app's **API credentials** and note the **Client ID** and
   **Client secret**.
3. Set the **access scopes** to (at least) exactly what the install flow requests:

   ```
   read_customers,write_customers,read_products,read_orders,read_inventory,read_reports
   ```
4. Under **Allowed redirection URL(s)**, add your callback URL — the install
   route builds it from `APP_URL`:

   ```
   ${APP_URL}/api/shopify-oauth/callback
   ```
   e.g. `https://seo.example.com/api/shopify-oauth/callback`

5. Put the credentials in `.env`. There are **two** pairs — for a single app,
   set both pairs to the **same** app credentials:

   ```dotenv
   SHOPIFY_CLIENT_ID=your-shopify-client-id       # one-click OAuth install/callback
   SHOPIFY_CLIENT_SECRET=your-shopify-client-secret
   SHOPIFY_API_KEY=your-shopify-client-id          # background offline-token refresh
   SHOPIFY_API_SECRET=your-shopify-client-secret
   ```

**Connect it in the app:**

1. Go to `/connect-store`, **Shopify** tab.
2. Enter your shop domain (`your-store.myshopify.com`) and click
   **Connect with Shopify**. This starts
   `GET /api/shopify-oauth/install?shop=your-store.myshopify.com`, sends you to
   Shopify to approve, and returns to `${APP_URL}/api/shopify-oauth/callback`
   with a permanent Admin API token.

> **Advanced — manual token:** on the same tab you can instead paste an Admin API
> access token (`shpat_...`) from a custom app you created under **Settings →
> Apps and sales channels → Develop apps**. Same result, no OAuth round-trip.

More detail: [docs/CONFIGURATION.md → Shopify](CONFIGURATION.md#shopify).

### 3b. WooCommerce (partial support)

WooCommerce has **no environment variables** — credentials are entered in the UI
and stored per store in the database.

**Create REST API keys** in WordPress:

1. **WooCommerce → Settings → Advanced → REST API → Add key.**
2. Set **Permissions** to **Read/Write** (needed so the app can apply SEO
   changes: title, slug, Yoast meta, image alt text).
3. Copy the generated **Consumer key** (`ck_...`) and **Consumer secret**
   (`cs_...`).

**Connect it in the app:**

1. Go to `/connect-store`, **WooCommerce** tab.
2. Enter the **Site URL**, **Consumer Key**, and **Consumer Secret** and submit.
   The app validates them against the WooCommerce REST API (v3) and stores them
   for that store (as `consumer_key:consumer_secret`).

More detail:
[docs/CONFIGURATION.md → WooCommerce](CONFIGURATION.md#woocommerce-partial-support).

---

## 4. Add your AI keys

AI powers most of what makes Kimono SEO useful — keyword discovery, taxonomy and
collection proposals, product tagging, on-page audits, article & schema
generation, GEO / AI-citation work, image alt-text (Vision), and more. These are
**`.env` settings**, not UI connections.

### Anthropic Claude — required for AI

1. Sign in at <https://console.anthropic.com/>.
2. **API Keys → Create Key**, and copy the `sk-ant-...` value.
3. Set it in `.env`:

   ```dotenv
   ANTHROPIC_API_KEY=sk-ant-xxxx
   # optional model overrides (defaults shown):
   AI_MODEL_QUALITY=claude-sonnet-4-6            # large / high-quality tasks
   AI_MODEL_FAST=claude-haiku-4-5-20251001       # cheap / fast tasks
   ```

Without `ANTHROPIC_API_KEY`, AI steps throw or are skipped. A per-store setting
(`StoreSettings.aiModel`) can override the quality model where set.

### OpenAI — optional (ChatGPT citation measurement only)

Used **only** by the AI-Citations module to measure ChatGPT brand citations. If
unset, ChatGPT measurement is disabled; Claude and everything else still work.

1. Create a key at <https://platform.openai.com/api-keys>.
2. Set it in `.env`:

   ```dotenv
   OPENAI_API_KEY=sk-xxxx
   AI_MODEL_OPENAI=gpt-4o        # optional, default gpt-4o
   ```

More detail: [docs/CONFIGURATION.md → AI](CONFIGURATION.md#ai).

---

## 5. Connect the optional integrations

Everything below is optional — add only what you need. A quick map of where each
one is configured:

| Integration | Configured via | Connected in |
|-------------|----------------|--------------|
| DataForSEO | `.env` only | (automatic once set) |
| Google Search Console | `.env` OAuth client | **Settings** page |
| Google Analytics 4 | `.env` OAuth client | **GA4** page |
| Google PageSpeed | `.env` (optional key) | (automatic once set) |
| Bing Webmaster | paste API key | **Bing AI Performance** page |
| Pinterest | paste access token | **Pinterest SEO** page |
| IndexNow | nothing to obtain | **SEO Settings** toggle |

### 5a. DataForSEO — keyword metrics & People-Also-Ask

Provides keyword volume/difficulty/CPC/competition/SERP features/trend and PAA
questions for the ENRICH and PAA pipeline steps. If unset, those steps are
skipped and the app falls back to AI where possible. Auth is HTTP Basic — there's
no OAuth and nothing to click in the UI.

1. Create an account at <https://app.dataforseo.com/>.
2. Find your **API login** (email) and **API password** in the dashboard under
   API access.
3. Set them in `.env`:

   ```dotenv
   DATAFORSEO_LOGIN=you@example.com
   DATAFORSEO_PASSWORD=changeme
   ```

Once both are set, the SEO settings page shows DataForSEO as active and the
pipeline uses it automatically. More detail:
[docs/CONFIGURATION.md → DataForSEO](CONFIGURATION.md#dataforseo-keyword-enrichment--paa).

### 5b. Google — Search Console, Analytics 4, PageSpeed

All three use Google Cloud. You can create **one** OAuth client and reuse it.

**Create the OAuth client** in the
[Google Cloud Console](https://console.cloud.google.com/):

1. Create or select a project.
2. **APIs & Services → Library** — enable the APIs you'll use:
   - **Google Search Console API** (for GSC),
   - **Google Analytics Data API** (for GA4),
   - **PageSpeed Insights API** (for Core Web Vitals, optional).
3. **APIs & Services → OAuth consent screen** — configure it (External), and add
   yourself / merchants as test users while in testing.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web
   application.**
5. Under **Authorized redirect URIs**, add **both** (matching your `APP_URL`):

   ```
   ${APP_URL}/gsc-callback
   ${APP_URL}/ga4-callback
   ```
6. Copy the **Client ID** and **Client secret**. The app references two Google
   pairs — set all four to the **same** client:

   ```dotenv
   GSC_CLIENT_ID=xxxx.apps.googleusercontent.com     # GSC, GA4, crawl-budget flows
   GSC_CLIENT_SECRET=GOCSPX-xxxx
   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com  # GSC redirect/404 scan (GA4 refresh uses GSC_CLIENT_ID)
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
   ```

**Scopes requested by the code** (read-only; you don't set these anywhere — they
come from the app when it builds the auth URL):

```
Search Console : https://www.googleapis.com/auth/webmasters.readonly
Analytics 4    : https://www.googleapis.com/auth/analytics.readonly
```

**Connect Search Console in the app:**

1. Open the **Settings** page.
2. Click **Connect Google Search Console** — you'll be redirected to Google,
   returning to `${APP_URL}/gsc-callback`. Then pick the GSC property/site.

**Connect Analytics 4 in the app:**

1. Open the **GA4** page (`/app/ga4`).
2. Click **Connect Google Analytics 4** — you'll be redirected to Google,
   returning to `${APP_URL}/ga4-callback`. Then choose the GA4 property.

The resulting refresh tokens are stored **per store** in the database, not in
`.env`.

**PageSpeed (optional key).** Core Web Vitals audits call PageSpeed Insights,
which works **keyless but rate-limited**. To raise your quota:

1. In **Google Cloud Console → APIs & Services → Credentials → Create Credentials
   → API key**, then restrict it to the **PageSpeed Insights API**.
2. Set it in `.env`:

   ```dotenv
   PAGESPEED_API_KEY=your-pagespeed-api-key
   ```

More detail: [docs/CONFIGURATION.md → Google](CONFIGURATION.md#google-search-console-analytics-4-pagespeed).

### 5c. Bing Webmaster

The in-app connection uses a **Bing Webmaster API key** that you paste into the
UI (stored per store in the database). This enables site info, crawl stats,
indexed pages, and rank/traffic stats.

**Get the API key:**

1. Verify your site in [Bing Webmaster Tools](https://www.bing.com/webmasters/).
2. Go to **Settings → API Access → Generate Key** and copy the key.

**Connect it in the app:**

1. Open the **Bing AI Performance** page (`/app/bing-ai`).
2. Under **Bing Webmaster Tools Connection**, paste your **API key** and your
   **site URL**, and save.

**Environment variables (optional).** The repo also ships a Microsoft Entra
OAuth code path for Bing, gated by these vars — but note the caveat below:

```dotenv
BING_OAUTH_CLIENT_ID=your-entra-app-client-id
BING_OAUTH_CLIENT_SECRET=your-entra-app-client-secret
BING_API_KEY=your-bing-api-key     # presence flag only (dashboard "Bing configured")
```

For that OAuth flow, the code builds the redirect URI `${APP_URL}/bing-callback`
and requests the scope `https://www.bing.com/webmasters/.default offline_access`.

> **Heads-up:** in the shipped app, the **working** way to connect Bing is the
> pasted **API key** above. The Entra OAuth flow exists in the codebase but is
> not wired to a callback route in the UI, so the API-key method is what you
> should use. `BING_API_KEY` in `.env` is only a dashboard presence flag — the
> key that actually talks to Bing is the one you paste in the UI.

More detail: [docs/CONFIGURATION.md → Bing Webmaster](CONFIGURATION.md#bing-webmaster-microsoft-entra-oauth).

### 5d. Pinterest

The in-app connection uses a **Pinterest access token** that you paste into the
UI (stored per store in the database). This enables the profile/boards/pins audit
and scheduled auto-posting; the audit also works without a token (Rich Pin markup
+ keywords from products).

**Get the access token:**

1. Create an app in the
   [Pinterest Developer portal](https://developers.pinterest.com/apps/).
2. Generate an access token and grant these scopes:

   ```
   boards:read  boards:write  pins:read  pins:write  user_accounts:read
   ```

**Connect it in the app:**

1. Open the **Pinterest SEO** page (`/app/pinterest`).
2. Under **Pinterest Business Account Connection**, paste your **access token**
   and save.

**Environment variables (optional).** The repo also ships a Pinterest API v5
OAuth code path, gated by these vars — but note the caveat below:

```dotenv
PINTEREST_CLIENT_ID=your-pinterest-app-id
PINTEREST_CLIENT_SECRET=your-pinterest-app-secret
```

For that OAuth flow, the code builds the redirect URI
`${APP_URL}/pinterest-callback` and requests the scopes
`boards:read,boards:write,pins:read,pins:write,user_accounts:read`.

> **Heads-up:** in the shipped app, the **working** way to connect Pinterest is
> the pasted **access token** above (with the same scopes granted at token
> creation). The v5 OAuth redirect flow exists in the codebase but is not wired
> to a callback route in the UI, so use the token-paste method.

More detail: [docs/CONFIGURATION.md → Pinterest](CONFIGURATION.md#pinterest-api-v5-oauth).

### 5e. IndexNow

Nothing to obtain and **no environment variables**. The app self-generates a
32-hex key per store, stores it in the database, and serves it at `/{key}.txt` as
ownership proof; URLs are then submitted to Bing/Copilot/Yandex.

**Enable it in the app:**

1. Open the **SEO Settings** page.
2. Turn on the **IndexNow** toggle (and, optionally, the auto-submit options for
   products / articles / collections).

More detail: [docs/CONFIGURATION.md → IndexNow](CONFIGURATION.md#indexnow).

---

## What this app does **not** integrate

To set expectations (and so you don't go looking for settings that aren't there):

- **No payment processor / billing integration.** Plans exist only as a static
  catalog for feature-gating — there is no Stripe/checkout/webhook billing and no
  billing environment variables. (The shipped legal pages mention "Stripe" as
  boilerplate; edit them to match your actual setup.)
- **No courier / shipping integration.**

See [docs/CONFIGURATION.md → Billing](CONFIGURATION.md#billing) for the details.

---

## You're set

With a store connected, an Anthropic key in place, and any optional integrations
added, you can kick off the SEO engine:

1. Make sure background jobs are wired up — set a strong `CRON_SECRET` and point
   your scheduler at the job endpoints (see
   [docs/INSTALLATION.md → Cron / background jobs](INSTALLATION.md#10-cron--background-jobs)).
2. From the SEO dashboard, queue a product sync for your active store and watch
   the pipeline (SYNC → EXTRACT → ENRICH → TAG → TAXONOMY) progress.

For the full environment reference and every redirect URI/scope in one place,
see **[docs/CONFIGURATION.md](CONFIGURATION.md)**.
