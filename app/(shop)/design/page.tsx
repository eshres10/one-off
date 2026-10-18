import { notFound } from 'next/navigation';
import { Wordmark } from '@/components/ui/Wordmark';
import { Button, BoxButtonGroup, boxButtonClass } from '@/components/ui/Button';
import { Pill, Swatch } from '@/components/ui/Pill';
import { ProductBadgePill, StatusPill } from '@/components/ui/Badge';
import { Accordion, InfoPanel } from '@/components/ui/Panels';
import { TrustList } from '@/components/ui/TrustList';
import { EmptyState } from '@/components/ui/EmptyState';
import { Stars } from '@/components/ui/Stars';
import { Field, FormAlert, Input } from '@/components/ui/Field';
import { MakerStrip } from '@/components/maker/MakerByline';
import { ReviewCard } from '@/components/product/Reviews';
import { EditorialTile, ProductCard, ProductGridSkeleton } from '@/components/product/ProductCard';
import { Img as Image } from '@/components/ui/Img';

export const metadata = { title: 'Design system', robots: { index: false } };

const COLOURS = [
  ['--ground', '#F6F4F0', 'Page background'],
  ['--surface', '#FFFFFF', 'Inputs, lifted cards'],
  ['--stone', '#EEEAE3', 'Info panels'],
  ['--line', '#E2DED7', 'Hairlines'],
  ['--line-strong', '#CFCAC2', 'Pill and input borders'],
  ['--ink', '#111111', 'Text, primary, selected'],
  ['--text-2', '#2F2C29', 'Secondary body'],
  ['--muted', '#4A4743', 'Supporting copy'],
  ['--muted-2', '#6B6762', 'Labels, meta (lightest text allowed)'],
  ['--disabled', '#9C978F', 'Sold-out variants'],
  ['--error-bg', '#F5E3DE', 'Moderation / validation bg'],
  ['--error', '#6E2A1C', 'Moderation / validation text'],
];

const card = {
  id: 'demo',
  previewOnly: false,
  slug: 'rosalind-wrap-dress',
  title: 'Rosalind Wrap Dress',
  priceCents: 27500,
  productType: 'made_to_order' as const,
  makerName: 'Marlowe Atelier',
  makerSlug: 'marlowe-atelier',
  makerCity: 'Melbourne',
  imageUrl: '/seed/products/rosalind-wrap-dress-1.svg',
  imageAlt: 'Rosalind Wrap Dress in scarlet, front view',
  leadTimeDays: 20,
  colours: ['Scarlet', 'Cobalt'],
  badges: ['made_to_order' as const],
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-ink py-10">
      <h2 className="mb-6 text-[34px] leading-none">{title}</h2>
      {children}
    </section>
  );
}

