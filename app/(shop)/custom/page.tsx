import { redirect } from 'next/navigation';

/** The old "Request a custom piece" form moved to the guided brief. */
export default function CustomPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = typeof searchParams.q === 'string' ? searchParams.q.trim().slice(0, 120) : '';
  redirect(`/have-it-made${q ? `?q=${encodeURIComponent(q)}` : ''}`);
}
