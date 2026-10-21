# Phone app: what was built

Everything below `md` (768px) is the app shell in `components/app`. Desktop markup is unchanged and
hidden with `max-md:hidden`; phone screens render in `md:hidden` wrappers on the same routes.

## Route map

| Route                         | Phone screen                                  | Desktop                                               |
| ----------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| `/`                           | Home (pills, hero, rails, endless feed)       | unchanged                                             |
| `/explore`                    | Explore (search, filters, categories)         | redirects to `/search`                                |
| `/explore?q=…` or `?filter=…` | Results (pushed, chips, sort)                 | redirects to `/search`                                |
| `/discover`                   | Discover grid                                 | unchanged                                             |
| `/products/[slug]`            | Product (gallery, size sheet, buy bar, story) | unchanged                                             |
| `/inbox`                      | Inbox (Chats / Notifications)                 | the desktop inbox                                     |
| `/messages/[id]`              | Chat (pushed)                                 | unchanged                                             |
| `/bag`                        | Bag with Express Checkout and "Order placed"  | unchanged                                             |
| `/checkout`                   | Checkout (pushed)                             | unchanged                                             |
| `/you`                        | You (Likes / Orders / Sizes) and the menu     | redirects to `/account`                               |
| `/api/mode?to=studio\|shop`   | Switches mode (cookie `oo_mode`)              | same                                                  |
| `/studio`                     | Studio Today                                  | unchanged dashboard                                   |
| `/studio/orders`              | Orders (To start / Making / To ship / Done)   | unchanged                                             |
| `/studio/orders/[id]`         | Order detail with steps and the ship sheet    | redirects to `/studio/orders?order=…`                 |
| `/studio/new`                 | List a piece (Photos → Details)               | redirects to `/studio/listings/new`                   |
| `/studio/inbox`               | Requests and Chats                            | redirects to `/studio/requests` or `/studio/messages` |
| `/studio/inbox/requests/[id]` | Request with the quote and pass sheets        | redirects to `/studio/requests?id=…`                  |
| `/studio/shop`                | Shop (view as buyer, custom work, pieces)     | redirects to `/studio/listings`                       |
| `/studio/payouts`             | Payouts                                       | unchanged                                             |
| `/studio/settings`            | Desktop-only note with a link                 | unchanged                                             |

Desktop-only: `/studio/settings` (the phone shows a note that bulk editing, bank and tax details
and exports are easier on a computer, and still lets you do them), `/studio/analytics`, the full
listing editor and admin.

## Order statuses added

No new fulfilment statuses. `fulfilments.mto_step` grew from 0–3 to 0–4:

| mto_step | Label         | Buyer's line                              |
| -------- | ------------- | ----------------------------------------- |
| 0        | Order in      |                                           |
| 1        | Fabric bought | I've bought the fabric for your piece.    |
| 2        | Cutting       | I've started cutting your piece.          |
| 3        | Sewing        | Your piece is being sewn.                 |
| 4        | Finishing     | Your piece is finished and ready to send. |

Migration `0020_phone_app.sql` shifts existing rows (old Cutting/Sewing/Ready move up one) and adds
`custom_request_recipients.expiring_pushed_at` for the once-only "expires in 6 hours" push. It is
applied to production.

Custom (Have it made) orders keep their milestones: Order in → Fabric bought → Made → Shipped.
Ready-to-ship orders: Order in → Packed → Shipped.

## Config

- `SITE.app`: `phoneBreakpoint: 768`, `toastMs: 2200`.
- `SITE.shipping.auspostLabels: false`: the ship sheet shows "Prepaid label · Coming soon".
- `SITE.payouts.advanceOnMadeToOrder: false`: "Fabric bought" on a standard made-to-order order
  creates no advance; the quote sheet's advance line follows the flag.

## Not matched from the designs, and why

- The two design PNGs (`off-one-phone-app-buyers.png`, `off-one-phone-app-studio.png`) were not
  attached to the brief, so every screen was built from the brief's text. Spacing, type sizes and
  the exact composition of each screen are my reading of the descriptions.
- Prepaid Australia Post labels are a "Coming soon" option in the ship sheet (flag off, no API).
- Barcode scanning in the ship sheet uses the browser's BarcodeDetector where it exists (Chrome on
  Android); elsewhere the tracking number is typed.
- Edge-swipe back is only active when the app is installed (standalone), so it never fights the
  browser's own gesture.
- View Transitions slide only in browsers that support the API; others cut.

## Tests

- `e2e/phone-app.spec.ts` (project `phone-app`, 390×844, isMobile, hasTouch): 14 tests from the
  brief. The desktop check (test 13) runs in `phone-app-desktop` at 1440×900 against baselines
  captured from the commit before the phone work, so "unchanged" is measured, not assumed.
- Existing specs (smoke, returns, states, install, app-shell, discover, story, visual) were adapted
  to the phone screens where they run below 768px.
- Screenshots of every phone screen: `e2e/__screenshots__/phone-app/`.

## Results

| Suite                                                                               | Result                                  |
| ----------------------------------------------------------------------------------- | --------------------------------------- |
| `phone-app` (14 tests, 390×844)                                                     | 14 passed                               |
| `phone-app-desktop` (1440, baselines from pre-phone commit)                         | passed: home, product, Studio unchanged |
| `mobile-chromium` (smoke + returns on Pixel 7)                                      | 9 passed                                |
| `app-shell`, `discover`, `studio`, `states`, `install`, `story`, `have-it-made-390` | passed after the adaptations below      |
| `visual-390`, `visual-1280`                                                         | re-baselined (12 shots)                 |
| `vitest run`                                                                        | 320 passed                              |
| `tsc`, `next lint`, `prettier --check`                                              | clean                                   |

Spec changes that were not phone work: the empty-search link moved to `/have-it-made` in the
Have it made bundle and three specs still expected `/custom`; the in-chat deposit-quote test
covered a flow that bundle removed; the 1280 visual baseline predated the brand rename. The
`visual-390` baselines now show the app shell, which is the intended change.

Two real findings the tests turned up and that are fixed: the "New makers" cover links on Home
had no accessible name, and the Studio step button could submit twice while a save was in
flight.
