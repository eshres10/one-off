import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SURVEY_HOME, isSurveyHost } from '@/lib/survey/host';

/**
 * With Supabase Auth, refreshes the session cookie on each request (per @supabase/ssr docs).
 * The local auth driver needs no middleware. Authorisation itself happens server-side in each
 * page/action (requireUser/requireSeller/requireAdmin) and in Postgres RLS.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isSurveyHost(request.headers.get('host'))) {
    // Only the survey, its API, its share image and static files live on this host.
    if (
      pathname.startsWith('/api/survey') ||
      pathname.startsWith('/og/survey') ||
      pathname.startsWith('/_next') ||
      pathname === '/favicon.ico' ||
      pathname === '/favicon.svg' ||
      pathname.startsWith('/fonts/') ||
      pathname.startsWith('/brand/')
    )
      return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = '/survey';
    return NextResponse.rewrite(url);
  }
  // On the main site, /survey lives at its own address in production.
  if (
    (pathname === '/survey' || pathname.startsWith('/survey/')) &&
    process.env.NODE_ENV === 'production' &&
    !process.env.VERCEL_ENV?.startsWith('preview') &&
    /offone\.com\.au$/i.test((request.headers.get('host') ?? '').split(':')[0]!)
  ) {
    const to = new URL(SURVEY_HOME);
    to.search = request.nextUrl.search;
    return NextResponse.redirect(to, 308);
  }
  // Maintenance state: everything except the maintenance page, webhooks and static assets.
  if (
    process.env.MAINTENANCE_MODE === 'true' &&
    !request.nextUrl.pathname.startsWith('/maintenance')
  ) {
    return NextResponse.rewrite(new URL('/maintenance', request.url), { status: 503 });
  }
  // Pre-launch: the homepage shows the waitlist. Everything else (admin, login) still works.
  if (process.env.WAITLIST_MODE === 'true' && request.nextUrl.pathname === '/') {
    return NextResponse.rewrite(new URL('/waitlist', request.url));
  }
  const response = NextResponse.next({ request });
  if (process.env.AUTH_DRIVER !== 'supabase') return response;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) =>
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    },
  );
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|seed/|api/webhooks|favicon.ico).*)'],
};
