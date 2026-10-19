# One Off — independent Australian fashion marketplace (MVP)

Live domain: **[shoponeoff.com.au](https://shoponeoff.com.au)**

> Discover and buy original fashion made by independent Australian makers.

A mobile-first marketplace that **browses like Instagram and buys like a premium fashion store**: a visual discovery feed, product pages built for conversion, maker profiles with follows, structured “Ask the maker” messaging, a concierge custom-commission pilot, and Stripe Connect marketplace payments with per-maker payouts.

The brand name, domain and support email live in `lib/brand.ts`.

---

## Quick start (one command)

Requirements: Node 20+, and PostgreSQL 16 binaries on your PATH (or `/usr/lib/postgresql/16/bin`, or Homebrew `postgresql@16`). No Docker, Stripe or Supabase account is needed for local development.

```bash
npm install && npm run local
```

`npm run local` starts a throwaway Postgres cluster in `./.pgdata` (port 54329), applies the migrations, generates placeholder images, seeds the database, and starts `next dev` on http://localhost:3000.

| Role   | Email                                                               | Password      |
| ------ | ------------------------------------------------------------------- | ------------- |
| Admin  | `admin@oneoff.test`                                                 | `password123` |
| Seller | `studio@halde-studio.test` (any `studio@<maker-slug>.test`)         | `password123` |
| Buyer  | `ava@buyer.test` (20 buyers: `charlotte@`, `mia@`, … `@buyer.test`) | `password123` |

Locally, payments use a **mock Stripe** (`/dev/checkout/...`) that sends correctly signed webhooks to the real webhook endpoint, and every email goes to an **outbox** you can read at **/admin/emails** (including magic sign-in links). Test card `4242 4242 4242 4242` pays; `4000 0000 0000 0002` declines.

### Useful scripts

| Command                                   | What it does                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                             | Next.js dev server                                                      |
| `npm run setup`                           | Start local Postgres, migrate, generate images, seed                    |
| `npm run db:migrate` / `npm run db:reset` | Apply migrations / drop + recreate the local DB                         |
| `npm run db:seed`                         | Idempotent seed (safe to run repeatedly)                                |
| `npm run lint`                            | ESLint + Prettier check                                                 |
| `npm run typecheck`                       | `tsc --noEmit` (strict)                                                 |
| `npm run test`                            | Unit + integration tests (Vitest, real Postgres + RLS)                  |
| `npm run build`                           | Production build                                                        |
| `npm run test:e2e`                        | Playwright smoke tests against a production build and a fresh seeded DB |

---

## Architecture

- **Next.js 14 App Router + TypeScript (strict)**, React Server Components for reads, Server Actions for mutations, Tailwind CSS. Fraunces (display) + Inter (UI).
- **PostgreSQL (Supabase)** accessed server-side with `postgres.js`. Migrations live in `supabase/migrations` and are Supabase-CLI compatible.
- **Row Level Security is the enforcement boundary.** User-scoped queries run through `withUser()` (`lib/db/index.ts`), which opens a transaction as the Supabase `authenticated` role with `request.jwt.claims` set — exactly how PostgREST applies RLS. Public catalogue reads use explicit `approved` filters; webhooks/admin use the service connection after a role check.
- **Adapters selected by environment** (`lib/env.ts`, Zod-validated):
  - Auth: `local` (bcrypt + signed cookie + magic links via outbox) or `supabase` (email/password + magic link via `@supabase/ssr`).
  - Payments: `mock` or `stripe` (`lib/payments`).
  - Email: `outbox` or `resend` (`lib/email`). All sends are recorded in `email_outbox`.
  - Storage: `local` (`.uploads/`, served by `/api/files`) or `supabase` (Storage bucket).
- **Pure domain logic** in `lib/domain` (cart totals, multi-maker splitting, commission, lead times, stock, review eligibility, message moderation) — unit tested.

```
app/(shop)      Discover feed, product, maker, collections, bag, checkout success, account, ask, commissions
app/(seller)    Seller dashboard: overview, orders, listings, messages, commissions, payouts, analytics, profile
app/(admin)     Admin: metrics, makers, listings, orders/refunds/disputes, collections & homepage, commissions, moderation, emails
app/api         Stripe webhook, uploads, local files, message polling
app/dev         Mock Stripe Checkout / Connect pages (PAYMENTS_DRIVER=mock only)
lib/            db, env, auth, payments, email, storage, domain, services, queries, actions, validation
supabase/       migrations (schema, RLS, functions) + local auth shim
scripts/        local Postgres, migrations, seed data, placeholder image generator
tests/          unit + integration (Vitest)       e2e/  Playwright smoke tests
```

See [`PLAN.md`](PLAN.md) for the full plan, schema notes and out-of-scope list.

### Payments model (Stripe Connect Express)

- The platform is merchant of record and uses **separate charges and transfers**: one Stripe Checkout payment per buyer order (so a multi-maker cart is one payment), then one **transfer per maker** with `transfer_group = order id` and `source_transaction = charge`. Destination charges can only pay one connected account, so they don’t fit multi-maker carts.
- **Commission:** 15% (`PLATFORM_FEE_BPS`) of item value, stored on every `order_item` and summed on each `fulfilment`. Shipping passes through to the maker who ships it. Maker transfer = items − commission + shipping.
- **Refunds:** full or partial per item from Admin → Orders. The refund is created in Stripe and the maker’s proportional share is reversed (`transfers.createReversal`).
- **Webhooks** (`/api/webhooks/stripe`): raw-body signature verification against the platform secret and the Connect secret; idempotent via `stripe_events`; checkout state is **re-fetched from Stripe** rather than trusted from the payload or browser. Handled: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, `account.updated`, `payout.failed` (+ `checkout.session.expired`).
- **Stock** is decremented atomically when the payment webhook lands; an oversold item (two buyers racing for the last unit) is refunded automatically and audited.
- Orders only become `paid` via the webhook. The success page polls the database until it does.

### Security notes

- RLS on every table; sellers can’t self-approve, feature listings, or edit platform-managed fields (enforced by triggers as well as policies). Reviews are only insertable for delivered items owned by the reviewer (trigger).
- Zod validation on client and server; user text sanitised and rendered as text only.
- Uploads: JPEG/PNG/WebP only, verified by file signature, ≤ 8 MB, authenticated.
- Postgres-backed rate limits for auth, messaging, reviews, commission requests, uploads and checkout.
- Message moderation blocks emails, phone numbers, bank details, external links and off-platform payment requests (flagged for review at Admin → Moderation).
- Secrets are server-only (never `NEXT_PUBLIC_`). Production refuses to boot with mock payments or local auth unless `ALLOW_LOCAL_DRIVERS_IN_PRODUCTION=true`.
- Admin and payment events are written to `audit_events`; structured logging via `pino`.

---

## Environment variables

See [`.env.example`](.env.example). Key variables:

| Variable                                                                                 | Purpose                                                          |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `APP_URL`                                                                                | Public base URL (used for redirects, emails, Stripe return URLs) |
| `DATABASE_URL`                                                                           | Postgres connection string (Supabase transaction pooler, :6543)  |
| `AUTH_DRIVER`                                                                            | `local` or `supabase`                                            |
| `SESSION_SECRET`                                                                         | Local auth signing secret (32+ chars)                            |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Auth/Storage                                            |
| `STORAGE_DRIVER`, `SUPABASE_STORAGE_BUCKET`                                              | Image storage                                                    |
| `PAYMENTS_DRIVER`                                                                        | `mock` or `stripe`                                               |
| `STRIPE_SECRET_KEY`                                                                      | Stripe secret key (test: `sk_test_...`)                          |
| `STRIPE_WEBHOOK_SECRET` / `STRIPE_CONNECT_WEBHOOK_SECRET`                                | Signing secrets for the platform and connected-account endpoints |
| `EMAIL_DRIVER`, `RESEND_API_KEY`, `EMAIL_FROM`                                           | Transactional email                                              |
| `PLATFORM_FEE_BPS`                                                                       | Commission in basis points (default 1500)                        |
| `ADMIN_NOTIFICATION_EMAIL`                                                               | Receives dispute, commission and payout alerts                   |

---

## Stripe test-mode setup

1. Create a Stripe account (Australia) and stay in **Test mode**. Copy the secret key into `STRIPE_SECRET_KEY` and set `PAYMENTS_DRIVER=stripe`.
2. **Connect:** Dashboard → Connect → get started → choose **Express** accounts, platform country Australia. Complete the platform profile (marketplace).
3. **Wallets:** Settings → Payment methods → enable Apple Pay and Google Pay (Checkout shows them automatically on supported devices). For Apple Pay on your domain, add it under Payment method domains.
4. **Local webhooks** with the Stripe CLI:
   ```bash
   stripe listen \
     --forward-to localhost:3000/api/webhooks/stripe \
     --forward-connect-to localhost:3000/api/webhooks/stripe
   ```
   Put the printed `whsec_...` in `STRIPE_WEBHOOK_SECRET` (the CLI uses one secret for both; in production set `STRIPE_CONNECT_WEBHOOK_SECRET` separately).
5. **Production webhooks:** create two endpoints pointing at `https://<your-domain>/api/webhooks/stripe`:
   - _Your account_: `checkout.session.completed`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created` → `STRIPE_WEBHOOK_SECRET`
   - _Connected accounts_: `account.updated`, `payout.failed` → `STRIPE_CONNECT_WEBHOOK_SECRET`
6. Re-seed with `PAYMENTS_DRIVER=stripe` so seeded makers have no fake account ids, then sign in as a seller and use **Payouts → Set up payouts** to create a test Express account (use Stripe’s test onboarding values). Orders for makers without payouts set up are marked “transfer skipped” for admin follow-up.
7. Test cards: `4242 4242 4242 4242` (success), `4000 0000 0000 0002` (decline), `4000 0000 0000 0259` (dispute).

## Supabase setup

1. Create a Supabase project (region: Sydney). Copy the Project URL, anon key and service-role key into the env vars and set `AUTH_DRIVER=supabase`, `STORAGE_DRIVER=supabase`.
2. Apply the schema: `DATABASE_URL=<supabase connection string> npm run db:migrate` (or `supabase db push`). The local auth shim is skipped automatically when Supabase’s `auth.users` exists.
3. Storage: create a **public** bucket named `marketplace` (or set `SUPABASE_STORAGE_BUCKET`). Uploads are validated and written server-side with the service role.
4. Auth → URL configuration: set Site URL to `APP_URL` and add `APP_URL/auth/callback` to redirect URLs. Keep email confirmation on (guest orders are only linked to accounts with verified emails).
5. Optional seed: `AUTH_DRIVER=supabase npm run db:seed` creates the seed users through the Supabase Admin API.

## Email (Resend)

Set `EMAIL_DRIVER=resend`, `RESEND_API_KEY` and a verified `EMAIL_FROM` domain. Emails sent: order confirmation, maker new-order, shipped, delivered, new message, commission request/quote/status, seller invite, maker approved, listing decisions, magic links (local driver), dispute and payout-failure alerts.

## Preview mode (browse-only launch)

Put shoponeoff.com.au live before Stripe and Resend are connected. With `PREVIEW_MODE=true`:

- Shoppers can browse the feed, collections, makers and products, create an account, save pieces, follow makers and message makers.
- “Add to bag” becomes **Launching soon**, the bag icon is hidden, and the bag and checkout are switched off on the server (not just hidden).
- The mock Stripe pages and mock-signed webhooks return 404, so no fake orders can be created.
- Sellers can fill in their profiles and draft listings; “Set up payouts” shows a “coming soon” note until Stripe is connected.

**What you need:** one free Supabase project, used for the database, logins and photo storage. Stripe and Resend can wait.

1. Create a Supabase project (region: Sydney). Copy the **transaction pooler** connection string (port 6543) (Project settings → Database) and the URL, anon key and service-role key (Project settings → API).
2. Apply the schema once, either by pasting `supabase/production-setup.sql` into **SQL Editor** and clicking Run (one transaction; regenerate it with `scripts/build-production-sql.sh` after adding a migration), or with `DATABASE_URL="<connection string>" npm run db:migrate`.
3. Storage: create a public bucket named `marketplace` (JPEG/PNG/WebP, 8 MB limit). Auth → URL configuration: Site URL `https://shoponeoff.com.au`, redirect URL `https://shoponeoff.com.au/auth/callback`.
4. In Vercel set: `PREVIEW_MODE=true`, `APP_URL=https://shoponeoff.com.au`, `DATABASE_URL`, `AUTH_DRIVER=supabase`, `STORAGE_DRIVER=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Leave payments and email on their defaults.
5. Deploy, sign up on the site with your own email, then in the Supabase SQL editor run
   `update public.users set role = 'admin' where email = 'you@example.com';`
6. Invite makers from **Admin → Makers**. Supabase sends their invite email (its built-in sender is rate-limited, which is fine for a handful of makers). Other app emails are recorded at **Admin → Emails** until Resend is connected.

**Don’t run `npm run db:seed` against production** — it creates demo accounts with the password `password123`.

**At launch:** connect Stripe and Resend (sections above), then set `PREVIEW_MODE=false`.

## Going live on shoponeoff.com.au

The production URL is `https://shoponeoff.com.au` (apex). `www.shoponeoff.com.au` permanently redirects to it (`next.config.mjs`).

1. **Vercel domain:** Project → Settings → Domains → add `shoponeoff.com.au` and `www.shoponeoff.com.au` (set www to redirect to the apex).
2. **DNS at your .com.au registrar** (or move nameservers to Vercel):
   - `A` record for `@` → `76.76.21.21`
   - `CNAME` for `www` → `cname.vercel-dns.com`
     Vercel shows the exact values on the Domains page and issues the TLS certificate automatically.
3. **Environment:** `APP_URL=https://shoponeoff.com.au` (no trailing slash).
4. **Email (Resend):** add the domain `shoponeoff.com.au` in Resend and create the SPF, DKIM and DMARC DNS records it lists. Use `EMAIL_FROM="One Off <hello@shoponeoff.com.au>"`. Set up a mailbox or forwarding for `hello@shoponeoff.com.au` (support address in `lib/brand.ts`) and choose an `ADMIN_NOTIFICATION_EMAIL`.
5. **Supabase Auth:** Site URL `https://shoponeoff.com.au`; redirect URLs `https://shoponeoff.com.au/auth/callback` (keep `http://localhost:3000/auth/callback` for development). Optionally set a custom SMTP sender on the same domain.
6. **Stripe:** webhook endpoints at `https://shoponeoff.com.au/api/webhooks/stripe` (platform + connected accounts, see above); add `shoponeoff.com.au` under Settings → Payment method domains for Apple Pay / Google Pay; set the public business name to “One Off” and the website to `https://shoponeoff.com.au` (it appears on card statements, Checkout and Connect onboarding). Also set **Terms of service URL** (Settings → Public details) to `https://shoponeoff.com.au/terms`: Checkout requires buyers to accept it (`consent_collection`), and Stripe rejects the session if the URL isn’t set.

## Deploying to Vercel

1. Import the repo in Vercel (framework: Next.js). Build command `npm run build`.
2. Add the production environment variables (Supabase, Stripe live/test keys, Resend, `APP_URL`, `PAYMENTS_DRIVER=stripe`, `AUTH_DRIVER=supabase`, `STORAGE_DRIVER=supabase`, `EMAIL_DRIVER=resend`).
3. Run migrations against the Supabase database from CI or locally (`npm run db:migrate`).
4. Configure the two Stripe webhook endpoints on the deployed domain and add the domain to Apple Pay payment method domains.
5. Create the first admin: sign up, then `update public.users set role = 'admin' where email = '...'` in the Supabase SQL editor. Invite sellers from **Admin → Makers**.

---

## Returns policy and fault claims

- The policy text lives in `lib/content/returns.ts` and is used everywhere (product page, bag, checkout, emails, `/returns`, `/terms`, `/seller-terms`). `tests/unit/returns-copy.test.ts` fails if wording that suggests consumer guarantees are excluded appears anywhere.
- Buyers tick an acknowledgement in the bag; it is stored on the order (`returns_ack_at`, `returns_policy_version`) and in the Stripe session metadata.
- “Report a problem” is offered for 7 days after delivery. Photos go straight from the browser to the private `claims` storage bucket and are only served to the buyer, the maker and admins.
- Makers have 2 business days (Sydney time, weekends skipped, public holidays not) to reply. A daily Vercel Cron (`vercel.json`, 9am Sydney) escalates overdue claims; set `CRON_SECRET` (16+ characters) in Vercel so the job is authorised. The admin and seller claim pages also escalate on load.
- Database: run `supabase/updates/0006_returns.sql` in the SQL Editor on an existing project (new projects get it in `supabase/production-setup.sql`).

## Testing

- **Unit** (`tests/unit`): cart totals, multi-maker splitting, commission, lead times, stock, review eligibility, moderation.
- **Integration** (`tests/integration`, real Postgres + RLS + mock Stripe): ready-to-ship and made-to-order checkout through the webhook; multi-maker order → one order and per-maker fulfilments/transfers; webhook signature rejection and replay idempotency; unpaid sessions are never marked paid; partial refunds with transfer reversal; sellers can’t read or modify other sellers’ orders/products/threads or self-approve; buyers only see their own data; undelivered items can’t be reviewed (service and database); commission requests email the maker; “Ask the maker” threads keep product context and block off-platform contact.
- **E2E** (`e2e/`, Playwright, mobile viewport): browse feed → open product → add to bag → Stripe test checkout → order confirmation → “Ask the maker” message → seller logs in, sees the order and adds tracking.

`npm run test` uses a separate `marketplace_test` database; `npm run test:e2e` uses `marketplace_e2e`. Both are reset and seeded automatically.

## Known limitations (MVP)

- E2E runs against the mock Stripe driver. The real Stripe path is implemented (`lib/payments/stripe.ts`) and covered by the same webhook handler, but needs test keys to exercise end to end.
- One stock number applies to all sizes of a listing in the seller form (per-variant stock can be edited in the database).
- Editing an approved listing keeps it live; edits are logged (`listing.edited_after_approval`) for admin review.
- Messaging uses 5-second polling, not websockets (by design).
- Commission payments are manual (admin sends Stripe Payment Links).
