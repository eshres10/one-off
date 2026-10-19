import { permanentRedirect } from 'next/navigation';

/** Measurements moved into Sizes & fit. */
export default function MeasurementsPage() {
  permanentRedirect('/account/sizes');
}
