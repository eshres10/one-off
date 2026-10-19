import { redirect } from 'next/navigation';

/** Replaced by /sell/apply: makers apply, and sell once approved. */
export default function SellStartPage() {
  redirect('/sell/apply');
}
