/**
 * Sends a test drop alert to every browser a person has turned drop alerts on in:
 *   npx tsx scripts/send-test-push.ts you@example.com
 * Uses DATABASE_URL and the VAPID keys from the environment (.env.local or Vercel's). It's a
 * test: it ignores the one-a-day limit and doesn't record a send.
 */
import 'dotenv/config';
import postgres from 'postgres';
import webpush from 'web-push';

async function main() {
  const email = process.argv[2];
  const { DATABASE_URL, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!email) throw new Error('Usage: npx tsx scripts/send-test-push.ts <email>');
  if (!DATABASE_URL || !NEXT_PUBLIC_VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY)
    throw new Error('Set DATABASE_URL, NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.');
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:hello@offone.com.au',
    NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
  const db = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const subs = await db<{ endpoint: string; p256dh: string; auth: string }[]>`
      select s.endpoint, s.p256dh, s.auth from public.push_subscriptions s
      join public.users u on u.id = s.user_id
      where lower(u.email) = lower(${email}) and s.disabled_at is null`;
    if (!subs.length) console.log(`No drop alerts turned on for ${email}.`);
    for (const s of subs) {
      const res = await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({
          title: 'Off One',
          body: 'New from Halde Studio: Butter silk slip',
          url: '/discover',
          tag: 'test',
        }),
      );
      console.log(`${new URL(s.endpoint).host}: ${res.statusCode}`);
    }
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
