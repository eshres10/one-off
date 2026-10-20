const NEW_HOST = 'offone.com.au';
const OLD_HOSTS = ['shoponeoff.com.au', 'www.shoponeoff.com.au'];

/**
 * Canonical domain: www goes to the apex. The old shoponeoff.com.au moves to offone.com.au only
 * once APP_URL says the site lives there, so switching APP_URL in Vercel (after connecting the
 * new domain) is what flips it. Until then the old domain keeps serving as it did.
 */
function domainRedirects() {
  let appHost = '';
  try {
    appHost = new URL(process.env.APP_URL ?? '').host;
  } catch {
    // Unset (local and test builds): no host redirects.
  }
  const to = (host) => ({
    source: '/:path*',
    has: [{ type: 'host', value: host }],
    destination: `https://${appHost}/:path*`,
    permanent: true,
  });
  if (appHost === NEW_HOST) return [`www.${NEW_HOST}`, ...OLD_HOSTS].map(to);
  if (OLD_HOSTS.includes(appHost)) return [to('www.shoponeoff.com.au')];
  return [];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
  experimental: {
    serverComponentsExternalPackages: ['pino', 'postgres', 'bcryptjs', 'sharp'],
    instrumentationHook: true,
  },
  async redirects() {
    return [
      // Content pages moved to their own addresses; old links keep working.
      { source: '/help/terms', destination: '/legal/terms', permanent: true },
      { source: '/terms', destination: '/legal/terms', permanent: true },
      { source: '/returns', destination: '/legal/returns', permanent: true },
      { source: '/seller-terms', destination: '/legal/seller-agreement', permanent: true },
      { source: '/help/privacy', destination: '/legal/privacy', permanent: true },
      { source: '/help/shipping', destination: '/legal/shipping', permanent: true },
      { source: '/help/about', destination: '/about', permanent: true },
      { source: '/help/how-it-works', destination: '/how-it-works', permanent: true },
      { source: '/help/returns-and-fit', destination: '/size-guide', permanent: true },
      { source: '/help/contact', destination: '/help#contact', permanent: true },
      // The maker dashboard moved from /seller to /studio.
      { source: '/seller', destination: '/studio', permanent: true },
      { source: '/seller/:path*', destination: '/studio/:path*', permanent: true },
      ...domainRedirects(),
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // SAMEORIGIN so the admin approval queue can preview a listing side by side.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
        ],
      },
    ];
  },
};

export default nextConfig;
