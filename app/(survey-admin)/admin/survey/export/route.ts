import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { csvRows, listResponses } from '@/lib/services/survey';
import { TAG_RE } from '@/lib/survey/questions';

export const dynamic = 'force-dynamic';

/** Quotes a CSV cell and defuses spreadsheet formulas (cells starting with = + - @). */
function cell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

/** All responses as CSV, labels instead of keys; contact columns only with ?contact=1. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') return new NextResponse(null, { status: 404 });
  const p = new URL(request.url).searchParams;
  const tag = (k: string) => (TAG_RE.test(p.get(k) ?? '') ? p.get(k) : null);
  const day = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(p.get(k) ?? '') ? p.get(k) : null);
  const rows = await listResponses({
    src: tag('src'),
    ref: tag('ref'),
    from: day('from'),
    to: day('to'),
  });
  const includeContact = p.get('contact') === '1';
  const lines = csvRows(rows, includeContact).map((r) => r.map(cell).join(','));
  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="maker-survey${includeContact ? '-with-contacts' : ''}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
