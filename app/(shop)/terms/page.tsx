import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { RETURNS } from '@/lib/content/returns';
import { ProsePage, ProseSection } from '@/components/editorial/Prose';

export const metadata: Metadata = {
  title: 'Terms',
  description: `The terms for buying from independent makers on ${BRAND.name}, including returns and faults.`,
};

export default function TermsPage() {
  return (
    <ProsePage
      kicker="Legal"
      title="Terms"
      intro={
        <p className="bg-stone-light px-4 py-3 text-[13px]">
          [placeholder] These terms are a draft and must be reviewed by a lawyer before launch.
        </p>
      }
    >
      <ProseSection id="marketplace" title="The marketplace">
        <p>
          {BRAND.name} is the merchant of record for purchases made through checkout. Makers are
          independent businesses responsible for their products.
        </p>
      </ProseSection>

      {/* TODO: legal review before launch */}
      <ProseSection id="returns-and-faults" title="Returns and faults">
        <p>{RETURNS.policyBody}</p>
        <p>{RETURNS.faultBody}</p>
        <p>
          Report a problem from your order page within {RETURNS.reportWindowDays} days of delivery.
          If you and the maker can’t agree, {BRAND.name} will step in. You can still contact us
          after that window, and your rights don’t end when it closes. See{' '}
          <Link href="/returns" className="link">
            Returns &amp; faults
          </Link>{' '}
          for the full process.
        </p>
        <p>
          Nothing in these terms excludes, restricts or modifies any right or remedy you have under
          the Australian Consumer Law, including the consumer guarantees.
        </p>
      </ProseSection>

      <ProseSection id="consumer-rights" title="Your consumer rights">
        <p>Nothing in these terms limits your rights under the Australian Consumer Law.</p>
      </ProseSection>
    </ProsePage>
  );
}
