import { requireAdmin } from '@/lib/auth/session';
import { listWaitlist } from '@/lib/services/waitlist';

export const dynamic = 'force-dynamic';

/** Quotes a CSV cell and defuses spreadsheet formulas (cells starting with = + - @). */
function cell(value: string | null | undefined): string {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  await requireAdmin();
  const param = new URL(request.url).searchParams.get('kind');
  const kind = param === 'maker' || param === 'shopper' ? param : undefined;
  const rows = await listWaitlist(kind);
  const lines = [
    ['email', 'type', 'label', 'instagram', 'source', 'joined'].join(','),
    ...rows.map((r) =>
      [r.email, r.kind, r.name, r.instagram, r.source, new Date(r.createdAt).toISOString()]
        .map(cell)
        .join(','),
    ),
  ];
  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="waitlist${kind ? `-${kind}` : ''}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
