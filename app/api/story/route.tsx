import { ImageResponse } from 'next/og';
import { sql } from '@/lib/db';
import { env } from '@/lib/env';
import { LOGOS } from '@/components/ui/Wordmark';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const W = 1080;
const H = 1920;

/** Absolute URL for an image, using the JPEG copy of WebP uploads (safest for the renderer). */
function absolute(url: string | null): string | null {
  if (!url) return null;
  const jpeg = url.endsWith('.webp') ? url.replace(/\.webp$/, '.jpg') : url;
  return jpeg.startsWith('http') ? jpeg : `${env().APP_URL}${jpeg}`;
}

/**
 * A 1080×1920 Instagram Story image: the cover photo full-bleed, the ONE OFF wordmark in white,
 * and "Founding maker · link in bio" (or the piece's name). ?shop=<maker id> or ?product=<id>.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const shopId = url.searchParams.get('shop');
  const productId = url.searchParams.get('product');
  const uuid = /^[0-9a-f-]{36}$/;
  let photo: string | null = null;
  let title = '';
  let line = '';
  if (productId && uuid.test(productId)) {
    const [p] = await sql()<
      { title: string; shop: string; image: string | null; founding: boolean }[]
    >`
      select p.title, m.display_name as shop, m.founding_number is not null as founding,
        (select public_url from public.product_images i where i.product_id = p.id order by sort_order limit 1) as image
      from public.products p join public.makers m on m.id = p.maker_id where p.id = ${productId}`;
    if (!p) return new Response('Not found', { status: 404 });
    photo = absolute(p.image);
    title = p.title;
    line = `${p.shop} · link in bio`;
  } else if (shopId && uuid.test(shopId)) {
    const [m] = await sql()<
      { name: string; cover: string | null; image: string | null; founding: number | null }[]
    >`
      select m.display_name as name, m.cover_url as cover, m.founding_number as founding,
        (select i.public_url from public.products p join public.product_images i on i.product_id = p.id
          where p.maker_id = m.id and p.status = 'approved' order by p.approved_at desc nulls last, i.sort_order limit 1) as image
      from public.makers m where m.id = ${shopId}`;
    if (!m) return new Response('Not found', { status: 404 });
    photo = absolute(m.image ?? m.cover);
    title = m.name;
    line = m.founding ? 'Founding maker · link in bio' : 'Now on One Off · link in bio';
  } else return new Response('Missing shop or product', { status: 400 });

  const logo = LOGOS.horizontal;
  const wordmark = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${logo.viewBox}"><path fill="#ffffff" fill-rule="evenodd" d="${logo.d}"/></svg>`,
  )}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: 'flex',
          position: 'relative',
          background: '#111111',
        }}
      >
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img
            src={photo}
            width={W}
            height={H}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              objectFit: 'cover',
              width: W,
              height: H,
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: W,
            height: H,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '140px 80px 160px',
            background:
              'linear-gradient(180deg, rgba(17,17,17,0.45) 0%, rgba(17,17,17,0) 30%, rgba(17,17,17,0) 60%, rgba(17,17,17,0.6) 100%)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={wordmark} width={520} height={144} />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              color: '#F6F4F0',
            }}
          >
            <div style={{ fontSize: 76, lineHeight: 1.05, textAlign: 'center' }}>{title}</div>
            <div
              style={{ marginTop: 28, fontSize: 30, letterSpacing: 8, textTransform: 'uppercase' }}
            >
              {line}
            </div>
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { 'Cache-Control': 'private, max-age=300' } },
  );
}
