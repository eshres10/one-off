'use client';

import { useState } from 'react';
import { ShipForm } from '../OrderForms';
import { Sheet } from '../Sheet';

/** "Ship" on a to-ship row: the ship form in a bottom sheet (side panel on desktop). */
export function ShipSheetButton({
  fulfilmentId,
  title,
  sub,
}: {
  fulfilmentId: string;
  title: string;
  sub: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-dark min-h-[44px] shrink-0 px-4 text-[11px] uppercase tracking-label"
        data-testid="ship-button"
      >
        Ship
      </button>
      {open && (
        <Sheet
          testId="ship-sheet"
          onClose={() => setOpen(false)}
          title={
            <div>
              <p className="text-[11px] uppercase tracking-label text-muted-2">{sub}</p>
              <h2 className="mt-1 font-display text-[28px] leading-tight">{title}</h2>
            </div>
          }
        >
          <ShipForm fulfilmentId={fulfilmentId} onShipped={() => setOpen(false)} />
        </Sheet>
      )}
    </>
  );
}
