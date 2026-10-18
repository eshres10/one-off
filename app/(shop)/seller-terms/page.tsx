import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';
import { CLAIM_RESPONSE_BUSINESS_DAYS, RETURNS } from '@/lib/content/returns';
import { ProsePage, ProseSection } from '@/components/editorial/Prose';

export const metadata: Metadata = {
  title: 'Seller terms',
  description: `What independent makers agree to when selling on ${BRAND.name}, including handling faults.`,
};

export default function SellerTermsPage() {
  return (
    <ProsePage
      kicker="Legal"
      title="Seller terms"
      intro={
        <p className="bg-stone-light px-4 py-3 text-[13px]">
          [placeholder] These terms are a draft and must be reviewed by a lawyer before launch.
        </p>
      }
    >
      {/* TODO: legal review before launch */}
      <ProseSection id="returns-and-faults" title="Returns and faults">
        <p>
          Every maker on {BRAND.name} follows the same returns policy: {RETURNS.short} As a seller,
          you agree to:
        </p>
        <ul className="mt-3 list-disc pl-5">
          <li>
            not offer or promise change-of-mind returns to {BRAND.name} buyers outside {BRAND.name};
          </li>
          <li>
            respond to fault claims within {CLAIM_RESPONSE_BUSINESS_DAYS} business days, after which
            the claim is escalated to {BRAND.name};
          </li>
          <li>repair, replace or refund valid claims;</li>
          <li>
            accept that {BRAND.name} may refund a buyer and deduct the amount from your payouts;
          </li>
          <li>never tell buyers that faulty items are non-refundable.</li>
        </ul>
        <p>
          For custom and made-to-order pieces, the measurements and spec agreed with the buyer are
          saved with the order. If the finished piece doesn’t match them, you’ll alter it first; if
          an alteration can’t fix it, you’ll remake it or refund the buyer.
        </p>
        <p>{RETURNS.aclNote}</p>
      </ProseSection>
    </ProsePage>
  );
}
