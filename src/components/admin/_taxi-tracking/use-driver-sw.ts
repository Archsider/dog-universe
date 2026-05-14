'use client';

// Driver service worker integration — handles registration of the
// taxi-specific SW (`/sw-driver.js`) and the message channel that
// surfaces the offline GPS queue size to the UI.
//
// The SW is registered with `scope: '/admin/reservations/'` so it
// doesn't interfere with the global PWA SW (`/sw.js`).
//
// The hook polls every 5 s for queue size and also subscribes to
// `QUEUE_UPDATED` push messages from the SW (so we react instantly
// when the SW drains the queue without waiting for the next poll).

import { useEffect, useState } from 'react';
import { logger } from '@/lib/logger';

export function useDriverServiceWorker(): number {
  const [queueSize, setQueueSize] = useState(0);

  // Register the driver SW once at mount. Failure is logged but not
  // surfaced — the tracking button works without offline buffering.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw-driver.js', { scope: '/admin/reservations/' })
      .catch((err) => logger.warn('sw-driver', 'register failed', { error: err }));
  }, []);

  // Poll queue size + listen for SW push updates.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const requestSize = () => {
      const reg = navigator.serviceWorker.controller;
      if (!reg) return;
      const channel = new MessageChannel();
      channel.port1.onmessage = (e) => {
        if (e.data?.type === 'QUEUE_SIZE') {
          setQueueSize(e.data.size || 0);
        }
      };
      reg.postMessage({ type: 'GET_QUEUE_SIZE' }, [channel.port2]);
    };

    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'QUEUE_UPDATED') {
        setQueueSize(e.data.size || 0);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    requestSize();
    const interval = setInterval(requestSize, 5000);
    return () => {
      clearInterval(interval);
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, []);

  return queueSize;
}
