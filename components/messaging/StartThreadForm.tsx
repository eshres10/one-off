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
      <ProtectionNotice />
      <p className="py-10 text-center text-[13px] text-muted-2">
        Ask about fit, fabric, timing or custom options. You don’t need to message before buying.
      </p>
      <div className="border-t border-line bg-surface p-3">
        <Composer
          action={productId ? startThreadAction : startMakerThreadAction}
          hidden={productId ? { productId, variantId: variantId ?? '' } : { makerId: makerId! }}
          presets={Boolean(productId)}
          placeholder="Ask about sizing, fabric, timing…"
        />
      </div>
    </div>
  );
}
