# Smoke Test — verify your Kimono SEO install actually works

A short, ordered checklist to confirm a fresh install is functional **end to
end**, from build to a real SEO pipeline run. Each step lists the **command or
click**, the **expected result**, and what it means if it fails. Do them in
order — later steps assume the earlier ones passed.

> Time: ~15 minutes (plus provider signup time if you don't already have keys).
> You bring your **own** keys. Use a **test/staging store** for the first run.

Legend: ✅ = expected pass · ⚠️ = common cause if it fails.

---

## 0. Prerequisites

- [ ] **Node.js 20 LTS** (or 22): `node -v` → `v20.x` or `v22.x`
- [ ] **PostgreSQL** reachable, and a database created for the app
- [ ] `.env` created from `.env.example` with, at minimum:
  - `DATABASE_URL` — your Postgres connection string
  - `SESSION_SECRET` — a long random string
  - `APP_URL` — your **public HTTPS** host (e.g. `https://seo.example.com`); for a
    pure local test `http://localhost:3000` is fine
  - `ANTHROPIC_API_KEY` — `sk-ant-…` (required for the AI pipeline; see
    [GETTING_STARTED §4](GETTING_STARTED.md#4-add-your-ai-keys))
  - *(optional now)* `ADMIN_EMAIL` / `ADMIN_PASSWORD` — override the seeded admin

✅ All present. ⚠️ Missing `DATABASE_URL`/`SESSION_SECRET` → the app won't boot.

---

## 1. Build, migrate, seed

```bash
npm ci
npx prisma generate
npm run db:migrate      # prisma migrate deploy — creates all tables
npm run seed            # creates the SUPER_ADMIN account
npm run build
```

- [ ] `npm ci` finishes without errors
- [ ] `npm run db:migrate` prints applied migrations (or "already in sync")
- [ ] `npm run seed` prints that the admin was created/updated
- [ ] `npm run build` ends with **built** (exit 0)

✅ All four succeed. ⚠️ `db:migrate` fails → check `DATABASE_URL` and that the DB
exists and is empty/compatible.

---

## 2. Start & reach the login page

```bash
npm run start          # serves on PORT (default 3000)
```

- [ ] Open `${APP_URL}` in a browser → you land on the **login page** (not an error)
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' ${APP_URL}/login` → `200`

✅ Login page renders. ⚠️ 502/blank → reverse proxy/TLS or `APP_URL` mismatch.

---

## 3. Log in as the seeded admin

- [ ] Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`
      (defaults `admin@kimonogroup.ro` / `KimonoSEO2026!` if you didn't override)
- [ ] You reach the dashboard — **no** "verify your email" wall

✅ You're in. The seeded admin is **pre-verified** and **SUPER_ADMIN**, so it
bypasses plan gating and reaches every module. ⚠️ Blocked at login → you seeded
before this fix; re-run `npm run seed`.

> **Now change the password** from the UI and never keep the default on a public
> server.

---

## 4. Connect a test store (Shopify)

Follow [GETTING_STARTED §3a](GETTING_STARTED.md#3a-shopify-recommended-one-click-oauth)
to create the Shopify app and set `SHOPIFY_CLIENT_ID/SECRET` (+ the matching
`SHOPIFY_API_KEY/SECRET`). Register the redirect
`${APP_URL}/api/shopify-oauth/callback` **exactly**.

- [ ] `/connect-store` → **Shopify** → enter `your-test-store.myshopify.com` →
      **Connect with Shopify**
- [ ] Approve on Shopify → you're redirected back and the store shows as **connected**

✅ Store connected, token stored. ⚠️ "redirect_uri mismatch" → the URL in the
Shopify app doesn't match `APP_URL` exactly (scheme/trailing slash).

> No Shopify app yet? Use the **manual token** path on the same tab (paste a
> `shpat_…` Admin API token) to smoke-test without OAuth.

---

## 5. Run the SEO pipeline (the real end-to-end check)

- [ ] From the dashboard, **queue a product sync** for the connected store
- [ ] Watch the pipeline advance: **SYNC → EXTRACT → ENRICH → TAG → TAXONOMY**
- [ ] At least one product gets AI-generated SEO output (title/tags/suggestions)

✅ This is the definitive "it works" signal — DB, store API, and AI are all wired
correctly. ⚠️ Stalls at ENRICH/TAG → check `ANTHROPIC_API_KEY` (and any
DataForSEO keys if you enabled that step).

---

## 6. (Optional) Background jobs

If you scheduled the cron/job endpoints (see
[INSTALLATION §10](INSTALLATION.md#10-cron--background-jobs)):

- [ ] `CRON_SECRET` is set and your scheduler calls the job endpoints with it
- [ ] A scheduled run appears in the job history

---

## Pass criteria

Steps **1–5 green = your install is functional end to end.** Step 6 confirms
unattended operation. If any step fails, the ⚠️ note points at the usual cause;
the full reference is [CONFIGURATION.md](CONFIGURATION.md).
