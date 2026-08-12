# Installing Kimono SEO with Claude Code

The fastest way to self-host Kimono SEO is to let **[Claude Code](https://claude.com/claude-code)** —
Anthropic's agentic command-line assistant — install it for you directly on your server.
You connect Claude to your machine, point it at this repository, and it walks through the whole
setup, asking you for **your own** API keys and secrets as it goes.

> **You always bring your own credentials.** Claude never needs — and you should never give it —
> keys committed to the repo. When Claude asks for a value (database password, Anthropic key,
> Shopify secret, …), you paste your own. Nothing secret is ever committed to git.

---

## Prerequisites

- A Linux server (VPS) you can SSH into, with `sudo` access.
- **Node.js ≥ 20.19** and **PostgreSQL 14+** (Claude can install these for you if missing).
- A [Claude Code](https://claude.com/claude-code) login (Claude subscription or an Anthropic API key).

## Step 1 — Install Claude Code on the server

SSH into your server and install the CLI:

```bash
npm install -g @anthropic-ai/claude-code
```

Then authenticate (follow the prompts):

```bash
claude
```

> Prefer to keep Claude on your laptop? You can also run Claude Code locally and give it SSH
> access to the server. Running it *on* the server is simplest for a first install.

## Step 2 — Get the code

```bash
git clone https://github.com/danielbirtas/kimono-seo.git
cd kimono-seo
claude
```

## Step 3 — Let Claude install it

Paste this prompt into Claude Code (it's already in the project directory):

```
I've cloned Kimono SEO into this directory. Install and run it on this server by
following docs/INSTALLATION.md and docs/CONFIGURATION.md:

1. Check prerequisites (Node.js >= 20.19, PostgreSQL). Tell me what's missing before changing anything.
2. Create a PostgreSQL database and a dedicated DB user for the app.
3. Copy .env.example to .env, then go through EVERY variable with me. Ask me for each value I must
   provide (my own API keys, DB URL, APP_URL, SESSION/CRON secrets). Never put real secrets in git.
4. Install dependencies, generate the Prisma client, and run the database migrations.
5. Build the app and start it (use PM2 if it's available, otherwise `npm run start`).
6. Seed the initial admin account and give me the login URL.

Explain each command before you run it, and stop and ask me if anything fails.
```

Claude will run the steps, pausing whenever it needs a decision or a secret from you.

## Step 4 — Connect your integrations

Kimono SEO is **self-hosted and bring-your-own-keys**. After the app is running, you connect your
own accounts from the app UI and `.env`:

- **Shopify** app credentials (for OAuth) — the callback URL derives from your `APP_URL`.
- **Anthropic** and/or **OpenAI** keys for AI features.
- **DataForSEO**, **Google Search Console / GA4**, **Bing Webmaster**, **Pinterest** — all optional,
  each enabled by adding your own key/OAuth client.

See [`docs/CONFIGURATION.md`](CONFIGURATION.md) for where to obtain each one and which env var it maps to.

## Safety

- **Review before running.** Claude explains each command; read it before approving.
- **Keep `.env` private.** It's gitignored — never commit it or paste real secrets into issues/PRs.
- **Set `APP_URL`** to your server's public URL so OAuth redirects and emails point at *your* deployment.

---

Manual, step-by-step instructions (without Claude Code) are in [`docs/INSTALLATION.md`](INSTALLATION.md).
