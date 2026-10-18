# PLAN — Australian independent-fashion marketplace MVP

## Context
`eshres10/one-off` is empty (no commits). The user wants the full MVP from their spec: a curated AU marketplace that browses like Instagram/Depop and buys like a premium fashion store. It needs a discovery feed, product pages, maker profiles, a multi-maker cart with Stripe Connect, product-context messaging, a concierge commission pilot, a seller dashboard, an admin area, RLS, seed data, and tests.

The container has no Stripe or Supabase credentials and no Docker daemon. It does have Node 22, npm registry access and PostgreSQL 16 binaries. **The user chose:** real Supabase/Stripe/Resend code paths for production, with local adapters (plain Postgres + mock Stripe + email outbox) so every quality gate runs here. They also chose to build the full spec, committing and pushing after each milestone to `claude/busy-curie-3qkq1a`.

## Key architecture decisions
- **Next.js 14.2 App Router, TS strict, Tailwind, Zod, ESLint + Prettier.** Fonts: Fraunces (serif display) + Inter (UI) via `next/font`.
- **DB access:** server-only `postgres` (postgres.js) client on `DATABASE_URL`. The same SQL works on Supabase Postgres and on local PG16. Migrations live in `supabase/migrations/*.sql` so they're Supabase-CLI compatible.
- **RLS enforced like Supabase:** user-scoped queries run in `withUser(userId, role, fn)`. That opens a transaction with `set local role authenticated` and `set_config('request.jwt.claims', …)`, so policies keyed on `auth.uid()` apply. Privileged work (webhooks, admin, seed) uses `withService()`.
  - Locally, `supabase/local/000_auth_shim.sql` creates what Supabase normally provides: the `auth` schema, `auth.users`, `auth.uid()` and the `anon`/`authenticated`/`service_role` roles. It only creates each one if it's missing.
- **Adapters selected by env** (`lib/adapters/*`):
  - **Auth:** `SupabaseAuth` handles email/password and magic link via `@supabase/ssr`. `LocalAuth` uses bcrypt rows in `auth.users`, a jose-signed httpOnly session cookie, and magic links written to the email outbox.
  - **Storage:** `SupabaseStorage` in production; `LocalStorage` (`public/uploads`) for local dev and tests.
  - **Payments:** `StripePayments` uses real Checkout and Connect Express. `MockPayments` serves a `/dev/checkout/[id]` page that imitates hosted Checkout. It then POSTs a correctly signed webhook (via `stripe.webhooks.generateTestHeaderString` and the local secret) to the **same** `/api/webhooks/stripe` handler, so webhook code is exercised identically.
  - **Email:** `ResendEmail` in production; `OutboxEmail` writes rows to `email_outbox` (shown at `/admin/emails`). Production also records every send in `email_outbox`.
