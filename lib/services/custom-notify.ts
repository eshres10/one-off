import { sql } from '@/lib/db';
import { customEmails } from '@/lib/email/custom';
import { sendEmail } from '@/lib/email/send';
import { fmtDayLong, kindLabel, occasionLabel, pieceTitle } from '@/lib/custom/brief';
import { reportError } from '@/lib/log';
import { sendPushToUser } from '@/lib/push/send';
import { SITE } from '@/lib/site/config';
import { prefsFor } from './notifications';

/** What the emails say about a request. */
export async function requestSummary(requestId: string) {
  const [r] = await sql()<
    {
      id: string;
      number: string;
      kind: string;
      occasion: string | null;
      occasionOther: string | null;
      neededBy: Date | null;
      fabrics: string[];
      buyerEmail: string;
      buyerName: string | null;
      buyerId: string;
      suburb: string | null;
      state: string | null;
      budgetMin: number | null;
      budgetMax: number | null;
    }[]
  >`
    select r.id, r.number, r.kind, r.occasion, r.occasion_other, r.needed_by, r.fabrics, r.suburb, r.state,
      r.budget_min, r.budget_max, r.buyer_id, u.email as buyer_email, u.display_name as buyer_name
    from public.custom_requests r join public.users u on u.id = r.buyer_id where r.id = ${requestId}`;
  if (!r) throw new Error(`No custom request ${requestId}`);
  const brief = {
    kind: r.kind as never,
    fabrics: r.fabrics,
    occasion: r.occasion as never,
    occasionOther: r.occasionOther ?? '',
  };
  return {
    ...r,
    piece: pieceTitle(brief).replace(/^Custom /, ''),
    kindLabel: kindLabel(r.kind),
    occasionLabel: occasionLabel(brief) || 'an occasion',
    neededByLabel: r.neededBy ? fmtDayLong(r.neededBy) : null,
  };
}

async function makerContact(makerId: string) {
  const [m] = await sql()<{ userId: string; email: string; name: string }[]>`
    select m.user_id, u.email, m.display_name as name from public.makers m join public.users u on u.id = m.user_id
    where m.id = ${makerId}`;
  return m ?? null;
}

const quiet = (where: string) => (err: unknown) => reportError(err, { where });

/** "New custom request…" to a picked maker: email, and push where they have it on. */
export async function notifyMakerNewRequest(requestId: string, makerId: string, reminder = false) {
  const [r, m, x] = await Promise.all([
    requestSummary(requestId),
    makerContact(makerId),
    sql()<{ replyBy: Date | null }[]>`
      select reply_by from public.custom_request_recipients where request_id = ${requestId} and maker_id = ${makerId}`,
  ]);
  if (!m) return;
  const replyBy = x[0]?.replyBy;
  await sendEmail(
    customEmails.makerNewRequest(
      m.email,
      {
        id: r.id,
        piece: r.piece,
        occasion: r.occasionLabel,
        neededBy: r.neededByLabel,
        replyBy: replyBy
          ? new Date(replyBy).toLocaleString('en-AU', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
              timeZone: SITE.adminTimeZone,
            })
          : 'the reply-by time',
      },
      reminder,
    ),
  );
  const prefs = await prefsFor(m.userId);
  if (prefs.message.push)
    await sendPushToUser(m.userId, {
      title: 'New custom request',
      body: `${r.piece} for ${r.occasionLabel}${r.neededByLabel ? `, needed by ${r.neededByLabel}` : ''}`,
      url: `/studio/requests?id=${requestId}`,
      tag: `custom-request-${requestId}`,
    }).catch(quiet('push:custom request'));
}

export async function notifyBuyerQuote(requestId: string, makerId: string, updated: boolean) {
  const [r, m, q] = await Promise.all([
    requestSummary(requestId),
    makerContact(makerId),
    sql()<{ price: number }[]>`
      select price from public.custom_quotes where request_id = ${requestId} and maker_id = ${makerId}`,
  ]);
  if (!m || !q[0]) return;
  await sendEmail(
    customEmails.buyerQuote(r.buyerEmail, {
      id: r.id,
      number: r.number,
      maker: m.name,
      priceCents: q[0].price,
      updated,
    }),
  );
  await sendPushToUser(r.buyerId, {
    title: `${m.name} ${updated ? 'updated their quote' : 'sent a quote'}`,
    body: `${(q[0].price / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })}, fabric included. Compare and choose.`,
    url: `/account/requests/${r.number}`,
    tag: `custom-quote-${requestId}`,
  }).catch(quiet('push:custom quote'));
}

