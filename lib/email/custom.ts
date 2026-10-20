import { BRAND } from '@/lib/brand';
import { formatPrice } from '@/lib/domain/money';
import { env } from '@/lib/env';
import { CUSTOM } from '@/lib/custom/config';
import type { EmailMessage } from './send';

const url = (path: string) => `${env().APP_URL}${path}`;
const sign = `\n\n— ${BRAND.name}\n${BRAND.tagline}`;

/** "Have it made" emails: plain templates until the email designs are built. */
export const customEmails = {
  makerNewRequest: (
    to: string,
    r: { id: string; piece: string; occasion: string; neededBy: string | null; replyBy: string },
    reminder = false,
  ): EmailMessage => ({
    to,
    template: reminder ? 'custom_request_reminder' : 'custom_request_new',
    subject: `${reminder ? 'Reminder: ' : ''}New custom request: ${r.piece} for ${r.occasion}${r.neededBy ? `, needed by ${r.neededBy}` : ''}`,
    text:
      `A buyer picked you from their matches and sent you their brief${r.neededBy ? `: a ${r.piece} for ${r.occasion}, needed by ${r.neededBy}` : ` for a ${r.piece}`}.\n\n` +
      `Reply with a quote, or pass, by ${r.replyBy}. Replying within ${CUSTOM.replyHours} hours keeps your response badge.\n\n` +
      `Open the request: ${url('/studio/requests')}${sign}`,
    related: { type: 'custom_request', id: r.id },
  }),

  buyerQuote: (
    to: string,
    r: { id: string; number: string; maker: string; priceCents: number; updated: boolean },
  ): EmailMessage => ({
    to,
    template: r.updated ? 'custom_quote_updated' : 'custom_quote',
    subject: `${r.maker} ${r.updated ? 'updated their quote' : 'sent a quote'}: ${formatPrice(r.priceCents)}`,
    text:
      `${r.maker} ${r.updated ? 'has updated their quote for' : 'has quoted'} ${formatPrice(r.priceCents)} for your custom piece, fabric included.\n\n` +
      `Compare your quotes and choose: ${url(`/account/requests/${r.number}`)}\n\n` +
      `Quotes stay open for ${CUSTOM.quoteValidDays} days. You only pay when you accept one.${sign}`,
    related: { type: 'custom_request', id: r.id },
  }),

  buyerReplies: (
    to: string,
    r: { id: string; number: string; replied: number; asked: number },
  ): EmailMessage => ({
    to,
    template: 'custom_replies',
    subject:
      r.replied === r.asked
        ? 'All makers have replied'
        : `${r.replied} of ${r.asked} makers replied`,
    text:
      (r.replied === r.asked
        ? `Every maker you asked has replied.`
        : `${r.replied} of the ${r.asked} makers you asked replied within ${CUSTOM.replyHours} hours.`) +
      `\n\nSee your quotes: ${url(`/account/requests/${r.number}`)}` +
      (r.replied === 0
        ? `\n\nNo quotes yet? Widen your brief or ask us to help find someone: ${url(`/account/requests/${r.number}`)}`
        : '') +
      sign,
    related: { type: 'custom_request', id: r.id },
  }),

  buyerQuoteExpiring: (
    to: string,
    r: { id: string; number: string; maker: string; priceCents: number },
  ): EmailMessage => ({
    to,
    template: 'custom_quote_expiring',
    subject: 'Your quote expires tomorrow',
    text: `${r.maker}’s quote of ${formatPrice(r.priceCents)} expires tomorrow.\n\nAccept it, or message them first: ${url(`/account/requests/${r.number}`)}${sign}`,
    related: { type: 'custom_request', id: r.id },
  }),

  makerAccepted: (
    to: string,
    r: { id: string; orderId: string; orderNumber: string; priceCents: number; buyerName: string },
  ): EmailMessage => ({
    to,
    template: 'custom_quote_accepted',
    subject: `They accepted your quote: ${formatPrice(r.priceCents)}`,
    text:
      `${r.buyerName} accepted your quote and has paid in full. ${BRAND.name} holds it: you get ${CUSTOM.advancePct}% when you mark the fabric bought, and the rest 3 days after it arrives.\n\n` +
      `Share a sketch within 3 days, then mark each step as you go: ${url(`/studio/orders?tab=mto&order=${r.orderId}`)}${sign}`,
    related: { type: 'order', id: r.orderId },
  }),

  makerNotChosen: (to: string, r: { id: string; piece: string }): EmailMessage => ({
    to,
    template: 'custom_not_chosen',
    subject: 'They chose another maker this time',
    text: `The buyer who asked about a ${r.piece} went with another maker this time. Thank you for quoting: it keeps your reply time quick, which helps you match.\n\nYour requests: ${url('/studio/requests')}${sign}`,
    related: { type: 'custom_request', id: r.id },
  }),

  buyerMilestone: (
    to: string,
    o: {
      id: string;
      orderNumber: string;
      maker: string;
      piece: string;
      milestone: string;
      note: string | null;
    },
  ): EmailMessage => ({
    to,
    template: 'custom_milestone',
    subject: `${o.maker}: ${o.milestone}`,
    text:
      `${o.maker} has an update on your ${o.piece}: ${o.milestone}.` +
      (o.note ? `\n\n“${o.note}”` : '') +
      `\n\nFollow along: ${url(`/account/orders/${o.orderNumber}`)}${sign}`,
    related: { type: 'order', id: o.id },
  }),

  teamHelp: (
    to: string,
    r: { id: string; number: string; buyer: string; summary: string; note: string | null },
  ): EmailMessage => ({
    to,
    template: 'custom_help_request',
    subject: `Help request ${r.number}: ${r.summary}`,
    text:
      `${r.buyer} asked ${BRAND.name} to help find a maker.\n\n${r.summary}` +
      (r.note ? `\n\nTheir note: “${r.note}”` : '') +
      `\n\nOpen it in admin: ${url(`/admin/help-requests?id=${r.id}`)}`,
    related: { type: 'custom_request', id: r.id },
  }),
};
