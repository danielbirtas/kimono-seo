# Installation

This guide walks you through installing and running **Kimono SEO** on your own
server, from prerequisites to first login. It is written for developers
self-hosting the app with their **own** API keys and credentials.

> All example domains below use `example.com` placeholders and all secrets are
> obvious placeholders (`sk-ant-xxxx`, `changeme`, ...). Replace them with your
> own values.

**Related docs:** [README.md](../README.md) ·
[docs/CONFIGURATION.md](CONFIGURATION.md) ·
[docs/ARCHITECTURE.md](ARCHITECTURE.md) ·
[docs/API.md](API.md) ·
[CONTRIBUTING.md](../CONTRIBUTING.md) ·
[LICENSING.md](../LICENSING.md) · [LICENSE](../LICENSE)

---

## 1. System requirements

| Component | Requirement | Notes |
|-----------|-------------|-------|
| Node.js | `>=20.19 <22 \|\| >=22.12` | From `engines` in `package.json`. Node 20 LTS (≥ 20.19) or Node 22 (≥ 22.12) are supported; Node 21 is **not**. `.npmrc` sets `engine-strict=true`, so an unsupported Node version will fail the install. |
| npm | Bundled with Node | `package-lock.json` is committed; use `npm ci` for reproducible installs. |
| PostgreSQL | 14 or newer recommended | Prisma 6 datasource (`provider = "postgresql"`). Any reasonably recent PostgreSQL (13+) works; test on 14/15/16. A managed Postgres (SSL) is fine — append `?sslmode=require` to `DATABASE_URL`. |
| Reverse proxy | Apache **or** nginx | Terminates TLS and proxies to the app port. See [§9](#9-reverse-proxy--tls). |
| Process manager | PM2 (optional) | Recommended for production. A template `ecosystem.config.cjs` is included. |
| Build tools | C/C++ toolchain | `bcryptjs` is pure-JS, but native deps may compile during `npm ci`. On Debian/Ubuntu: `apt-get install -y build-essential python3`. |
| Chromium libs | Shared libraries for headless Chromium | The app uses `puppeteer-core` + `@sparticuz/chromium` for headless rendering. The Chromium binary ships with `@sparticuz/chromium`, but the host still needs its runtime shared libraries. See [§1.1](#11-chromium-runtime-libraries). |
| OpenSSL | Present on host | Required by Prisma engines. The Docker image installs it explicitly (`apk add openssl`). |

### 1.1 Chromium runtime libraries

`@sparticuz/chromium` provides a Chromium binary, but that binary needs common
system libraries at runtime. On Debian/Ubuntu install:

```bash
sudo apt-get update
sudo apt-get install -y \
  ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
  libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libgbm1 \
  libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 \
  libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 \
  libxrandr2
```

> The list above covers the common Chromium runtime dependencies. If you
> already have a system Chrome/Chromium installed, these libraries are
> typically already present. If headless rendering fails, check the app logs
> for a missing `.so` file and install the corresponding package.

---

## 2. Get the code

```bash
git clone https://github.com/YOUR-ORG/kimono-seo.git
cd kimono-seo
```

> The repository folder is referred to as `kimono-bi` in some internal files,
> and the `package.json` name is `business-intelligence-ai` (legacy). These
> names do not affect installation.

---

## 3. Install dependencies

Use a clean, reproducible install from the committed lockfile:

```bash
npm ci
```

If you are iterating locally and intentionally changing dependencies, you can
use `npm install` instead. Because `.npmrc` sets `engine-strict=true`, npm will
refuse to install on an unsupported Node version — verify with `node -v` first.

---

## 4. Configure environment variables

Copy the example file and edit it:

```bash
cp .env.example .env
# then edit .env
```

At minimum you must set:

| Variable | Why |
|----------|-----|
| `DATABASE_URL` | PostgreSQL connection string (required by Prisma). |
| `APP_URL` | Public HTTPS base URL of this deployment; used to build email verify/reset links and Google OAuth redirect URIs. |
| `CRON_SECRET` | Shared secret protecting the background-job / cron endpoints. **Always set a strong value** — if unset the guard compares against an empty string. Generate one with `openssl rand -hex 32`. |
| `ANTHROPIC_API_KEY` | Required for all AI features (keyword discovery, taxonomy, audits, content, GEO, ...). |

Everything else — Shopify OAuth, Google (GSC/GA4/PageSpeed), DataForSEO, Bing,
Pinterest, OpenAI, SMTP, seeded admin — is documented in
[docs/CONFIGURATION.md](CONFIGURATION.md), which explains where to obtain each
key and how each integration is wired. `.env.example` is heavily commented and
marks each variable `[REQUIRED]` or `[OPTIONAL]`.

> **Note on `NODE_ENV`:** set `NODE_ENV=production` for production deployments.
>
> **Note on `SESSION_SECRET`:** sessions are DB-backed (opaque token in the
> `kimono_session` cookie), so there is no cookie-signing secret to configure.
> `SESSION_SECRET` is not read by the application code.

---

## 5. Create the database

Create a PostgreSQL role and database, then point `DATABASE_URL` at it. Example
using `psql` as a superuser:

```sql
CREATE ROLE kimono WITH LOGIN PASSWORD 'changeme-strong-password';
CREATE DATABASE kimono_seo OWNER kimono;
```

Corresponding `DATABASE_URL` in `.env`:

```dotenv
DATABASE_URL=postgresql://kimono:changeme-strong-password@localhost:5432/kimono_seo?schema=public
```

For a managed provider that only exposes port 443/SSL, use the provider's
pooled/SSL endpoint and append `?sslmode=require`.

---

## 6. Run Prisma (schema + migrations + seed)

The repository ships committed migrations under `prisma/migrations/`, so the
recommended path for a fresh production database is **`migrate deploy`** (this
is also exposed as `npm run db:migrate`).

```bash
# 1. Apply all committed migrations to the database
npm run db:migrate          # alias for: prisma migrate deploy

# 2. Generate the Prisma client (needed to build/run)
npx prisma generate

# 3. Seed the SUPER_ADMIN account
npm run seed                # alias for: node prisma/seed.js
```

> **Alternative — `db push`:** if you want to sync the schema without using the
> migration history (e.g. a throwaway/dev database), run
> `npx prisma db push`. Note the included **Dockerfile uses `db push`, not
> `migrate deploy`** (see [§10](#10-docker)). For a durable production database
> with an auditable migration history, prefer `migrate deploy`.

### The seeded admin account

`npm run seed` runs `prisma/seed.js`, which upserts a single `SUPER_ADMIN`
user from these (optional) environment variables:

| Variable | Default | Meaning |
|----------|---------|---------|
| `ADMIN_EMAIL` | `admin@kimonogroup.ro` | Admin login email. |
| `ADMIN_PASSWORD` | `KimonoSEO2026!` | Admin password (bcrypt-hashed at seed time). |
| `ADMIN_NAME` | `Kimono Admin` | Display name. |

**Set `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` in `.env` before seeding a
production database**, then log in and change the password from the UI. The
`SUPER_ADMIN` role bypasses plan/feature gating.

---

## 7. Build the app

```bash
npm run build          # react-router build
```

This produces the server bundle at `build/server/index.js` and client assets
under `build/`.

---

## 8. Run in production

The start script serves the built bundle with `react-router-serve` on `PORT`
(default `3000`):

```bash
npm run start          # PORT=${PORT:-3000} react-router-serve ./build/server/index.js
```

Override the port with an env var:

```bash
PORT=8080 npm run start
```

### 8.1 Running under PM2 (recommended)

A PM2 config template is included as `ecosystem.config.cjs`. It runs
`@react-router/serve` in cluster mode.

> **SECURITY WARNING — do NOT hardcode secrets in `ecosystem.config.cjs`.**
> The file in the repo history contained inline env values for illustration.
> **Do not commit real secrets.** Instead, keep all secrets in `.env` and let
> the app read them from the process environment. The template below does
> **not** embed any secrets — PM2 launches the process, and your `.env` (loaded
> into the environment) supplies the configuration.

Load `.env` into the environment before starting PM2, for example:

```bash
# Export everything in .env into the current shell, then start PM2
set -a; . ./.env; set +a
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup      # follow the printed instructions to enable boot persistence
```

Secret-free `ecosystem.config.cjs` template:

```js
// ecosystem.config.cjs — PM2 config (NO SECRETS; env comes from .env / shell)
module.exports = {
  apps: [
    {
      name:      "kimono-seo",
      script:    "node_modules/@react-router/serve/dist/cli.js",
      args:      "./build/server/index.js",
      cwd:       "/opt/kimono-seo",          // absolute path to your checkout
      instances: 2,                          // or "max" for one per CPU
      exec_mode: "cluster",
      watch:     false,
      max_memory_restart: "768M",
      autorestart: true,
      restart_delay: 1000,

      // Only non-secret runtime values here. Everything sensitive
      // (DATABASE_URL, ANTHROPIC_API_KEY, CRON_SECRET, OAuth secrets, ...)
      // MUST come from .env / the process environment — never inline them.
      env: {
        NODE_ENV: "production",
        PORT:     "3000",
      },

      out_file:        "./logs/out.log",
      error_file:      "./logs/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
```

> Alternatively, use PM2's `--env` / ecosystem `env_file` patterns, or a
> systemd unit with `EnvironmentFile=/opt/kimono-seo/.env`. The key rule is the
> same: secrets live in `.env`, not in version-controlled config.

---

## 9. Reverse proxy + TLS

Terminate TLS at Apache or nginx and proxy to the app port (default `3000`).
Use your real hostname in place of `seo.example.com`.

### 9.1 nginx

```nginx
server {
    listen 80;
    server_name seo.example.com;
    # Redirect HTTP to HTTPS (certbot can also manage this).
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name seo.example.com;

    # Managed by certbot (see below), or point to your own certs.
    ssl_certificate     /etc/letsencrypt/live/seo.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seo.example.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;   # audits/AI calls can be slow
    }
}
```

### 9.2 Apache

Enable the proxy modules first:

```bash
sudo a2enmod proxy proxy_http ssl headers
```

```apache
<VirtualHost *:80>
    ServerName seo.example.com
    Redirect permanent / https://seo.example.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName seo.example.com

    SSLEngine on
    SSLCertificateFile    /etc/letsencrypt/live/seo.example.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/seo.example.com/privkey.pem

    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
    RequestHeader set X-Forwarded-Proto "https"
    ProxyTimeout 300
</VirtualHost>
```

### 9.3 TLS with Let's Encrypt (certbot)

```bash
# nginx
sudo certbot --nginx -d seo.example.com

# Apache
sudo certbot --apache -d seo.example.com
```

Certbot installs a renewal timer automatically; verify with
`sudo certbot renew --dry-run`.

> Make sure `APP_URL` (and `SHOPIFY_APP_URL`, if you use Bing/Pinterest OAuth)
> matches the **HTTPS** hostname you configured here — those values are used to
> build OAuth redirect URIs and email links.

---

## 10. Cron / background jobs

Background work is triggered by hitting `CRON_SECRET`-protected **GET**
endpoints. Most require the secret in an `X-Cron-Secret` header; two also accept
a `?s=` query parameter. All reject a **mismatched** secret with `401`, but only
four routes (`api.cleanup`, `api.ai-citations.runner`, `api.pinterest.scheduled-runner`,
`api.seo.cron.monitor`) also reject when `CRON_SECRET` is **unset**. The other four
(`api.seo.job-runner`, `api.seo.kick`, `api.seo.reconcile`, `api.seo.audit-resume`)
compare `header || ''` against `CRON_SECRET || ''`, so an **unset** `CRON_SECRET`
lets an empty/absent secret pass — always set a strong value.

| Endpoint | Purpose | Auth accepted |
|----------|---------|---------------|
| `/api/seo/job-runner` | Self-triggering batch processor (SYNC/EXTRACT/ENRICH/TAG/TAXONOMY). | `X-Cron-Secret` header |
| `/api/seo/kick` | Pipeline orchestrator; auto-applies taxonomy + queues next job per auto-pilot store. | `x-cron-secret` header **or** `?s=` |
| `/api/seo/reconcile` | Nightly Shopify ↔ local product reconcile. | `x-cron-secret` header **or** `?s=` |
| `/api/seo/audit-resume` | Resume stale RUNNING audit jobs. | `x-cron-secret` header |
| `/api/seo/cron/monitor` | Weekly per-store SEO monitor (GSC sync, anomalies, cannibalization, ...). | `X-Cron-Secret` header |
| `/api/cleanup` | Delete old `WebhookDedupe` and expired session rows. | `X-Cron-Secret` header |
| `/api/ai-citations/runner` | Trigger due scheduled AI-citation scans. | `X-Cron-Secret` header |
| `/api/pinterest/scheduled-runner` | Post due scheduled pins (self-triggers if batch full). | `X-Cron-Secret` header |

There is also a standalone Node script for the **weekly email digest**:

```bash
node scripts/cron-seo-digest.js
```

It reads `DATABASE_URL`, `APP_URL`, and the `SMTP_*` variables from the
environment and emails a digest to stores that have the weekly digest enabled.

### 10.1 Example crontab

Use the app's own hostname (or `http://127.0.0.1:3000` if cron runs on the same
host). Replace `changeme-long-random-cron-secret` with your real `CRON_SECRET`.

```cron
# m  h  dom mon dow   command
# Job runner — every 2 minutes (drains the SEO job queue)
*/2  *  *   *   *   curl -fsS -H "X-Cron-Secret: changeme-long-random-cron-secret" https://seo.example.com/api/seo/job-runner >/dev/null 2>&1

# Pipeline kick — every 10 minutes (?s= also works)
*/10 *  *   *   *   curl -fsS -H "X-Cron-Secret: changeme-long-random-cron-secret" https://seo.example.com/api/seo/kick >/dev/null 2>&1

# Pinterest scheduled pins — every 5 minutes
*/5  *  *   *   *   curl -fsS -H "X-Cron-Secret: changeme-long-random-cron-secret" https://seo.example.com/api/pinterest/scheduled-runner >/dev/null 2>&1

# AI-citation scans — hourly
0    *  *   *   *   curl -fsS -H "X-Cron-Secret: changeme-long-random-cron-secret" https://seo.example.com/api/ai-citations/runner >/dev/null 2>&1

# Resume stalled audits — every 15 minutes
*/15 *  *   *   *   curl -fsS -H "X-Cron-Secret: changeme-long-random-cron-secret" https://seo.example.com/api/seo/audit-resume >/dev/null 2>&1

# Nightly reconcile — 03:15
15   3  *   *   *   curl -fsS -H "X-Cron-Secret: changeme-long-random-cron-secret" https://seo.example.com/api/seo/reconcile >/dev/null 2>&1

# Cleanup old dedupe/session rows — 04:00
0    4  *   *   *   curl -fsS -H "X-Cron-Secret: changeme-long-random-cron-secret" https://seo.example.com/api/cleanup >/dev/null 2>&1

# Weekly SEO monitor — Mondays 06:00
0    6  *   *   1   curl -fsS -H "X-Cron-Secret: changeme-long-random-cron-secret" https://seo.example.com/api/seo/cron/monitor >/dev/null 2>&1

# Weekly digest email — Mondays 09:00 (script, not an endpoint)
0    9  *   *   1   cd /opt/kimono-seo && set -a && . ./.env && set +a && node scripts/cron-seo-digest.js >> logs/digest.log 2>&1
```

> The `?s=` form (for `/api/seo/kick` and `/api/seo/reconcile`) is handy when a
> scheduler cannot set headers, e.g.
> `https://seo.example.com/api/seo/kick?s=changeme-long-random-cron-secret`.
> Prefer the header form where possible so the secret does not appear in access
> logs.

---

## 11. Docker

A `Dockerfile` is included (base image `node:20-alpine`). It:

1. Installs `openssl` and `curl` (`apk add`).
2. Runs `npm ci`, then `npm run build` and `npx prisma generate`.
3. Prunes dev dependencies (`npm prune --production`).
4. On start, runs **`npx prisma db push --skip-generate`** and then serves the
   app with `react-router-serve`.

Build and run:

```bash
docker build -t kimono-seo .
docker run -d --name kimono-seo \
  --env-file .env \
  -p 3000:3000 \
  kimono-seo
```

> **Important — the container uses `prisma db push`, not `migrate deploy`.**
> On startup it syncs the current schema directly to the database rather than
> applying the committed migration history. This is convenient but does not
> record a migration history. If you want a controlled, auditable production
> database, run `prisma migrate deploy` yourself (see [§6](#6-run-prisma-schema--migrations--seed))
> and adjust your deployment accordingly.
>
> The Docker image does **not** run the seed step. Seed the admin user
> separately, e.g. `docker exec -it kimono-seo node prisma/seed.js` (with
> `ADMIN_*` set in the container environment).
>
> The image expects `PORT` to be set (the CMD echoes `STARTING_ON_PORT_$PORT`);
> pass it via `--env-file` / `-e PORT=3000`.

---

## 12. First run / smoke test

1. **Open the app** at your `APP_URL` (e.g. `https://seo.example.com`). You
   should see the login page.
2. **Log in as the seeded admin** using `ADMIN_EMAIL` / `ADMIN_PASSWORD`, or
   **register a new account** at `/register`. Registration sends an email
   verification link (`/verify/:token`) via SMTP — configure `SMTP_*` first, or
   log in with the pre-verified seeded admin to skip email.
3. **Connect a store.** From the app, go to the connect-store flow
   (`/connect-store`):
   - **Shopify (OAuth):** start the one-click install at
     `/api/shopify-oauth/install?shop=your-store.myshopify.com`. This requires
     `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` and a registered redirect
     URL. See [docs/CONFIGURATION.md](CONFIGURATION.md) — note the install route
     builds a callback URL that self-hosters must set to their own domain and
     register in the Shopify app.
   - **Shopify (manual token)** or **WooCommerce (consumer key/secret):** enter
     credentials directly on the connect-store page.
4. **Kick off the engine.** With a store connected, queue a product sync from
   the SEO dashboard (or hit `/api/seo/job-runner` with your `X-Cron-Secret`)
   and confirm jobs progress. If you set up the [crontab](#101-example-crontab),
   the runner drains the queue automatically.

### Quick health checks

```bash
# App is serving
curl -I https://seo.example.com/login

# Cron auth works (should NOT be 401 with the correct secret)
curl -fsS -H "X-Cron-Secret: <your CRON_SECRET>" \
  https://seo.example.com/api/cleanup
```

---

## 13. Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `npm ci` fails with an engine error | Node version outside `>=20.19 <22 \|\| >=22.12` (`.npmrc` has `engine-strict=true`). Install a supported Node. |
| Prisma cannot connect | Check `DATABASE_URL`, that the DB/role exist ([§5](#5-create-the-database)), and SSL settings for managed Postgres. |
| AI features error or skip | `ANTHROPIC_API_KEY` missing/invalid. See [docs/CONFIGURATION.md](CONFIGURATION.md). |
| Cron endpoints return `401` | `X-Cron-Secret` header does not match `CRON_SECRET`. Also set `CRON_SECRET` to a strong value — an empty/unset secret is insecure. |
| Headless rendering fails | Missing Chromium runtime libraries ([§1.1](#11-chromium-runtime-libraries)); install the missing `.so` package shown in logs. |
| Email verify/reset never arrives | `SMTP_*` not configured, or `APP_URL` wrong (links point to the wrong host). Seeded admin is pre-verified and needs no email. |
| Shopify OAuth callback mismatch | The install callback URL must match your domain and be registered in the Shopify app. See [docs/CONFIGURATION.md](CONFIGURATION.md). |

---

For the full list of environment variables and external service / OAuth setup,
continue to **[docs/CONFIGURATION.md](CONFIGURATION.md)**.
