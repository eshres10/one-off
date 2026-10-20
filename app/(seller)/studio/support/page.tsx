import { requireSeller } from '@/lib/auth/session';
import { sendSupportAction } from '@/lib/actions/support';
import { supportThread } from '@/lib/services/support';
import { SupportComposer } from '@/components/support/SupportComposer';
import { SupportThread } from '@/components/support/SupportThread';

export const metadata = { title: 'Message Off One · Studio' };

const TOPICS: Record<string, { topic: string; prompt: string }> = {
  'list-for-me': {
    topic: 'List my first pieces',
    prompt:
      'Hi! Could you list my first pieces? Here are my photos and prices (attach a link to a shared folder):',
  },
};

export default async function SupportPage({ searchParams }: { searchParams: { about?: string } }) {
  const seller = await requireSeller();
  const messages = await supportThread(seller);
  const about = searchParams.about ? TOPICS[searchParams.about] : undefined;
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-[40px] leading-none md:text-[56px]">Message Off One</h1>
        <p className="mt-3 text-[14px] text-muted">
          Questions about your shop, an order or getting paid. A real person replies, usually within
          a day.
        </p>
      </div>
      <SupportThread messages={messages} mine="maker" />
      <SupportComposer
        action={sendSupportAction}
        hidden={about ? { topic: about.topic } : {}}
        defaultValue={about?.prompt}
        placeholder="Write to the Off One team"
      />
    </div>
  );
}
