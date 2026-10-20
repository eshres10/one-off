# Claude Code prompt — Off One: implement the design system and extend it across the site

Paste everything below the line into Claude Code, from the root of the repo. Put the PRD at `docs/PRD.md` first. If you export the design canvas as HTML (Share › Export), put the files in `docs/design-reference/` so Claude Code can open them.

---

You are building the front end of **Off One**, a mobile-first marketplace for independent Australian fashion makers. The product requirements are in `docs/PRD.md`, and that document is the source of truth for scope, data model, payments and testing. This prompt is the source of truth for **look, feel and UI patterns**. If `docs/design-reference/` exists, treat those HTML mockups as the visual reference and match them closely.

## How to work

1. Read `docs/PRD.md` and everything in `docs/design-reference/` before writing code. Summarise back the screens you will build and any conflicts you find between this prompt and the PRD. The PRD wins on behaviour; this prompt wins on visuals.
2. Build the **design system first**: tokens, fonts, then UI primitives. Add a living style guide at `/design`, visible in development only, that renders every token and component in every state.
3. Then build screens in the PRD milestone order. Every screen must work at **390px and 1280px** wide.
4. After each screen, take Playwright screenshots at 390×844 and 1280×800, look at them, and fix anything that doesn't match this spec before moving on. Don't claim a screen is done without looking at it.
5. Never silently decide anything listed under "Open decisions" in the PRD. Flag it and use a clearly labelled placeholder.
6. **Images:** the mockups contain third-party reference photos. Do not copy, download or ship them. Use local placeholder images (`/public/placeholders/`, neutral warm-grey 4:5 tiles with an alt text) or a deterministic placeholder service, as the PRD's seed-data section says.

## Brand

- **Name and wordmark:** "OFF ONE" (working name). Set it in **Bodoni Moda**, weight 500, uppercase, letter-spacing `-0.035em`, word-spacing `-0.08em`, line-height 1, with optical sizing on. Use 40px in the desktop header, 32px on mobile and 30px in footers. Build it as a `<Wordmark />` component; never type it ad hoc.
- **Feel:** premium, editorial, quiet. Think a high-fashion house's site, not Etsy, Amazon or a SaaS dashboard. Imagery carries the colour; the UI stays neutral.
- **Voice:** short, plain, confident. Labels in sentence case, rendered uppercase via CSS where the style calls for it. No exclamation marks, emoji or hype.

## Design tokens

Expose these as CSS variables in `app/globals.css` and map them into `tailwind.config.ts`.

### Colour

| Token                    | Value                 | Use                                                        |
| ------------------------ | --------------------- | ---------------------------------------------------------- |
| `--ground`               | `#F6F4F0`             | Page background (warm off-white)                           |
| `--surface`              | `#FFFFFF`             | Inputs, cards that need lift                               |
| `--stone`                | `#EEEAE3`             | Info panels (lead time, deposit notes, buyer protection)   |
| `--line`                 | `#E2DED7`             | Hairline dividers                                          |
| `--line-strong`          | `#CFCAC2`             | Unselected pill and input borders                          |
| `--ink`                  | `#111111`             | Text, primary buttons, selected states                     |
| `--text-2`               | `#2F2C29`             | Secondary body text                                        |
| `--muted`                | `#4A4743`             | Supporting copy                                            |
| `--muted-2`              | `#6B6762`             | Labels, meta, maker names on cards                         |
| `--disabled`             | `#9C978F`             | Sold-out variants (with strikethrough and a dashed border) |
| `--error-bg` / `--error` | `#F5E3DE` / `#6E2A1C` | Moderation and validation messages                         |

All text must meet WCAG AA. `--muted-2` on `--ground` is the lightest text allowed; never put body copy lighter than that.

### Type

Load fonts with `next/font/google`.

- **Bodoni Moda 500:** the wordmark only.
- **Instrument Serif 400, plus italic:** editorial display. Hero H1 `clamp(64px, 9vw, 136px)` with line-height 0.92. Section titles 40–56px. Product title 44–58px on desktop and 40px on mobile. Use italic for soft headings such as "Stay connected" and "Our fit promise".
- **Jost 300/400/500:** all UI and body. Body is 14px/1.5. Labels, nav, badges and buttons are 10–12px, uppercase, letter-spacing `0.14em–0.2em`.

### Shape, space and layout

- **Corners:** square, radius 0 everywhere except avatars, which are circles.
- **Lines:** 1px hairlines in `--line`. No drop shadows except the glass effects below.
- **Product images:** 4:5, `object-fit: cover`, top-anchored.
- **Grids:** edge-to-edge with **2px gaps** (MESHKI/Zara rhythm). Use `repeat(auto-fill, minmax(240px, 1fr))` on desktop and 2 columns on mobile.
- **Page gutters:** `clamp(16px, 3vw, 40px)`. Long-form content is capped at 1280px.
- **Tap targets:** 44px minimum. Visible focus rings: a 2px `--ink` outline with 2px offset.

### Glass effects

These are signature details; implement them as reusable utility classes.

