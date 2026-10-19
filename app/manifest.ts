import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

/** The web app manifest (served at /manifest.webmanifest). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.tagline,
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    background_color: '#F6F4F0',
    theme_color: '#F6F4F0',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      // The monogram padded into the maskable safe zone, so Android's shape masks never clip it.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
