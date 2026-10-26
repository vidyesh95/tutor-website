# Lesson Library

A fast, mobile-first lesson library for a tutor. Students browse ordered courses, search, watch YouTube lectures, and download PDF notes without an account. The tutor manages everything from a password-protected `/admin`.

Astro 7 (server output) on Cloudflare Workers · D1 (lessons, FTS5 search) · R2 (PDFs) · Tailwind 4.

Design and platform decisions: [`docs/design-brief.md`](docs/design-brief.md). Product context: [`PRODUCT.md`](PRODUCT.md).

## Forking into your own Cloudflare account

The repo is wired to the original owner's Cloudflare resources. A fork must create its own D1 database and R2 bucket, otherwise deploys and backups point at someone else's data.

1. **Cloudflare account**
   - Sign in at dash.cloudflare.com and enable R2 once (Storage & databases > R2 object storage). It needs a card on file even on the free plan.
   - `npx wrangler login` in the fork's folder.
2. **Create the database and bucket**
   ```sh
   npx wrangler d1 create tutor-db
   npx wrangler r2 bucket create tutor-pdfs
   ```
   `d1 create` prints a `database_id`. Keep it.

   **Verify (remote):**
   ```sh
   npx wrangler d1 list                  # tutor-db appears, with the id printed in step 2
   npx wrangler r2 bucket list           # tutor-pdfs appears
   ```
   If `d1 create` says the name is taken, pick another name (for example `tutor-db-yourname`), then update `database_name` in `wrangler.jsonc` and in the backup workflow (`d1-backup.yml`, which has `tutor-db` hardcoded).
3. **Point the repo at your database.** In `wrangler.jsonc`, replace the `database_id` under `d1_databases` with the one from step 2. The current value belongs to the original owner. Leave `database_name` (`tutor-db`) and the bucket name (`tutor-pdfs`) as they are, unless you chose different names in step 2.
4. **Secrets for the deployed Worker**
   ```sh
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put SESSION_SECRET            # openssl rand -hex 32
   ```

   Use `wrangler secret put` as shown. Cloudflare's Secrets Store isn't needed, and `.dev.vars` is only for local development (`cp .dev.vars.example .dev.vars`).
5. **Schema and first deploy**
   ```sh
   npx wrangler d1 migrations apply tutor-db --remote
   npx wrangler d1 execute tutor-db --remote --command "SELECT slug, label FROM tracks ORDER BY position"
   pnpm install
   pnpm deploy
   ```

   The `execute` line must list five rows (class-10 through pro). An error like `no such table: tracks` means the migration didn't run against the remote database. Check the `database_id` in `wrangler.jsonc`.

   After deploy, confirm the site responds:
   ```sh
   curl -sI https://tutor-website.<your-subdomain>.workers.dev/ | head -1   # HTTP/2 200
   ```
   Your workers.dev subdomain is shown on the Workers & Pages page of the dashboard. The deploy output also prints the URL.
   Then open `/admin`, sign in, and add your standards, subjects, and lessons. The standards table starts with the five seeded ones (Class 10, 11, 12, Engineering, Professionals).
6. **GitHub (the fork)**
   - Forks have GitHub Actions turned off. Open the fork's Actions tab and enable them, otherwise the weekly backup never runs.
   - Settings > Secrets and variables > Actions, add:
     - `CLOUDFLARE_ACCOUNT_ID`: your account ID (dashboard sidebar).
     - `CLOUDFLARE_API_TOKEN`: create at dash.cloudflare.com > My Profile > API Tokens, with **D1: Edit** and **Workers R2 Storage: Edit** for your account.
   - Run the "D1 backup" workflow once from the Actions tab (`workflow_dispatch`) to confirm it uploads to `tutor-pdfs/backups/`.
7. **Backup retention (once)**
   ```sh
   npx wrangler r2 bucket lifecycle add tutor-pdfs expire-d1-backups backups/ --expire-days 85
   ```
8. **Optional**: set `CF_BEACON_TOKEN` as a var if you use Cloudflare Web Analytics.

Local development uses its own empty database and bucket (see below), so none of this touches production. Local data lives in `.wrangler/state/` and is git-ignored.

## Local development

```sh
pnpm install
cp .dev.vars.example .dev.vars        # set ADMIN_PASSWORD and SESSION_SECRET (openssl rand -hex 32)
npx wrangler d1 migrations apply tutor-db --local
astro dev --background                # http://localhost:4321, admin at /admin
```

To wipe local D1 and R2 emulation data and start clean (stop the dev server first):

```sh
rm -rf .wrangler/state
npx wrangler d1 migrations apply tutor-db --local
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
