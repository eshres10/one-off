import { BRAND } from '@/lib/brand';
import { formatPrice } from '@/lib/domain/money';
import { env } from '@/lib/env';
import { RETURNS } from '@/lib/content/returns';
import type { EmailMessage } from './send';

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
    order: { id: string; orderNumber: string; totalCents: number },
    lines: Array<{
      title: string;
      variant: string;
      maker: string;
      quantity: number;
      estimate: string;
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
            `• ${l.title} (${l.variant}) × ${l.quantity}\n  Ships from ${l.maker} · ${l.estimate}`,
        )
        .join('\n') +
      `\n\nTotal paid: ${formatPrice(order.totalCents)}\n\nView your order: ${url(`/orders/${order.id}`)}` +
      `\n\n${RETURNS.short} ${RETURNS.aclNote}\nReturns & faults: ${url('/returns')}${sign}`,
    related: { type: 'order', id: order.id },
  }),

  makerNewOrder: (
    to: string,
    order: { id: string; orderNumber: string },
    items: Array<{ title: string; variant: string; quantity: number }>,
    netCents: number,
  ): EmailMessage => ({
    to,
    template: 'maker_new_order',
    subject: `New order ${order.orderNumber}`,
    text:
      `You have a new order!\n\n` +
      items.map((i) => `• ${i.title} (${i.variant}) × ${i.quantity}`).join('\n') +
      `\n\nYour payout for this order: ${formatPrice(netCents)} (after commission, including shipping).\n\n` +
      `Prepare and ship it from your dashboard: ${url('/studio/orders')}${sign}`,
    related: { type: 'order', id: order.id },
  }),

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
  ): EmailMessage => ({
    to,
    template: 'shop_invite',
    subject: `Your One Off shop is ready, ${shop.shop}`,
    text:
      `Hi! It’s Ena from One Off. I’ve set up your shop, listed ${shop.pieces} of your pieces and written your maker page, so it’s ready for you to look over.\n\n` +
      `See your shop: ${shop.url}\n\nThis link is just for you and works for 7 days.${sign}`,
    related: { type: 'maker', id: shop.makerId },
  }),

  payoutSent: (
    to: string,
    makerId: string,
    amount: string,
    bankName: string | null,
    last4: string | null,
  ): EmailMessage => ({
    to,
    template: 'payout_sent',
    subject: `${amount} is on its way to ${bankName ?? 'your bank'}${last4 ? ` ••${last4}` : ''}`,
    text: `${amount} is on its way to ${bankName ?? 'your bank'}${last4 ? ` ••${last4}` : ''}. It usually arrives in one to two business days.\n\nSee your payouts: ${url('/studio/payouts')}${sign}`,
    related: { type: 'maker', id: makerId },
  }),

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
    claim: { id: string; productTitle: string; makerName: string; respondBy: string },
  ): EmailMessage => ({
    to,
    template: 'claim_received',
    subject: `We’ve received your report about ${claim.productTitle}`,
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
    },
  ): EmailMessage => ({
    to,
    template: 'claim_new_seller',
    subject: `Problem reported: ${claim.productTitle} (order ${claim.orderNumber})`,
    text:
      `A buyer has reported a problem with ${claim.productTitle}: ${claim.reason}.\n\n` +
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
};