/** Living style guide — development only. */
export default function DesignPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <div className="container-page pt-12">
      <p className="eyebrow">Development only</p>
      <h1 className="mt-2 text-[64px] leading-none">Design system</h1>

      <Section title="Logo">
        <div className="flex flex-wrap items-end gap-10">
          <Wordmark />
          <Wordmark size="mobile" />
          <Wordmark size="footer" />
          <span className="bg-ink px-6 py-4 text-ground">
            <Wordmark size="footer" />
          </span>
          <Wordmark variant="stacked" className="!h-[96px]" />
          <span className="bg-ink p-4 text-ground">
            <Wordmark variant="stacked" className="!h-[64px]" />
          </span>
        </div>
      </Section>

      <Section title="Colour">
        <ul className="grid grid-cols-2 gap-[2px] md:grid-cols-4">
          {COLOURS.map(([name, hex, use]) => (
            <li key={name} className="border border-line bg-surface">
              <span className="block h-16" style={{ background: hex }} />
              <span className="block p-3 text-[12px]">
                <span className="block font-normal">{name}</span>
                <span className="block text-muted-2">
                  {hex} · {use}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type">
        <p className="font-display text-[clamp(64px,9vw,136px)] leading-[0.92]">Hero display</p>
        <p className="mt-4 font-display text-[56px] leading-none">Section title 56</p>
        <p className="mt-2 font-display text-[44px] italic leading-none">Stay connected</p>
        <p className="mt-6 text-[14px]">Body — Jost 300, 14/1.5. Short, plain, confident.</p>
        <p className="mt-2 text-[11px] uppercase tracking-label">Label — Jost 400, 11px, 0.16em</p>
        <p className="eyebrow mt-2">Eyebrow / meta in muted-2</p>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <a href="#" className="text-link">
            Text link
          </a>
        </div>
        <div className="relative mt-6 h-40 overflow-hidden">
          <Image
            src="/seed/editorial/hero.svg"
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <BoxButtonGroup>
              <a href="#" className={boxButtonClass()}>
                Shop the edit
              </a>
              <a href="#" className={boxButtonClass()}>
                Meet the makers
              </a>
            </BoxButtonGroup>
          </div>
        </div>
      </Section>

      <Section title="Pills, swatches, badges">
        <div className="flex flex-wrap gap-2">
          <Pill>10</Pill>
          <Pill pressed>12</Pill>
          <Pill soldOut>14</Pill>
          <Pill pressed>
            <Swatch colour="#22252B" size={14} /> Ink
          </Pill>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 bg-stone-light p-4">
          <ProductBadgePill badge="ready_to_ship" />
          <ProductBadgePill badge="made_to_order" />
          <ProductBadgePill badge="one_of_one" />
          <ProductBadgePill badge="low_stock" />
          <ProductBadgePill badge="made_to_order" outlined />
          <StatusPill status="paid" />
          <StatusPill status="shipped" />
          <StatusPill status="refunded" />
        </div>
      </Section>

      <Section title="Glass">
        <div className="relative h-48 overflow-hidden">
          <Image
            src="/seed/editorial/race-day.svg"
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
          <div className="glass-light absolute inset-x-0 top-0 flex h-16 items-center justify-center">
            <Wordmark size="footer" />
          </div>
          <div className="absolute bottom-6 left-6">
            <span className="glass-dark inline-flex min-h-[52px] items-center px-6 text-[11px] uppercase tracking-[0.2em]">
              Glass dark
            </span>
          </div>
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid gap-[2px] md:grid-cols-4">
          <ProductCard product={card} saved={false} />
          <ProductCard
            product={{
              ...card,
              badges: ['ready_to_ship', 'low_stock'],
              productType: 'ready_to_ship',
            }}
            saved
          />
          <div className="md:col-span-2">
            <EditorialTile
              tile={{
                kicker: 'The edit',
                title: 'Wedding guest, but not boring',
                cta: 'Shop the edit',
                href: '#',
                imageUrl: '/seed/editorial/race-day.svg',
              }}
              className="h-full"
            />
          </div>
        </div>
      </Section>

      <Section title="Panels and lists">
        <div className="grid gap-10 md:grid-cols-2">
          <div className="space-y-6">
            <InfoPanel>
              <span className="block text-ink">Made to order — production takes 14 days</span>
              Dispatch by Mon 2 Nov · Estimated delivery 4 – 6 Nov
            </InfoPanel>
            <MakerStrip
              maker={{
                slug: 'marlowe-atelier',
                displayName: 'Marlowe Atelier',
                avatarUrl: '/seed/makers/marlowe-atelier-avatar.svg',
                location: 'Brunswick, VIC',
                rating: 4.9,
                reviewCount: 38,
                responseTimeHours: 6,
              }}
            />
            <TrustList shipsFrom="Marlowe Atelier, Melbourne" />
            <div>
              <Accordion title="Description" open>
                Cut on the bias so it skims rather than clings.
              </Accordion>
              <Accordion title="Garment measurements">Bust 92 cm</Accordion>
            </div>
          </div>
          <div className="space-y-6">
            <ReviewCard
              review={{
                id: 'r',
                rating: 5,
                title: 'Fits like it was made for me',
                body: 'The silk is heavier than I expected.',
                createdAt: new Date(),
                buyerName: 'Ava',
                productTitle: 'Bias-cut slip dress',
                variantLabel: 'AU 10',
              }}
            />
            <Stars rating={4} count={12} />
          </div>
        </div>
      </Section>

      <Section title="Forms">
        <div className="grid gap-10 md:grid-cols-2">
          <div className="space-y-5">
            <p className="eyebrow">Editorial</p>
            <Field label="Occasion" name="d-occ">
              <Input name="d-occ" look="line" placeholder="Wedding guest" />
            </Field>
            <Field label="Bust" name="d-bust" error="Enter a number between 50 and 200">
              <Input name="d-bust" look="line" defaultValue="abc" />
            </Field>
          </div>
          <div className="space-y-5">
            <p className="eyebrow">Utility</p>
            <Field label="Email" name="d-email" hint="We’ll send your receipt here.">
              <Input name="d-email" placeholder="you@example.com" />
            </Field>
            <FormAlert message="Email addresses can’t be shared in messages." />
            <FormAlert tone="success" message="Saved." />
          </div>
        </div>
      </Section>

      <Section title="Empty and loading">
        <EmptyState
          title="No pieces match those filters yet."
          action={<Button variant="secondary">Explore new arrivals</Button>}
        >
          Try removing a filter or explore new arrivals.
        </EmptyState>
        <div className="mt-8">
          <ProductGridSkeleton count={4} />
        </div>
      </Section>
    </div>
  );
}
