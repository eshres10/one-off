import { redirect } from 'next/navigation';

/** The old single-maker request form moved to the guided brief, which starts from the piece. */
export default function CommissionPage({ searchParams }: { searchParams: { product?: string } }) {
  const id =
    searchParams.product && /^[0-9a-f-]{36}$/i.test(searchParams.product)
      ? searchParams.product
      : null;
  redirect(id ? `/have-it-made?source_listing_id=${id}` : '/have-it-made');
}
