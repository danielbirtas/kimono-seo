# Contributing to Kimono SEO

Thanks for your interest in improving Kimono SEO. This guide covers running the project locally, the conventions used in the codebase, and how to submit issues and pull requests. Please also read the **[Contributor License Agreement](#contributor-license-agreement-cla)** section — a signed CLA is required before your contribution can be merged.

---

## Running locally for development

### Prerequisites

- **Node.js** `>=20.19 <22 || >=22.12` (see the `engines` field in `package.json`).
- A **PostgreSQL** database.
- An **Anthropic API key** (most AI features require it). Other integration keys (Shopify, Google/GSC/GA4, DataForSEO, Bing, Pinterest, PageSpeed, SMTP) are optional and only needed for the modules that use them — see [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your local environment file
cp .env.example .env    # then edit — see docs/CONFIGURATION.md
# Minimum for a dev boot: DATABASE_URL, ANTHROPIC_API_KEY

# 3. Apply the database schema
npm run db:migrate      # prisma migrate deploy
npm run seed            # creates the initial SUPER_ADMIN account

# 4. Start the dev server (React Router, HMR)
npm run dev
```

Useful scripts (from `package.json`):

| Script | Command | Purpose |
| --- | --- | --- |
| `npm run dev` | `react-router dev` | Local dev server with hot reload |
| `npm run build` | `react-router build` | Production build |
| `npm run start` | `react-router-serve ./build/server/index.js` | Serve the production build (honors `PORT`, default 3000) |
| `npm run lint` | `eslint …` | Lint the codebase |
| `npm run typecheck` | `react-router typegen && tsc --noEmit` | Generate route types and type-check |
| `npm run seed` | `node prisma/seed.js` | Seed the initial admin user |
| `npm run db:migrate` | `prisma migrate deploy` | Apply migrations |
| `npm run db:studio` | `prisma studio` | Browse the database |
| `npm run prisma` | `prisma` | Run any Prisma CLI command |

> Never commit real secrets. Use obvious placeholders in examples (e.g. `sk-ant-xxxx`, `GOCSPX-xxxx`, `changeme`).

---

## Project layout

Business logic lives in `*.server.js` modules under `app/lib/`; route loaders/actions live in `app/routes/`; the Prisma schema and seed live in `prisma/`.

```
app/
  routes/           file-based routes: pages (app.*.jsx) and API actions (api.*.js)
  lib/
    auth/           email/password auth, sessions, plan-guard
    seo/            the SEO engine and per-module server logic (*.server.js)
    integrations/   shopify/ and woocommerce/ platform adapters
    billing.js      static plan catalog (feature-gating only — no payment processor)
    plan-gate.server.js
  components/        React UI components
  db.server.js      Prisma client singleton
prisma/
  schema.prisma     data model
  seed.js           SUPER_ADMIN seeding + plan-limit reference
ecosystem.config.cjs  PM2 process config (production)
```

For the full component and data-flow breakdown, see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Coding conventions

These conventions are observed throughout the existing codebase — please follow them:

- **Server-only code uses the `*.server.js` suffix** (e.g. `session.server.js`, `plan-gate.server.js`, files in `app/lib/seo/`). This keeps server logic out of the client bundle. Do not import `*.server.*` modules into client components.
- **File-based routing** (`@react-router/fs-routes`): route files in `app/routes/` map to URLs by filename. Dots become path segments — e.g. `api.seo.job-status.js` → `/api/seo/job-status`, `app.onpage.jsx` → `/app/onpage`. UI pages use `app.*.jsx`; JSON API endpoints use `api.*.js`.
- **ESM modules** — the project is `"type": "module"`. Use `import`/`export`, not `require`.
- **Auth & gating** — enforce access with the existing helpers (`requireAuth` for user sessions, `CRON_SECRET` / `X-Cron-Secret` for cron/runner endpoints, and `plan-gate.server.js` for module gating). Do not roll your own.
- **Styling** — plain CSS (global stylesheet), no Tailwind. Icons come from `lucide-react`.
- **Linting/formatting** — run `npm run lint` before submitting; ESLint and Prettier configs are in the repo (`.eslintrc.cjs`, `.prettierignore`). Keep `npm run typecheck` clean.
- **Database changes** go through Prisma migrations (`prisma/schema.prisma` + a generated migration); do not hand-edit the database.

---

## Issues and pull requests

### Filing an issue

- Search existing issues first to avoid duplicates.
- Include: what you expected, what happened, steps to reproduce, and your environment (Node version, database, relevant env/integrations — **redact secrets**).
- For security-sensitive reports, contact the maintainer privately at **office@kimonogroup.ro** rather than opening a public issue.

### Submitting a pull request

1. Fork the repository and create a feature branch.
2. Make focused changes; keep unrelated refactors out of the PR.
3. Run `npm run lint` and `npm run typecheck`, and verify the app still builds (`npm run build`).
4. Write a clear PR description: what changed, why, and how to test it. Reference any related issue.
5. Ensure your **CLA** is signed (see below) — PRs cannot be merged without it.

---

## Contributor License Agreement (CLA)

**This is required.** Kimono SEO is **dual-licensed** (open-source AGPL-3.0 *and* a separate commercial license from Kimono Group — see [LICENSING.md](LICENSING.md)). To keep both licensing paths viable, every contributor must agree to a CLA before their contribution can be accepted.

By contributing, you agree that your contribution is:

1. **Licensed to the public under AGPL-3.0-only** (the project's open-source license); **and**
2. **Also licensed to Kimono Group with the right to relicense it under the commercial license** — i.e. you grant Kimono Group the right to include and distribute your contribution as part of commercially licensed builds of Kimono SEO.

You also confirm that you have the right to make the contribution (for example, that it is your own work or that you have permission from your employer).

> Without a signed CLA, a contribution **cannot** be included in the commercial builds, and therefore cannot be merged.

**Recommended automation:** we recommend wiring up the free [CLA Assistant](https://github.com/cla-assistant/cla-assistant) GitHub bot, which asks each first-time contributor to sign the CLA directly on their pull request and records the agreement automatically.

Questions about the CLA or licensing: **office@kimonogroup.ro** *(placeholder — the maintainer can change this)*.
