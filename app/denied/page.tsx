import { SystemMessage } from '@/components/ui/SystemMessage';

export const metadata = { title: 'Not available' };

export default function DeniedPage() {
  return (
    <SystemMessage
      code="403"
      title="This area is for makers and our team"
      body="Your account doesn’t have access to this page. If you think it should, contact us."
    />
  );
}
