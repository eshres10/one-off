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
    // Canonical domain: send www traffic to the apex.
    return [
      { source: '/help/terms', destination: '/terms', permanent: true },
      // The maker dashboard moved from /seller to /studio.
      { source: '/seller', destination: '/studio', permanent: true },
      { source: '/seller/:path*', destination: '/studio/:path*', permanent: true },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.shoponeoff.com.au' }],
        destination: 'https://shoponeoff.com.au/:path*',
        permanent: true,
      },
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