export async function notifyBuyerReplies(requestId: string) {
  const r = await requestSummary(requestId);
  const [c] = await sql()<{ asked: number; replied: number }[]>`
    select count(*)::int as asked, count(*) filter (where status <> 'pending' and status <> 'expired')::int as replied
    from public.custom_request_recipients where request_id = ${requestId}`;
  await sendEmail(
    customEmails.buyerReplies(r.buyerEmail, {
      id: r.id,
      number: r.number,
      replied: c?.replied ?? 0,
      asked: c?.asked ?? 0,
    }),
  );
}

export async function notifyBuyerQuoteExpiring(quoteId: string) {
  const [q] = await sql()<{ requestId: string; makerId: string; price: number }[]>`
    select request_id, maker_id, price from public.custom_quotes where id = ${quoteId}`;
  if (!q) return;
  const [r, m] = await Promise.all([requestSummary(q.requestId), makerContact(q.makerId)]);
  if (!m) return;
  await sendEmail(
    customEmails.buyerQuoteExpiring(r.buyerEmail, {
      id: r.id,
      number: r.number,
      maker: m.name,
      priceCents: q.price,
    }),
  );
}

export async function notifyMakerAccepted(orderId: string) {
  const [o] = await sql()<
    {
      makerId: string;
      requestId: string;
      orderNumber: string;
      price: number;
      buyerName: string | null;
    }[]
  >`
    select q.maker_id, q.request_id, o.order_number, q.price, o.buyer_name
    from public.orders o join public.custom_quotes q on q.id = o.custom_quote_id where o.id = ${orderId}`;
  if (!o) return;
  const m = await makerContact(o.makerId);
  if (!m) return;
  await sendEmail(
    customEmails.makerAccepted(m.email, {
      id: o.requestId,
      orderId,
      orderNumber: o.orderNumber,
      priceCents: o.price,
      buyerName: (o.buyerName ?? '').split(/\s+/)[0] || 'The buyer',
    }),
  );
  await sendPushToUser(m.userId, {
    title: 'They accepted your quote',
    body: 'Paid in full and held by Off One. Share a sketch within 3 days.',
    url: `/studio/orders?tab=mto&order=${orderId}`,
    tag: `custom-accepted-${orderId}`,
  }).catch(quiet('push:custom accepted'));
}

export async function notifyMakerNotChosen(requestId: string, makerId: string) {
  const [r, m] = await Promise.all([requestSummary(requestId), makerContact(makerId)]);
  if (!m) return;
  await sendEmail(customEmails.makerNotChosen(m.email, { id: r.id, piece: r.piece }));
}

export async function notifyBuyerMilestone(
  orderId: string,
  milestone: string,
  note: string | null,
) {
  const [o] = await sql()<
    {
      buyerEmail: string;
      buyerId: string | null;
      orderNumber: string;
      maker: string;
      piece: string;
    }[]
  >`
    select o.buyer_email, o.buyer_user_id as buyer_id, o.order_number, m.display_name as maker,
      (select product_title from public.order_items where order_id = o.id order by created_at limit 1) as piece
    from public.orders o join public.custom_quotes q on q.id = o.custom_quote_id join public.makers m on m.id = q.maker_id
    where o.id = ${orderId}`;
  if (!o) return;
  const piece = o.piece.replace(/^Custom /, '');
  await sendEmail(
    customEmails.buyerMilestone(o.buyerEmail, {
      id: orderId,
      orderNumber: o.orderNumber,
      maker: o.maker,
      piece,
      milestone,
      note,
    }),
  );
  if (o.buyerId)
    await sendPushToUser(o.buyerId, {
      title: `${o.maker}: ${milestone}`,
      body: note ?? `An update on your ${piece}.`,
      url: `/account/orders/${o.orderNumber}`,
      tag: `custom-order-${orderId}`,
    }).catch(quiet('push:custom milestone'));
}

export async function notifyTeamHelp(helpRequestId: string) {
  const [h] = await sql()<{ requestId: string; note: string | null }[]>`
    select request_id, note from public.help_requests where id = ${helpRequestId}`;
  if (!h) return;
  const r = await requestSummary(h.requestId);
  await sendEmail(
    customEmails.teamHelp(SITE.supportEmail, {
      id: helpRequestId,
      number: r.number,
      buyer: r.buyerName ?? r.buyerEmail,
      summary:
        `${r.piece} for ${r.occasionLabel}${r.neededByLabel ? `, needed by ${r.neededByLabel}` : ''} · ${r.budgetMin != null ? `A$${r.budgetMin}–${r.budgetMax ?? '+'}` : ''} · ${r.suburb ?? ''} ${r.state ?? ''}`.trim(),
      note: h.note,
    }),
  );
}
