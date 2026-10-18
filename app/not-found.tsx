import { SystemMessage } from '@/components/ui/SystemMessage';

export default function NotFound() {
  return (
    <SystemMessage
      code="404"
      title="This page has moved on"
      body="The piece may have sold, or the link may be out of date."
    />
  );
}
