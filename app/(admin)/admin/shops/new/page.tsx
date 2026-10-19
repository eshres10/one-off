import { CreateShopForm } from '@/components/admin/ShopForms';

export const metadata = { title: 'Create shop' };

/** Prefilled from a waitlist maker (?name=&instagram=&email=). */
export default function NewShopPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const defaults = Object.fromEntries(
    ['name', 'instagram', 'email'].map((k) => [k, String(searchParams[k] ?? '').slice(0, 200)]),
  );
  return (
    <div>
      <h1 className="mb-6 text-[40px] leading-none md:text-[48px]">Create a shop</h1>
      <CreateShopForm defaults={defaults} />
    </div>
  );
}