- **`.glass-light` (header/nav):** `background-color: rgba(246,244,240,0.5)`, `backdrop-filter: blur(30px) saturate(120%)`, a fine grain overlay, a `1px rgba(255,255,255,0.45)` bottom border, and an inset highlight `inset 0 1px 0 rgba(255,255,255,0.5)` plus `0 8px 24px rgba(17,17,17,0.06)`.
- **`.glass-dark` (primary buttons and selected pills):** `background-color: rgba(17,17,17,0.82)`, the same blur and grain, a `1px rgba(255,255,255,0.14)` border, and a shadow of `inset 0 1px 0 rgba(255,255,255,0.16), 0 6px 18px rgba(17,17,17,0.18)`. Text is `--ground`.
- **Grain:** generate a 256×256 noise PNG at roughly 4% opacity, lightly blurred, into `/public/textures/grain.png`, tiled at 128px. It must read as smooth matte, never gritty.
- Provide a `prefers-reduced-transparency` fallback: solid `--ground` or solid `--ink`.

## Components

Build these in `/components/ui` and show each in `/design`.

- **Header:** a black announcement strip (11px uppercase, tracked), then a sticky `.glass-light` nav.
  - **Desktop:** links on the left (Discover, Collections, Makers, Following), the wordmark centred, and Search, Saved, Log in and Bag (n) on the right.
  - **Mobile:** menu button, centred wordmark, bag icon.
  - **Over a hero:** the header overlays it, using a negative top margin on the hero so the blur shows.
- **Hero:** a full-bleed image with a `rgba(0,0,0,0.28)` wash. It has a centred serif headline, a small uppercase kicker, and two adjoining white box buttons with a 1px gap (Jost, uppercase, tracked).
- **Buttons:**
  - **Primary:** `.glass-dark`, 52–56px tall, 11–12px uppercase, letter-spacing `0.18–0.2em`.
  - **Secondary:** a 1px `--ink` outline on a transparent background.
  - **Text link:** underlined with a 4–6px offset.
  - **White box:** for use on imagery.
- **Pill / option button:** 44px tall, a 1px `--line-strong` border, and the `.glass-dark` look when `aria-pressed="true"`. Sold out is disabled, dashed and struck through. Options are always buttons, never dropdowns, as the PRD requires.
- **Product card:**
  - A 4:5 image with a badge top-left: an ink label on a 92% `--ground` chip, 10px uppercase. Badges are Ready to ship, Made to order, One of one or Low stock.
  - A 44px save heart top-right.
  - Below the image: title left and price right at 13px, then the maker in `--muted-2` linking to the maker profile, then optional colour swatches as 10px squares.
- **Editorial tile:** spans 2×2 in the grid, with an image, a bottom gradient, an uppercase kicker, a 48px serif line and an underlined call to action. Insert one about every 8 products.
- **Filter bar:** a hairline top and bottom with uppercase triggers and ▾. Desktop opens popovers; mobile opens a bottom sheet behind a "Filter" pill plus horizontally scrolling quick chips. Filters follow the PRD: category, size, price, colour, maker location, availability and lead time.
- **Feed tabs:** For you, New this week, Following and Collections, in Instrument Serif at 30px desktop and 22px mobile. The active tab is underlined and the rest are `--muted-2`.
- **Maker strip:** avatar, name, location, ★ rating (count) and "Usually replies within X hours". Use it on the product page, in threads and in the bag.
- **Info panel:** `--stone` background with a 14–16px pad, for lead time, delivery range, condition notes and deposit notes.
- **Accordion:** native `<details>` with uppercase summaries, a "+" and hairline separators.
- **Trust list:** small line icons (1.3px stroke) with one line each: secure checkout, buyer protection, ships from [maker].
- **Review card:** a top border in `--ink`, stars, a serif title, a 13px body, "Verified buyer · size" meta, and the maker's reply in a `--stone` box.
- **Form fields:**
  - **Editorial forms** (measurements, commission brief): bottom-border-only inputs with an 11px `--muted-2` label above.
  - **Utility forms** (checkout email, dashboards): a boxed `--surface` input with a 1px `--line-strong` border.
- **Sticky mobile buy bar:** fixed to the bottom, ink or `.glass-dark`, showing the price in serif 22px, the selected variant at 11px, and a light "Add to bag" button.
- **Skeletons and empty states:** warm-grey blocks with no shimmer, or only a subtle one. Every empty state has one line of serif copy, one line of guidance and one outline button.

## Screens already designed (match the mockups)

- **Discover:** desktop and mobile, as specified above.
- **Product detail:** desktop and mobile.
  - Gallery: a desktop thumbnail rail and a mobile swipe carousel with 5 slots.
  - A maker strip, badge, title and price.
  - A `--stone` panel with the product type line and the dispatch and delivery dates.
  - Colour, size and (for made-to-order) length pills; the model's height and size worn.
  - "Add to bag", an "Ask the maker" outline button, and a "Request something similar" text link.
  - A trust list; accordions for description, garment details, measurements table, and shipping and returns.
  - Reviews, "More from [maker]" and "You may also like".
