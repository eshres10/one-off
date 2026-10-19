import { EmptyState } from '@/components/states/EmptyState';
import { HangerIcon } from '@/components/states/illustrations';

/** Listings before the first piece. Founding and invited makers can send photos instead. */
export function NoPiecesYet({ canSendPhotos }: { canSendPhotos: boolean }) {
  return (
    <EmptyState
      testId="studio-no-pieces"
      icon={<HangerIcon size={88} />}
      title="Add your first piece."
      body="Phone photos in good daylight are perfect. Shoot against a plain wall, front, back and a close-up of the fabric, and we’ll do the rest."
      actions={[
        { label: 'Add a piece', href: '/studio/listings/new', testId: 'first-piece' },
        ...(canSendPhotos
          ? [
              {
                label: 'Send us photos, we’ll list it',
                href: '/studio/listings/send-photos',
                testId: 'send-photos',
              },
            ]
          : []),
      ]}
    />
  );
}
