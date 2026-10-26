# Lesson Library

A fast, mobile-first lesson library for a tutor. Students browse ordered courses, search, watch YouTube lectures, and download PDF notes without an account. The tutor manages everything from a password-protected `/admin`.

Astro 7 (server output) on Cloudflare Workers · D1 (lessons, FTS5 search) · R2 (PDFs) · Tailwind 4.

Design and platform decisions: [`docs/design-brief.md`](docs/design-brief.md). Product context: [`PRODUCT.md`](PRODUCT.md).

## Local development

```sh
pnpm install
cp .dev.vars.example .dev.vars        # set ADMIN_PASSWORD and SESSION_SECRET (openssl rand -hex 32)
npx wrangler d1 migrations apply tutor-db --local
astro dev --background                # http://localhost:4321, admin at /admin
```

## First deploy

```sh
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET            # rotating this signs the tutor out everywhere
npx wrangler d1 migrations apply tutor-db --remote
pnpm deploy
```

Optional:

- Cloudflare Web Analytics: add a `CF_BEACON_TOKEN` var to load the cookieless beacon.
- Backups: add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets for `.github/workflows/d1-backup.yml`, then set retention once:
  `npx wrangler r2 bucket lifecycle add tutor-pdfs expire-d1-backups backups/ --expire-days 85`
- Login rate limiting runs in D1 (5 failures per 15 minutes per IP). A Cloudflare WAF rule can sit in front later if the site moves to a custom domain.

## Commands

| Command | Action |
| :-- | :-- |
| `pnpm dev` | Dev server |
| `pnpm build` | Production build |
| `npx astro check` | Type-check |
| `pnpm lint` | oxlint |
| `node scripts/og-images.mjs` | Regenerate per-track Open Graph images |
| `npx drizzle-kit generate` | New migration after editing `src/db/schema.ts` |