- **Maker profile:**
  - A full-bleed hero with the name in serif and a "Verified maker" line.
  - Three adjoining box buttons: Follow, Ask a question, Request a custom piece. The last only shows when commissions are enabled.
  - A stats row (rating, completed orders, response time, lead time), a story in large serif, and a facts list (process, materials, sizing, lead time, in person).
  - The product grid with an editorial tile, and reviews.
- **Bag:** grouped line items, each with "Ships from [maker]" and a per-item delivery estimate, quantity steppers (one-of-one capped at 1), subtotal, shipping and total, guest checkout, Apple Pay and Google Pay, and an empty state.
- **Ask the maker:** a product context bar, a buyer-protection note, the thread, the six preset question chips, image attach, and inline moderation that blocks emails, phone numbers, bank details and payment links.
- **Request a custom piece:** a three-step explainer (Send brief → Get a quote → Accept & pay), the maker and source product, garment type pills, occasion, deadline, budget pills, measurements and fit notes, fabric, colour, inspiration uploads (up to 6), notes, and "Send request".

## Extend the design to the rest of the site

Design and build these using the same tokens and components. No new colours, fonts or radii. Where a page has no mockup, compose it from existing components and keep the editorial rhythm: serif page title, uppercase kicker, hairlines, generous white space.

### Shopper pages

1. **Collections index and collection detail.** The index is a grid of 2×2 editorial tiles; the detail page has a hero, an intro and the filterable product grid.
2. **Search.** A full-screen glass overlay with recent and suggested searches, then a results grid with the filter bar. Use a serif line for "no results".
3. **Saved items** and **Following feed**, each with an empty state.
4. **Checkout handoff and order confirmation.** Stripe Checkout is hosted, so build the redirect state and a confirmation page: serif "Thank you", order number, a block per maker with "Ships from" and an estimate, and the next steps.
5. **Account:**
   - Sign-in and sign-up for buyers. These are optional, since guest checkout is the default.
   - Order history and order detail, with per-maker fulfilment status and tracking.
   - Saved measurements, with the bust, waist, hips and height fields from the PRD.
   - Messages inbox, and commission requests with a quote view where the buyer accepts or declines.
   - Leave a review, only for delivered items.
6. **Static and help pages:** About, How it works and buyer protection, Shipping, Returns and fit, Sell with us (an interest form; there is no public seller signup), Contact and help, Privacy and Terms. Use editorial layouts with a serif H1, a 2-column text measure on desktop and accordions for FAQs.
7. **System pages:** 404, 500, permission denied, and a maintenance state. One serif line, one sentence and a link home.

### Seller dashboard (`/seller`)

Use the same visual language but denser: Jost tables with hairline rows, serif page titles, `.glass-dark` primary actions, and status shown as small uppercase text badges, never coloured blobs.

- **Onboarding checklist:** profile, story, location, lead time, shipping, returns, Stripe Express, and admin approval.
- **Listings:** a table with thumbnail, status (draft, pending, approved, archived), stock and type, plus a listing editor. The editor has image slots (5+), pill-based variant setup, product type with the conditional fields from the PRD, garment details and a measurements table.
- **Orders:** fulfilment workflow, tracking entry and a packing slip with a print stylesheet.
- **Messages:** an inbox with product context and saved replies.
- **Commissions:** a request detail page and a structured quote form (total, deposit, production days, revisions, shipping, estimated delivery, message).
- **Payouts:** gross, commission, refunds and net, with a link to the Stripe Express dashboard.
- **Analytics:** a few simple numbers and one line chart. Keep it calm, not a SaaS dashboard.

### Admin (`/admin`)

Same visual language as the seller dashboard.

- Approval queues for makers and listings, with side-by-side preview.
- Collections manager with drag-to-reorder and hero image.
- Orders, refunds and disputes, including the evidence deadline.
- Commission requests, including manual assignment.
- Marketplace metrics: GMV, orders, take rate, active makers and listings, conversion, repeat rate and refund rate.
- Audit log.

## Accessibility and quality (non-negotiable)

- Semantic HTML: real `<button>`, `<a href>`, `<label>` and `<fieldset>`/`<legend>`. Use `aria-pressed` for option pills and `role="tablist"` for feed tabs.
- Descriptive alt text on every product image, generated from the title, colour and view. The decorative grain and washes are `aria-hidden`.
- Keyboard navigable, with visible focus, AA contrast and 44px targets. Respect `prefers-reduced-motion` and `prefers-reduced-transparency`.
- No intrusive popups and no app-download prompts.
- Run the PRD quality gates (`lint`, `typecheck`, `test`, `build`, `test:e2e`) and add Playwright visual snapshots at 390 and 1280 for Discover, Product, Maker, Bag, Ask the maker, Request a custom piece and the order confirmation page.

## Placeholders and decisions to flag

Show these as visible `[placeholder]` text or config, and list them in your summary:

- Shipping price, which is a PRD open decision. The mockups used a sample flat A$12 per maker.
- The ready-to-ship return window. The mockups assumed "exchange or return unworn within 14 days".
- Maker ratings, response times and review counts. These come from data; never hard-code them.
- Final brand name and trademark clearance. "Off One" is a working name.

When you finish each milestone, report what you built, show the screenshots, list any deviations from this spec and why, and list open questions.
