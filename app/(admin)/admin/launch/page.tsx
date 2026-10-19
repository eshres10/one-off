import { env } from '@/lib/env';
import { getLaunch } from '@/lib/site/launch';
import { LaunchForm } from '@/components/admin/LaunchForm';

export const metadata = { title: 'Launch' };

export default async function LaunchPage() {
  const launch = await getLaunch();
  return (
    <div>
      <h1 className="text-[40px] leading-none md:text-[48px]">Launch</h1>
      <p className="mb-8 mt-2 max-w-xl text-sm text-ink-muted">
        Before launch, keep the site in waitlist mode: makers can set up and go live, and buyers can
        browse, but nobody can check out yet.
      </p>
      <LaunchForm mode={launch.mode} opensOn={launch.opensOn} previewMode={env().PREVIEW_MODE} />
    </div>
  );
}
