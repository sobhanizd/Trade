# Security & privacy

## What is deliberately absent

- No exchange account connections, no exchange API keys, no order or withdrawal
  endpoints, no wallet connections, no seed phrases or private keys. The schema
  has no tables for any of these.
- All market-data endpoints used are public and unauthenticated.
- The AI explainer has no tools and cannot take actions.

## Authentication & sessions

- Single owner account created from the CLI (`npm run user:create`); there is no
  public sign-up.
- Passwords: argon2id (19 MiB, t=2), minimum 12 characters.
- Sessions: 256-bit random token in an `HttpOnly`, `SameSite=Lax` cookie
  (`__Host-` prefixed and `Secure` in production). Only an HMAC-SHA256 of the
  token is stored. Sliding 30-day expiry; expired sessions are purged hourly.
- Login throttling: 5 failed attempts per IP per 15 min and 10 per account per
  hour (successful logins are not counted). Unknown emails take the same time
  and return the same message as wrong passwords.
- Password change revokes all other sessions; sessions can be listed and revoked.
- Credential forms (login, password change, account deletion) use POST, and the
  login button stays disabled until the page is interactive, so credentials can
  never end up in a URL (covered by an end-to-end test).

## Request handling

- Every API route goes through one wrapper (`src/lib/api/handler.ts`): session
  validation, **Origin check** on state-changing requests (CSRF defence beyond
  SameSite), per-IP rate limiting, 64 KB body limit, zod input validation, and
  generic error messages (internals are logged, not returned). Database outages
  map to HTTP 503.
- Authorisation: every query is scoped to the authenticated user's id.
- Security headers: CSP (`default-src 'self'`, no third-party scripts,
  `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `nosniff`, strict
  Referrer-Policy, restrictive Permissions-Policy, COOP, and HSTS in production.
  CSP allows inline scripts because Next.js injects inline bootstrap code; moving
  to nonces is a possible hardening step.
- External links use `rel="noopener noreferrer nofollow"`; RSS links are limited
  to http(s); headline text is HTML-stripped and length-limited.

## Secrets

- Only in server environment variables; validated at startup (`src/lib/env.ts`)
  and reported by name only. A build scan confirmed no secret values in the client
  bundle. The Settings page shows only whether an integration is configured.
- Structured logs redact keys named like password/secret/token/key/authorization
  and Telegram-bot-token / Anthropic-key shaped values.
- IP addresses are stored only as HMAC hashes (audit and session metadata).

## AI & untrusted content

- The AI receives stored analysis JSON and headline titles wrapped in an
  `UNTRUSTED_HEADLINES` block with instructions to ignore embedded instructions.
- The system prompt forbids inventing data, overriding signals, recommending
  trades, leverage or discussing credentials. Answers are labelled as AI output;
  the deterministic signal page remains authoritative.

## Data rights

Account → export all your data as JSON (no password hash or session tokens), or
delete analysis data / the entire account (password + typed confirmation).

## Production checklist

- [ ] HTTPS only (Caddy in `docker-compose.yml` handles certificates)
- [ ] Long random `SESSION_SECRET`, `POSTGRES_PASSWORD`; `.env` mode `600`
- [ ] Database port not exposed publicly (compose keeps it internal)
- [ ] `APP_URL` set to the exact public origin
- [ ] Nightly backups enabled and a restore tested ([OPERATIONS.md](OPERATIONS.md))
- [ ] OS & image updates applied regularly; `npm audit` reviewed on updates
- [ ] SSH key-only access and a firewall allowing only 22/80/443

## Reporting

This is a personal project. If you find a vulnerability, fix it and redeploy;
rotate `SESSION_SECRET` and API keys if exposure is suspected.
