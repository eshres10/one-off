/** Return reasons and statuses, safe to import on the client. */
export const RETURN_REASONS = [
  { value: 'doesnt_fit', label: 'Doesn’t fit' },
  { value: 'not_for_me', label: 'Not for me' },
  { value: 'too_late', label: 'Arrived too late' },
  { value: 'other', label: 'Other' },
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number]['value'];

export type ReturnStatus =
  | 'requested'
  | 'in_transit'
  | 'received'
  | 'refunded'
  | 'rejected'
  | 'cancelled'
  | 'disputed';

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  requested: 'Return started',
  in_transit: 'On its way back',
  received: 'Received',
  refunded: 'Refunded',
  rejected: 'Not accepted',
  cancelled: 'Cancelled',
  disputed: 'With Off One',
};
