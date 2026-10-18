'use client';

import { startMakerThreadAction, startThreadAction } from '@/lib/actions/messages';
import { Composer } from './Composer';
import { ProtectionNotice } from './ProtectionNotice';

export function StartThreadForm({
  productId,
  variantId,
  makerId,
}: {
  productId?: string;
  variantId?: string;
  makerId?: string;
}) {
  return (
    <div className="space-y-4">
      <Composer
        action={productId ? startThreadAction : startMakerThreadAction}
        hidden={productId ? { productId, variantId: variantId ?? '' } : { makerId: makerId! }}
        presets={Boolean(productId)}
        placeholder="Ask about fit, fabric, timing or custom options…"
      />
      <ProtectionNotice />
    </div>
  );
}
