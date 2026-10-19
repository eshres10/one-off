'use client';

import { useEffect, useState } from 'react';
import { onToast } from '@/lib/studio/toast';
import { Toast } from './Sheet';

/** Shows Studio toasts; lives in the shell so it outlasts the form that raised it. */
export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => onToast(setMessage), []);
  return message ? <Toast key={message} message={message} onDone={() => setMessage(null)} /> : null;
}
