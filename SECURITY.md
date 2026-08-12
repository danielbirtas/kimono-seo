# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in **Kimono SEO**, report it privately:

- **GitHub (preferred):** open the repository's **Security** tab → **"Report a vulnerability"** ([private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)).
- **Email:** office@kimonogroup.ro — subject `SECURITY — Kimono SEO`.

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce (a proof of concept if possible)
- The affected version / commit
- Any suggested remediation

We aim to acknowledge reports within **5 business days** and to share a remediation timeline after triage. Please allow a reasonable window to release a fix before public disclosure (coordinated disclosure).

## Supported Versions

This project is pre-1.0 and evolving. Security fixes land on the latest `main`. Pin a specific commit or tag if you need stability.

## Self-Hosting Responsibility

Kimono SEO is **self-hosted**: you supply your own API keys, database, and credentials. Securing your deployment is your responsibility:

- Keep your `.env` private and **never commit real secrets**.
- Rotate keys periodically and restrict database/network access.
- Run behind HTTPS and keep dependencies up to date.

See [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) for details.
