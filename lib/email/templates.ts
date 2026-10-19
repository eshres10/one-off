import { BRAND } from '@/lib/brand';
import { formatPrice } from '@/lib/domain/money';
import { env } from '@/lib/env';
import { RETURNS } from '@/lib/content/returns';
import { TERMS } from '@/lib/studio/terms';
import type { EmailMessage } from './send';
import { renderEmail } from './layout';

const url = (path: string) => `${env().APP_URL}${path}`;
/** Added to the shipped email so buyers know where to go if something's wrong. */
export const CLAIM_SHIPPED_LINE = `Something not right? Report it within ${RETURNS.reportWindowDays} days of delivery from your order page.`;

const sign = `\n\n— ${BRAND.name}\n${BRAND.tagline}`;

export const emails = {
  magicLink: (to: string, link: string): EmailMessage => ({
    to,
    template: 'magic_link',
    subject: `Your ${BRAND.name} sign-in link`,
    text: `Tap the link below to sign in. It expires in 15 minutes.\n\n${link}\n\nIf you didn’t request this, you can ignore this email.${sign}`,
  }),

  orderConfirmation: (
    to: string,
    order: { id: string; orderNumber: string; totalCents: number; shippingSavingCents?: number },
    lines: Array<{
      title: string;
      variant: string;
      maker: string;
      quantity: number;
      estimate: string;
      /** The policy stored on the item: "Return within 14 days…" or "No change-of-mind returns on made-to-order pieces". */
      returns?: string | null;
    }>,
  ): EmailMessage => ({
    to,
    template: 'order_confirmation',
    subject: `Order ${order.orderNumber} confirmed`,
    text:
      `Thank you — your order is confirmed and your makers have been notified.\n\n` +
      lines
        .map(
          (l) =>
            `• ${l.title} (${l.variant}) × ${l.quantity}\n  Ships from ${l.maker} · ${l.estimate}` +
            (l.returns ? `\n  ${l.returns}` : ''),
        )
        .join('\n') +
      `\n\nTotal paid: ${formatPrice(order.totalCents)}` +
      (order.shippingSavingCents
        ? `\nYou saved ${formatPrice(order.shippingSavingCents)} on shipping.`
        : '') +
      `\n\nView your order: ${url(`/orders/${order.id}`)}` +
      `\n\nFaulty or not as described? We’ll make it right. ${RETURNS.aclNote}\nReturns & faults: ${url('/returns')}${sign}`,
    related: { type: 'order', id: order.id },
  }),

  makerNewOrder: (
    to: string,
    o: {
      orderId: string;
      orderNumber: string;
      fulfilmentId: string;
      shipBy: string;
      items: Array<{ title: string; variant: string; quantity: number }>;
      shippingCents: number;
      giftNote: string | null;
      shipTo: string;
      youGetCents: number;
      replyTo: string | null;
    },
  ): EmailMessage => {
    const first = o.items[0]!;
    const more = o.items.length > 1 ? ` + ${o.items.length - 1} more` : '';
    const link = url(`/studio/orders?order=${o.fulfilmentId}`);
    const pieces = o.items.map(
      (i) => `${i.title} · ${i.variant}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`,
    );
    const rows: Array<[string, string]> = [
      ...pieces.map((t, n): [string, string] => [n === 0 ? 'Piece' : '', t]),
      ['Shipping paid', formatPrice(o.shippingCents)],
      ...(o.giftNote ? [['Gift note', o.giftNote] as [string, string]] : []),
      ['Ship to', o.shipTo],
      ['Order', o.orderNumber],
    ];
    const replyLine = o.replyTo ? 'Or reply to this email with the tracking number.' : null;
    return {
      to,
      template: 'maker_new_order',
      subject: `You made a sale · ${first.title}, size ${first.variant}${more}`,
      text:
        `Ship by ${o.shipBy}\n\nYou made a sale!\n\n` +
        rows.map(([k, v]) => `${k || ' '}: ${v}`).join('\n') +
        `\n\nYou get ${formatPrice(o.youGetCents)}\n\nAdd tracking & mark shipped: ${link}` +
        (replyLine ? `\n\n${replyLine}` : '') +
        sign,
      html: renderEmail({
        preheader: `Ship by ${o.shipBy}. You get ${formatPrice(o.youGetCents)}.`,
        eyebrow: `Ship by ${o.shipBy}`,
        heading: 'You made a sale',
        rows,
        total: ['You get', formatPrice(o.youGetCents)],
        button: { label: 'Add tracking & mark shipped', url: link },
        after: replyLine ? [replyLine] : [],
        sellerFooter: true,
      }),
      replyTo: o.replyTo ?? undefined,
      related: { type: 'order', id: o.orderId },
    };
  },

  makerShipByReminder: (
    to: string,
    o: { orderId: string; orderNumber: string; fulfilmentId: string; piece: string; buyer: string },
  ): EmailMessage => {
    const link = url(`/studio/orders?order=${o.fulfilmentId}`);
    return {
      to,
      template: 'maker_ship_by_reminder',
      subject: `Ship today · ${o.piece}`,
      text: `${o.buyer}’s ${o.piece} (${o.orderNumber}) is due to ship today.\n\nAdd tracking & mark shipped: ${link}\n\nRunning late? Message ${o.buyer} from the order so they know.${sign}`,
      html: renderEmail({
        eyebrow: 'Ship by today',
        heading: `${o.piece} is due out today`,
        paragraphs: [`${o.buyer}’s order ${o.orderNumber} is due to ship today.`],
        button: { label: 'Add tracking & mark shipped', url: link },
        after: [`Running late? Message ${o.buyer} from the order so they know.`],
        sellerFooter: true,
      }),
      related: { type: 'order', id: o.orderId },
    };
  },

  trackingReceived: (
    to: string,
    o: {
      orderId: string;
      orderNumber: string;
      fulfilmentId: string;
      carrier: string;
      tracking: string;
    },
  ): EmailMessage => ({
    to,
    template: 'maker_tracking_received',
    subject: `Marked shipped · ${o.orderNumber}`,
    text: `Got it. We’ve added ${o.carrier} tracking ${o.tracking} to ${o.orderNumber}, marked it shipped and let the buyer know.\n\n${url(`/studio/orders?order=${o.fulfilmentId}`)}${sign}`,
    html: renderEmail({
      heading: 'Marked shipped',
      paragraphs: [
        `Got it. We’ve added ${o.carrier} tracking ${o.tracking} to ${o.orderNumber}, marked it shipped and let the buyer know.`,
      ],
      button: { label: 'See the order', url: `/studio/orders?order=${o.fulfilmentId}` },
      sellerFooter: true,
    }),
    related: { type: 'order', id: o.orderId },
  }),

  trackingNotFound: (
    to: string,
    o: { orderNumber: string; fulfilmentId: string },
  ): EmailMessage => ({
    to,
    template: 'maker_tracking_not_found',
    subject: `We couldn’t find a tracking number · ${o.orderNumber}`,
    text: `We couldn’t find a tracking number in your reply about ${o.orderNumber}. Add it in Studio instead: ${url(`/studio/orders?order=${o.fulfilmentId}`)}${sign}`,
    html: renderEmail({
      heading: 'We couldn’t find a tracking number',
      paragraphs: [`Nothing in your reply about ${o.orderNumber} looked like a tracking number.`],
      button: { label: 'Add tracking in Studio', url: `/studio/orders?order=${o.fulfilmentId}` },
      sellerFooter: true,
    }),
  }),

  lowStock: (
    to: string,
    p: { makerId: string; productId: string; title: string; variant: string },
  ): EmailMessage => ({
    to,
    template: 'maker_low_stock',
    subject: `Last one left · ${p.title}, ${p.variant}`,
    text: `You’re down to the last ${p.title} in ${p.variant}. Make more or update stock: ${url(`/studio/listings/${p.productId}`)}${sign}`,
    html: renderEmail({
      heading: 'Last one left',
      paragraphs: [`You’re down to the last ${p.title} in ${p.variant}.`],
      button: { label: 'Update stock', url: `/studio/listings/${p.productId}` },
      sellerFooter: true,
    }),
    related: { type: 'product', id: p.productId },
  }),

  weeklySummary: (
    to: string,
    w: {
      makerId: string;
      shop: string;
      salesCents: number;
      orders: number;
      views: number;
      saves: number;
      topPiece: string | null;
      overdue: number;
    },
  ): EmailMessage => {
    const rows: Array<[string, string]> = [
      [
        'Sales',
        `${formatPrice(w.salesCents)} · ${w.orders} ${w.orders === 1 ? 'order' : 'orders'}`,
      ],
      ['Views', String(w.views)],
      ['Saves', String(w.saves)],
      ['Top piece', w.topPiece ?? '—'],
    ];
    const overdue =
      w.overdue > 0
        ? `${w.overdue} ${w.overdue === 1 ? 'order is' : 'orders are'} past the ship-by date.`
        : null;
    return {
      to,
      template: 'maker_weekly_summary',
      subject: `Your week at ${w.shop}`,
      text:
        `Your last 7 days\n\n` +
        rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
        (overdue ? `\n\n${overdue}` : '') +
        `\n\n${url('/studio')}${sign}`,
      html: renderEmail({
        eyebrow: 'Your last 7 days',
        heading: `Your week at ${w.shop}`,
        paragraphs: overdue ? [overdue] : [],
        rows,
        button: { label: 'Open Studio', url: overdue ? '/studio/orders' : '/studio' },
        sellerFooter: true,
      }),
      related: { type: 'maker', id: w.makerId },
    };
  },

  orderShipped: (
    to: string,
    order: { id: string; orderNumber: string },
    maker: string,
    carrier: string,
    tracking: string,
    trackingLink: string | null = null,
  ): EmailMessage => ({
    to,
    template: 'order_shipped',
    subject: `${maker} has shipped part of order ${order.orderNumber}`,
    text:
      `Good news — ${maker} has shipped your piece.\n\n` +
      (tracking
        ? `Carrier: ${carrier}\nTracking: ${tracking}${trackingLink ? `\nFollow it: ${trackingLink}` : ''}`
        : `${carrier}: ${maker} is bringing it to you.`) +
      `\n\nView your order: ${url(`/orders/${order.id}`)}\n\n${CLAIM_SHIPPED_LINE}${sign}`,
    related: { type: 'order', id: order.id },
  }),

  makingUpdate: (
    to: string,
    order: { id: string; orderNumber: string },
    maker: string,
    piece: string,
    ready: boolean,
  ): EmailMessage => ({
    to,
    template: ready ? 'making_ready' : 'making_sewing',
    subject: ready ? `Your ${piece} is ready` : `${maker} is sewing your ${piece}`,
    text:
      (ready
        ? `${maker} has finished making your ${piece}. It ships next, and you’ll get the tracking link the moment it does.`
        : `${maker} has cut your ${piece} and it’s on the sewing table now.`) +
      `\n\nFollow along: ${url(`/orders/${order.id}`)}${sign}`,
    related: { type: 'order', id: order.id },
  }),

  orderDelivered: (
    to: string,
    order: { id: string; orderNumber: string },
    maker: string,
  ): EmailMessage => ({
    to,
    template: 'order_delivered',
    subject: `Delivered: your piece from ${maker}`,
    text: `Your piece from ${maker} has been marked as delivered. We hope you love it.\n\nOnce you’ve worn it, leave a review to help other shoppers: ${url('/account/orders')}${sign}`,
    related: { type: 'order', id: order.id },
  }),

  newMessage: (
    to: string,
    threadId: string,
    fromName: string,
    productTitle: string | null,
    forMaker: boolean,
  ): EmailMessage => ({
    to,
    template: 'new_message',
    subject: `New message from ${fromName}${productTitle ? ` about ${productTitle}` : ''}`,
    text: `${fromName} sent you a message${productTitle ? ` about “${productTitle}”` : ''}.\n\nReply here: ${url(
      forMaker ? `/studio/messages/${threadId}` : `/messages/${threadId}`,
    )}\n\nFor buyer protection, keep all purchases on ${BRAND.name}.${sign}`,
    related: { type: 'message_thread', id: threadId },
  }),

  /** At most hourly while a maker has unread messages (after the first-message email). */
  messageDigest: (to: string, unreadThreads: number, makerId: string): EmailMessage => ({
    to,
    template: 'message_digest',
    subject: `${unreadThreads} ${unreadThreads === 1 ? 'conversation needs' : 'conversations need'} a reply`,
    text: `Shoppers are waiting to hear from you in ${unreadThreads} ${unreadThreads === 1 ? 'conversation' : 'conversations'}. Replying within 6 hours keeps your shop's reply badge.\n\nOpen your inbox: ${url('/studio/messages')}${sign}`,
    related: { type: 'maker', id: makerId },
  }),

  productQuestion: (
    to: string,
    product: { id: string; slug: string; title: string },
    askerName: string,
    body: string,
  ): EmailMessage => ({
    to,
    template: 'product_question',
    subject: `New question about ${product.title}`,
    text: `${askerName} asked a public question about “${product.title}”:\n\n“${body}”\n\nYour reply shows to everyone viewing the piece. Answer it here: ${url(
      `/products/${product.slug}#questions`,
    )}${sign}`,
    related: { type: 'product', id: product.id },
  }),

  questionAnswered: (
    to: string,
    product: { id: string; slug: string; title: string },
    makerName: string,
  ): EmailMessage => ({
    to,
    template: 'question_answered',
    subject: `${makerName} answered your question`,
    text: `${makerName} replied to your question about “${product.title}”.\n\nSee the answer: ${url(
      `/products/${product.slug}#questions`,
    )}${sign}`,
    related: { type: 'product', id: product.id },
  }),

  commissionRequestMaker: (
    to: string,
    requestId: string,
    garment: string,
    budget: string,
  ): EmailMessage => ({
    to,
    template: 'commission_request_maker',
    subject: `New custom commission request: ${garment}`,
    text: `A buyer has requested a custom ${garment.toLowerCase()} (budget ${budget}).\n\nReview the brief and accept, decline or send a quote: ${url(
      `/studio/commissions/${requestId}`,
    )}\n\nCommissions are a concierge pilot — our team coordinates payment once you and the buyer agree.${sign}`,
    related: { type: 'commission_request', id: requestId },
  }),

  commissionRequestAdmin: (
    to: string,
    requestId: string,
    garment: string,
    assigned: boolean,
  ): EmailMessage => ({
    to,
    template: 'commission_request_admin',
    subject: `Commission request: ${garment}${assigned ? '' : ' (needs a maker)'}`,
    text: `A new commission request was submitted.${assigned ? '' : ' It has no maker yet — please assign one.'}\n\n${url(`/admin/commissions`)}`,
    related: { type: 'commission_request', id: requestId },
  }),

  commissionQuoteBuyer: (
    to: string,
    requestId: string,
    maker: string,
    totalCents: number,
    depositCents: number,
  ): EmailMessage => ({
    to,
    template: 'commission_quote_buyer',
    subject: `${maker} sent you a quote`,
    text: `${maker} has quoted ${formatPrice(totalCents)} for your custom piece (deposit ${formatPrice(depositCents)}).\n\nView the quote: ${url(
      `/account/commissions/${requestId}`,
    )}\n\nAccept it from your messages to pay the deposit securely through checkout.${sign}`,
    related: { type: 'commission_request', id: requestId },
  }),

  commissionStatusBuyer: (
    to: string,
    requestId: string,
    maker: string,
    status: string,
  ): EmailMessage => ({
    to,
    template: 'commission_status_buyer',
    subject: `Update on your custom request with ${maker}`,
    text: `Your custom request is now: ${status}.\n\n${url(`/account/commissions/${requestId}`)}${sign}`,
    related: { type: 'commission_request', id: requestId },
  }),

  makerApproved: (to: string, maker: string): EmailMessage => ({
    to,
    template: 'maker_approved',
    subject: `Welcome to ${BRAND.name}, ${maker}`,
    text: `Your maker profile has been approved. You can now submit listings for review: ${url('/studio/listings')}${sign}`,
  }),

  listingDecision: (
    to: string,
    title: string,
    approved: boolean,
    reason?: string | null,
  ): EmailMessage => ({
    to,
    template: approved ? 'listing_approved' : 'listing_rejected',
    subject: approved ? `“${title}” is live` : `“${title}” needs changes`,
    text: approved
      ? `Your listing “${title}” has been approved and is now visible to shoppers.${sign}`
      : `Your listing “${title}” wasn’t approved yet.${reason ? `\n\nNotes from our team: ${reason}` : ''}\n\nEdit and resubmit: ${url('/studio/listings')}${sign}`,
  }),

  disputeAdmin: (
    to: string,
    disputeId: string,
    amountCents: number,
    reason: string,
  ): EmailMessage => ({
    to,
    template: 'dispute_admin',
    subject: `Dispute opened (${formatPrice(amountCents)})`,
    text: `A payment dispute was opened. Reason: ${reason}.\n\nRespond in the Stripe dashboard. Dispute: ${disputeId}\n${url('/admin/orders')}`,
  }),

  shopInvite: (
    to: string,
    shop: { makerId: string; shop: string; url: string; pieces: number; bannerUrl: string | null },
  ): EmailMessage => {
    const note = `Hi! It’s Ena from One Off. I’ve set up your shop, listed ${shop.pieces} of your pieces and written your maker page, so it’s ready for you to look over.`;
    const after = 'This link is just for you and works for 7 days.';
    return {
      to,
      template: 'shop_invite',
      subject: `Your One Off shop is ready, ${shop.shop}`,
      text: `${note}\n\nSee your shop: ${shop.url}\n\n${after}${sign}`,
      html: renderEmail({
        preheader: 'Take a look, change anything you like, and go live.',
        heading: `Your shop is ready, ${shop.shop}`,
        image: shop.bannerUrl,
        paragraphs: [note],
        button: { label: 'See your shop', url: shop.url },
        after: [after, '— Ena'],
      }),
      related: { type: 'maker', id: shop.makerId },
    };
  },

  accountReady: (
    to: string,
    a: { firstName: string | null; link: string; orderNumber: string },
  ): EmailMessage => {
    const lines = [
      `${a.firstName ? `Hi ${a.firstName}, your` : 'Your'} One Off account is ready. Track every parcel from order ${a.orderNumber}, message makers and save your sizes in one place.`,
      'No password needed: this link signs you in. It works once and expires in 15 minutes; you can always ask for a new one from the sign-in page.',
    ];
    return {
      to,
      template: 'account_ready',
      subject: 'Your One Off account is ready',
      text: `${lines.join('\n\n')}\n\nSign in: ${a.link}${sign}`,
      html: renderEmail({
        heading: 'Your account is ready',
        paragraphs: lines,
        button: { label: 'Track your order', url: a.link },
      }),
    };
  },

  applicationNew: (
    to: string,
    a: {
      makerId: string;
      label: string;
      owner: string;
      place: string;
      instagram: string;
      resubmit: boolean;
    },
  ): EmailMessage => ({
    to,
    template: 'application_new',
    subject: `${a.resubmit ? 'Application resubmitted' : 'New application'}: ${a.label}`,
    text: `${a.owner} applied to sell as ${a.label} (${a.place}).\nInstagram: https://instagram.com/${a.instagram}\n\nReview it: ${url(`/admin/applications/${a.makerId}`)}`,
    related: { type: 'maker', id: a.makerId },
  }),

  applicationReceived: (to: string, label: string): EmailMessage => {
    const lines = [
      `We review every application by hand, usually within ${TERMS.reviewBusinessDays} business days. We’ll email you either way.`,
    ];
    return {
      to,
      template: 'application_received',
      subject: `Thanks, ${label}. Your application is in`,
      text: `${lines.join('\n\n')}\n\nSee your application: ${url('/sell/apply')}${sign}`,
      html: renderEmail({
        heading: `Thanks, ${label}. Your application is in.`,
        paragraphs: lines,
        button: { label: 'See your application', url: '/sell/apply' },
      }),
    };
  },

  applicationApproved: (
    to: string,
    a: { makerId: string; label: string; foundingNumber: number | null },
  ): EmailMessage => {
    const lines = [
      `${a.label} has been approved. It’s time to set up your shop: sign the Seller Agreement, connect payouts, set your shipping and add your first pieces.`,
      ...(a.foundingNumber
        ? [
            `You’re founding maker Nº ${String(a.foundingNumber).padStart(2, '0')}: ${TERMS.foundingCommissionPct}% commission for your first ${TERMS.foundingMonths} months, starting when your shop goes live.`,
          ]
        : []),
      'Your shop goes live once payouts are connected and your first piece is published.',
    ];
    return {
      to,
      template: 'application_approved',
      subject: 'You’re in. Welcome to One Off',
      text: `${lines.join('\n\n')}\n\nSet up your shop: ${url('/studio/setup')}${sign}`,
      html: renderEmail({
        preheader: 'Time to set up your shop.',
        heading: 'You’re in. Welcome to One Off',
        paragraphs: lines,
        button: { label: 'Set up your shop', url: '/studio/setup' },
        sellerFooter: true,
      }),
      related: { type: 'maker', id: a.makerId },
    };
  },

  applicationChanges: (
    to: string,
    a: { makerId: string; label: string; note: string },
  ): EmailMessage => {
    const lines = [
      `Thanks for applying, ${a.label}. Before we decide, we’d like a little more from you:`,
      a.note,
      'Update your application and resubmit it when you’re ready.',
    ];
    return {
      to,
      template: 'application_changes',
      subject: 'A little more about your application',
      text: `${lines.join('\n\n')}\n\nUpdate your application: ${url('/sell/apply')}${sign}`,
      html: renderEmail({
        heading: 'A little more about your application',
        paragraphs: lines,
        button: { label: 'Update your application', url: '/sell/apply' },
      }),
      related: { type: 'maker', id: a.makerId },
    };
  },

  applicationDeclined: (
    to: string,
    a: { makerId: string; label: string; reason: string; reapplyAfter: string },
  ): EmailMessage => {
    const lines = [
      `Thank you for applying to One Off, ${a.label}, and for showing us your work.`,
      `We’re not able to offer you a shop right now. ${a.reason}`,
      `You’re welcome to apply again after ${a.reapplyAfter}.`,
    ];
    return {
      to,
      template: 'application_declined',
      subject: 'About your One Off application',
      text: `${lines.join('\n\n')}${sign}`,
      html: renderEmail({
        heading: 'About your application',
        paragraphs: lines,
      }),
      related: { type: 'maker', id: a.makerId },
    };
  },

  spotCheckUnpublished: (
    to: string,
    p: { makerId: string; title: string; note: string },
  ): EmailMessage => {
    const lines = [
      `We’ve taken ${p.title} off your shop for now. It’s back in your drafts in Studio.`,
      p.note,
      'Make the changes and publish it again, or reply to this email if you have questions.',
    ];
    return {
      to,
      template: 'spot_check_unpublished',
      subject: `About ${p.title}`,
      text: `${lines.join('\n\n')}\n\nOpen your listings: ${url('/studio/listings')}${sign}`,
      html: renderEmail({
        heading: `About ${p.title}`,
        paragraphs: lines,
        button: { label: 'Open your listings', url: '/studio/listings' },
        sellerFooter: true,
      }),
      related: { type: 'maker', id: p.makerId },
    };
  },

  applicationsWaiting: (
    to: string,
    waiting: Array<{ label: string; days: number }>,
  ): EmailMessage => ({
    to,
    template: 'applications_waiting',
    subject: `${waiting.length} ${waiting.length === 1 ? 'application is' : 'applications are'} waiting for review`,
    text:
      `These have waited more than ${TERMS.reviewBusinessDays} business days:\n\n` +
      waiting.map((w) => `• ${w.label} (${w.days} days)`).join('\n') +
      `\n\nReview them: ${url('/admin/applications')}`,
  }),

  supportNew: (
    to: string,
    m: { userId: string; from: string; body: string; topic: string | null },
  ): EmailMessage => ({
    to,
    template: 'support_new',
    subject: `Message from a maker${m.topic ? ` · ${m.topic}` : ''}: ${m.from}`,
    text: `${m.from} wrote:\n\n${m.body}\n\nReply: ${url(`/admin/support/${m.userId}`)}`,
    related: { type: 'user', id: m.userId },
  }),

  supportReply: (to: string, body: string): EmailMessage => ({
    to,
    template: 'support_reply',
    subject: 'One Off replied to your message',
    text: `${body}\n\nSee the conversation in Studio: ${url('/studio/support')}${sign}`,
    html: renderEmail({
      heading: 'One Off replied',
      paragraphs: [body],
      button: { label: 'Open the conversation', url: '/studio/support' },
      sellerFooter: true,
    }),
  }),

  shopBack: (
    to: string,
    shop: { id: string; displayName: string; slug: string },
  ): EmailMessage => ({
    to,
    template: 'shop_back',
    subject: `${shop.displayName} is back`,
    text: `${shop.displayName} is back from their break, and the pieces you saved can be bought again.\n\n${url(`/makers/${shop.slug}`)}${sign}`,
    related: { type: 'maker', id: shop.id },
  }),

  listingRequest: (
    to: string,
    r: { id: string; shop: string; slug: string; photos: number; note: string | null },
  ): EmailMessage => ({
    to,
    template: 'listing_request',
    subject: `${r.shop} sent ${r.photos} ${r.photos === 1 ? 'photo' : 'photos'} to list`,
    text:
      `${r.shop} would like us to list a piece for them.\n\n${r.note ? `Their note: “${r.note}”\n\n` : ''}` +
      `Photos and details: ${url(`/admin/listing-requests`)}\nTheir shop: ${url(`/makers/${r.slug}`)}${sign}`,
    related: { type: 'listing_request', id: r.id },
  }),

  restockAlert: (
    to: string,
    a: { productId: string; slug: string; title: string; size: string; makerName: string },
  ): EmailMessage => ({
    to,
    template: 'restock_alert',
    subject: `Size ${a.size} is back: ${a.title}`,
    text:
      `Good news: ${a.title} by ${a.makerName} is back in size ${a.size}. It may not last long.\n\n` +
      `${url(`/products/${a.slug}`)}\n\nYou asked us to tell you when it came back. We won’t email about this size again unless you ask.${sign}`,
    related: { type: 'product', id: a.productId },
  }),

  payoutSent: (
    to: string,
    makerId: string,
    amount: string,
    bankName: string | null,
    last4: string | null,
  ): EmailMessage => {
    const line = `${amount} is on its way to ${bankName ?? 'your bank'}${last4 ? ` ••${last4}` : ''}`;
    return {
      to,
      template: 'payout_sent',
      subject: line,
      text: `${line}. It usually arrives in one to two business days.\n\nSee your payouts: ${url('/studio/payouts')}${sign}`,
      html: renderEmail({
        heading: line,
        paragraphs: ['It usually arrives in one to two business days.'],
        button: { label: 'See your payouts', url: '/studio/payouts' },
        sellerFooter: true,
      }),
      related: { type: 'maker', id: makerId },
    };
  },

  payoutFailed: (to: string, maker: string): EmailMessage => ({
    to,
    template: 'payout_failed',
    subject: 'Action needed: a payout to your bank failed',
    text: `Hi ${maker}, Stripe couldn’t complete a payout to your bank account. Please check your bank details in your Stripe Express dashboard: ${url(
      '/studio/payouts',
    )}${sign}`,
  }),

  claimReceivedBuyer: (
    to: string,
    claim: {
      id: string;
      productTitle: string;
      makerName: string;
      respondBy: string;
      caseNumber?: string;
    },
  ): EmailMessage => ({
    to,
    template: 'claim_received',
    subject: `We’re on it: your report about ${claim.productTitle}${claim.caseNumber ? ` (${claim.caseNumber})` : ''}`,
    text:
      `Thanks for letting us know. We’ve passed your report and photos to ${claim.makerName}, who will reply by ${claim.respondBy}.\n\n` +
      `They’ll repair, replace or refund it — and if you can’t agree, ${BRAND.name} will step in.\n\n` +
      `Follow your report: ${url(`/account/claims/${claim.id}`)}\n\n${RETURNS.aclNote}${sign}`,
    related: { type: 'return_claim', id: claim.id },
  }),

  claimNewSeller: (
    to: string,
    claim: {
      id: string;
      productTitle: string;
      orderNumber: string;
      reason: string;
      respondBy: string;
      caseNumber?: string;
      outcome?: string;
    },
  ): EmailMessage => ({
    to,
    template: 'claim_new_seller',
    subject: `A customer has reported a problem${claim.caseNumber ? ` (${claim.caseNumber})` : ''}`,
    text:
      `A customer has reported a problem with ${claim.productTitle} (order ${claim.orderNumber}): ${claim.reason}.${claim.outcome ? ` They’ve asked you to ${claim.outcome.toLowerCase()}.` : ''}\n\n` +
      `Please reply by ${claim.respondBy} and propose a repair, replacement or refund. If there’s no reply by then, the claim is escalated to ${BRAND.name}.\n\n` +
      `See the photos and reply: ${url(`/studio/claims/${claim.id}`)}${sign}`,
    related: { type: 'return_claim', id: claim.id },
  }),

  claimNewSupport: (
    to: string,
    claim: {
      id: string;
      productTitle: string;
      orderNumber: string;
      reason: string;
      makerName: string;
    },
  ): EmailMessage => ({
    to,
    template: 'claim_new_support',
    subject: `New claim: ${claim.productTitle} (${claim.makerName}, order ${claim.orderNumber})`,
    text: `Reason: ${claim.reason}\n\n${url(`/admin/claims/${claim.id}`)}`,
    related: { type: 'return_claim', id: claim.id },
  }),

  claimSellerResponded: (
    to: string,
    claim: { id: string; productTitle: string; makerName: string; proposal: string },
  ): EmailMessage => ({
    to,
    template: 'claim_seller_responded',
    subject: `${claim.makerName} replied about ${claim.productTitle}`,
    text: `${claim.makerName} has replied to your report and proposed: ${claim.proposal}.\n\nRead their reply: ${url(`/account/claims/${claim.id}`)}${sign}`,
    related: { type: 'return_claim', id: claim.id },
  }),

  caseDueReminder: (
    to: string,
    c: { id: string; caseNumber: string | null; productTitle: string; dueAt: string },
  ): EmailMessage => ({
    to,
    template: 'case_due_reminder',
    subject: `Reply due today: problem with ${c.productTitle}${c.caseNumber ? ` (${c.caseNumber})` : ''}`,
    text:
      `A customer is waiting to hear from you about ${c.productTitle}. Please reply by ${c.dueAt} with a repair, replacement or refund.\n\n` +
      `If there’s no reply by then, ${BRAND.name} steps in.\n\n` +
      `Reply: ${url(`/studio/claims/${c.id}`)}${sign}`,
    related: { type: 'return_claim', id: c.id },
  }),

  claimEscalated: (
    to: string,
    claim: { id: string; productTitle: string; makerName: string; orderNumber: string },
  ): EmailMessage => ({
    to,
    template: 'claim_escalated',
    subject: `Escalated: no reply from ${claim.makerName} on ${claim.productTitle}`,
    text: `The maker didn’t respond within 2 business days (order ${claim.orderNumber}). Please step in:\n\n${url(`/admin/claims/${claim.id}`)}`,
    related: { type: 'return_claim', id: claim.id },
  }),

  claimResolvedBuyer: (
    to: string,
    claim: { id: string; productTitle: string; outcome: string; note: string | null },
  ): EmailMessage => ({
    to,
    template: 'claim_resolved',
    subject: `Update on your report about ${claim.productTitle}`,
    text:
      `Your report about ${claim.productTitle} has been resolved: ${claim.outcome}.` +
      (claim.note ? `\n\n${claim.note}` : '') +
      `\n\nDetails: ${url(`/account/claims/${claim.id}`)}\n\nNot happy with the outcome? Reply to this email. ${RETURNS.aclNote}${sign}`,
    related: { type: 'return_claim', id: claim.id },
  }),

  returnStartedBuyer: (
    to: string,
    r: {
      id: string;
      number: string;
      orderNumber: string;
      itemId: string;
      productTitle: string;
      makerName: string;
      address: string | null;
      sendWithinDays: number;
      confirmDays: number;
    },
  ): EmailMessage => ({
    to,
    template: 'return_started',
    subject: `Return ${r.number} started: ${r.productTitle}`,
    text:
      `You’ve started a return for ${r.productTitle}.\n\n` +
      (r.address
        ? `Post it to:\n${r.address}\n\n`
        : `${r.makerName} will message you their return address shortly.\n\n`) +
      `1. Send it back with tracking within ${r.sendWithinDays} days, unworn, with tags and original packaging.\n` +
      `2. ${r.makerName} confirms it’s arrived (within ${r.confirmDays} business days).\n` +
      `3. You’re refunded the item price to your original payment method. Original shipping isn’t refunded.\n\n` +
      `Add tracking: ${url(`/account/orders/${r.orderNumber}/return/${r.itemId}`)}${sign}`,
    related: { type: 'return', id: r.id },
  }),

  returnRefundedBuyer: (
    to: string,
    r: { id: string; number: string; productTitle: string; amountCents: number },
  ): EmailMessage => ({
    to,
    template: 'return_refunded',
    subject: `Refund on its way: ${r.productTitle}`,
    text:
      `Your return ${r.number} has arrived, and ${formatPrice(r.amountCents)} is on its way back to how you paid. ` +
      `Banks usually take 5–10 business days to show it.${sign}`,
    related: { type: 'return', id: r.id },
  }),

  returnIncomingMaker: (
    to: string,
    r: {
      id: string;
      number: string;
      productTitle: string;
      variant: string;
      buyerFirstName: string;
      tracking: string | null;
      hasAddress: boolean;
      confirmDays: number;
    },
  ): EmailMessage => ({
    to,
    template: 'return_incoming',
    subject: `A return is on its way to you: ${r.productTitle}`,
    text:
      `${r.buyerFirstName} is returning ${r.productTitle} (${r.variant}), a ready-to-ship piece, within the 14-day change-of-mind window.\n\n` +
      (r.tracking ? `Tracking: ${r.tracking}\n\n` : 'They’ll add tracking when they post it.\n\n') +
      (r.hasAddress
        ? ''
        : `You haven’t added a return address yet. Add one in Shop settings → Returns & care, or message them yours.\n\n`) +
      `When it arrives, mark it received and they’re refunded the item price. If it isn’t unworn with tags, tell us instead and we’ll decide. ` +
      `If tracking shows it delivered and you haven’t confirmed within ${r.confirmDays} business days, it’s refunded automatically.\n\n` +
      `Returns: ${url('/studio/orders?tab=returns')}${sign}`,
    related: { type: 'return', id: r.id },
  }),

  returnAutoRefundedMaker: (
    to: string,
    r: { id: string; number: string; productTitle: string; amountCents: number },
  ): EmailMessage => ({
    to,
    template: 'return_auto_refunded',
    subject: `Return ${r.number} refunded automatically`,
    text:
      `Tracking showed ${r.productTitle} delivered back to you, and it wasn’t confirmed in time, so the buyer has been refunded ${formatPrice(r.amountCents)}. ` +
      `If something’s wrong with it, reply to this email and we’ll look into it.\n\n${url('/studio/orders?tab=returns')}${sign}`,
    related: { type: 'return', id: r.id },
  }),
};
