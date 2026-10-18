import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * With Supabase Auth, refreshes the session cookie on each request (per @supabase/ssr docs).
 * The local auth driver needs no middleware. Authorisation itself happens server-side in each
 * page/action (requireUser/requireSeller/requireAdmin) and in Postgres RLS.
 */
export async function middleware(request: NextRequest) {
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