- **Stripe model: separate charges and transfers.** Destination charges allow only one connected account per payment, but a multi-maker cart pays several. So there is one Checkout Session per order, with `transfer_group = order.id`.
  - On `checkout.session.completed`, the handler re-fetches the session and PaymentIntent from Stripe (it never trusts the client). It then creates one transfer per maker of `seller_net` (item subtotal − 15% + that maker's shipping), with `source_transaction = charge`.
  - Refunds (full or per item) call `refunds.create` and then `transfers.createReversal` for the affected maker's share.
  - Disputes are recorded and surfaced in admin.
  - Fee rate: `PLATFORM_FEE_BPS=1500`, applied to all three product types and stored per `order_item`.
- **Webhooks:** raw-body signature verification. Platform and Connect events use separate secrets (`STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`) and both route to `/api/webhooks/stripe` (the handler branches on `event.account`).
  - Idempotency: `stripe_events(id pk)` is inserted first, and a duplicate means a no-op. Processing happens in a single transaction.
  - Events handled: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, `account.updated`, `payout.failed`.
- **Stock:** validated when the cart is built and again at checkout creation. It is decremented in the webhook transaction with `update … where stock_quantity >= qty`. If an item has oversold, it is auto-refunded, flagged and audited.
- **Shipping:** each maker has shipping settings (`shipping_standard_cents`, `free_shipping_over_cents`, `dispatch_days`). Cart shipping is the sum of each maker group's shipping. AUD only, Australian addresses only (Checkout `shipping_address_collection: ['AU']`).
- **Rate limiting:** a Postgres fixed-window `rate_limits` table, which works on Vercel without Redis. It covers messages, reviews, commission requests and auth.
- **Moderation:** a pure `moderateMessage()` function using regex rules for emails, phone numbers (AU formats), BSB/account numbers, PayPal/PayID/bank keywords and external URLs.
  - Clean messages are sent; matching messages are blocked and saved with `is_flagged` and a reason.
  - The thread shows a warning banner.
- **Sanitisation:** all user-generated text (UGC) is stored as plain text and rendered as text (no `dangerouslySetInnerHTML`). It is also trimmed and has control characters stripped.
- **Logging:** a `pino` structured logger, an error boundary, and an `instrumentation.ts` hook. Sentry is enabled only when `SENTRY_DSN` is set.

## Folder structure (top level)
```
app/(shop)/            page.tsx (Discover: For You|New|Following|Collections tabs + filters)
  collections/[slug]  products/[slug]  makers/[slug]  makers/[slug]/commission
  bag/  checkout/success/  login/  account/{orders,saved,following,measurements,messages,reviews}
app/(seller)/seller/   onboarding, listings(/new,/[id]), orders(/[id], /[id]/packing-slip), messages, payouts, analytics
app/(admin)/admin/     makers, listings, orders, collections, commissions, emails, metrics
app/dev/checkout/[id]  (mock Stripe Checkout, only when PAYMENTS_DRIVER=mock)
app/api/               route handlers (below)
components/            ui/ (Button, Pill, Badge, Tabs, Sheet, Skeleton…), product/, maker/, feed/, cart/, messaging/, seller/, admin/
lib/                   db/, auth/, adapters/, domain/ (pure logic), validation/ (zod), queries/, actions/ (server actions), log.ts, rate-limit.ts
supabase/migrations/   0001_schema.sql 0002_rls.sql 0003_functions.sql ; supabase/local/000_auth_shim.sql
scripts/               db-setup.ts (create db + migrate), seed.ts, gen-seed-images.ts
public/seed/           deterministic generated SVG garment/maker images
tests/unit, tests/integration, e2e/
```

## Database
These are all the tables from the spec, with uuid primary keys, `created_at`/`updated_at` columns plus triggers, foreign keys, indexes on foreign keys, status and slug, and CHECK constraints. The constraints enforce three rules: `one_of_one ⇒ stock = 1`, `made_to_order ⇒ lead_time_days > 0`, and `rating between 1 and 5`.

**Additions to the spec's schema:**
- Maker shipping and return-policy columns on `makers`.
- `stripe_events` (webhook idempotency).
- `refunds`, `disputes`.
- `email_outbox`.
- `rate_limits`.
- `product_views` (analytics).
- `reply_templates` (seller saved replies).
- `editorial_placements` (homepage slots).
- `orders.status` covers `pending | paid | partially_refunded | refunded | failed | cancelled`.
- `order_items.fulfilment_status` covers `paid | preparing | shipped | delivered | cancelled | refunded`.
- `messages.flag_reason`.

**RLS** is enabled on every table.
- **Public read:** approved products, makers, collections and images.
- **Buyer-owned (rows where `auth.uid()` matches):** carts, orders, saved items, measurements and follows.
- **Message threads:** readable by the participants only, meaning the buyer or the maker's user.
- **Sellers:** CRUD on their own products. They can read `order_items` where they are the maker, and the parent `orders` through a security-definer helper.
- **Reviews:** insertable only through a policy that requires the `order_item` to be delivered and owned by the buyer, with uniqueness on `order_item_id`.
- **Admin:** via `is_admin()`.

## API routes / server actions
- **Server actions (in `lib/actions`) for form mutations:**
  - Cart: add, update and remove items.
  - Saving and following.
  - Measurements.
  - Sending messages and commission requests.
  - Quotes.
  - Listing CRUD: create, update, archive and duplicate.
  - Fulfilment: tracking, shipped and delivered.
  - Admin: approvals and collections.
- **Route handlers:**
  - `POST /api/checkout`: creates the order in pending state and returns the Checkout URL.
  - `POST /api/webhooks/stripe`
  - `POST /api/seller/stripe/onboard` (Express account + account link) and `GET /api/seller/stripe/dashboard` (login link).
  - `POST /api/uploads`: type and size checks — jpeg/png/webp only, 8 MB max.
  - `GET /api/messages/[threadId]?after=`: polling every 5s.
  - `POST /api/auth/*`
  - `POST /api/admin/emails/send`
  - `GET /api/feed`: cursor pagination with filters.

## Component list
- `components/ui`: Button/ButtonLink, SubmitButton, Field/Input/TextArea/Select/FormAlert, Badge/StatusPill, Stars, EmptyState, Img, icons
- `components/layout`: SiteHeader, SiteFooter, DashboardShell
- `components/feed`: FeedTabs, Filters · `components/editorial`: CollectionCard
- `components/product`: ProductCard/ProductGrid/ProductGridSkeleton, SaveButton, Gallery, PurchasePanel (pill variants + sticky mobile CTA), TrustBlock, Reviews
- `components/maker`: MakerByline, FollowButton
- `components/messaging`: Composer (preset chips, client moderation), ThreadView (polling), ThreadList, ContextCard, StartThreadForm, ProtectionNotice
- `components/forms`: AuthForms, CommissionForm, ImageUploader, PilotNotice
- `components/account`: OrderCard, ReviewForm, MeasurementsForm, QuoteCard
- `components/seller`: ListingForm, ProfileForm, FulfilmentActions, QuoteForm, Stat
- `components/admin`: CreateSellerForm, RefundForm, CollectionForm, ManualEmailForm

## Pure domain modules (unit-tested, `lib/domain`)
- `cart.ts`: totals and per-maker grouping and shipping.
- `split.ts`: multi-maker order splitting.
- `commission.ts`: integer-cent fee using banker's-safe rounding.
- `leadTime.ts`: dispatch and delivery ranges for made-to-order vs ready-to-ship, counting business days.
- `stock.ts`: stock checks and low-stock badges.
- `reviews.ts`: review eligibility.
- `moderation.ts`

## UI
- **Theme:** Tailwind tokens for off-white `#FAF8F5`, warm black `#1C1A17` and stone `#D9D3CA`.
- **Product cards:** 4:5 images using `next/image`, a save heart, and the maker name under the product name.
- **Loading and empty states:** skeleton image placeholders, and the empty-state copy given in the spec.
- **Product page:** a scroll-snap mobile carousel with desktop thumbnails, size and colour pill buttons (sold-out options shown struck through and disabled), and a sticky mobile CTA bar. The trust block sits under the CTA.
- **Accessibility:** focus-visible rings and semantic landmarks.
- **Brand:** "One Off" at shoponeoff.com.au, defined once in `lib/brand.ts`.

## Seed (`npm run db:seed`, idempotent)
- Seeded rows use deterministic UUIDv5 IDs and are upserted with `on conflict do update`.
- Images are deterministic SVGs (garment silhouettes on a varied palette) generated locally into `public/seed`, with no network calls.
- **Contents:**
  - 1 admin.
  - 12 approved makers across Melbourne, Sydney, Brisbane and Adelaide, each with a test Connect ID placeholder.
  - 72 products: 28 ready-to-ship, 32 made-to-order and 12 one-of-one, priced A$150–500 with a few outliers.
  - 6 collections.
  - 20 buyers.
  - Follows, saves and message threads, plus delivered orders with reviews.
- All passwords are `password123` (local only).

## Commands
- `npm run setup`: install, create the local DB, migrate and seed.
- `npm run dev`
- `lint`, `typecheck`, `test` (Vitest unit + integration against a fresh `marketplace_test` DB), `build`, and `test:e2e` (Playwright on `next build && next start` with mock drivers, using the pre-installed Chromium).
- Local PG is started via `scripts/pg-local.sh` (`initdb` + `pg_ctl` into `.pgdata`) when `DATABASE_URL` points to localhost and nothing is listening.

## Tests
- **Unit:** the seven domain areas in the spec.
- **Integration (real Postgres, real RLS, mock adapters):**
  - Ready-to-ship checkout and made-to-order checkout, each through the webhook.
  - A multi-maker cart producing 1 order and N maker groups, with the transfers recorded.
  - Seller A gets 0 rows for seller B's products and orders under `withUser`.
  - A review on an undelivered item is rejected (domain check and RLS).
  - A commission request creates an `email_outbox` row for the maker.
  - A duplicate webhook is a no-op.
  - A bad signature returns 400.
- **Playwright smoke:**
  1. Browse the feed.
  2. Open a product.
  3. Add to bag.
  4. Complete mock Stripe checkout.
  5. See the confirmation.
  6. Send an "Ask the maker" message.
  7. Seller logs in and sees the order.

The README will state that real Stripe test Checkout runs by setting `PAYMENTS_DRIVER=stripe` plus test keys. That path is code-complete but can't be exercised here without keys, and I'll report it that way.

## Milestones (each: lint/typecheck/test/build, then commit + push to `claude/busy-curie-3qkq1a`)
1. `PLAN.md` (the expanded version of this plan, including the out-of-scope list).
2. Scaffold: Next/TS/Tailwind/ESLint/Prettier/Vitest/Playwright, the env schema (`lib/env.ts`, Zod-validated, with server-only secrets), the logger and the local PG script.
3. Migrations, RLS, the auth shim, the seed and the image generator.
4. Auth adapters, the feed with filters and tabs, collections and maker profiles.
5. Product page, cart, checkout, the payments adapters, webhooks and Connect onboarding.
6. Orders and fulfilment, emails, reviews, admin (approvals, collections, orders/refunds/disputes, metrics, emails).
7. Messaging (chips, product context, attachments, moderation, polling) and the commission pilot (intake form, maker quote, admin assignment).
8. Seller dashboard: listings CRUD with approval gating, orders and packing slip, inbox and templates, payouts summary, analytics.
9. Tests, UI polish, README (setup, env vars, Stripe test setup including `stripe listen`, Supabase setup, Vercel deploy) and `.env.example`.

## Verification
- Run all five gates locally and paste a summary of the results.
- Manually smoke-test with `npm run dev` and Playwright screenshots at a mobile viewport (390px) and at desktop.
- Exercise the webhook directly: replay a signed event twice to confirm idempotency, and send a bad signature to confirm it's rejected.

## Out of scope
Native apps, real-time chat extras (typing indicators, read receipts, presence), offers/auctions, comments, AI features, virtual try-on, live shopping, self-serve seller signup, international features, subscriptions, automated commission checkout, a recommendation engine (For You is a simple editorial/featured + recency + follows heuristic), loyalty, and an admin CMS beyond collections and placements.
