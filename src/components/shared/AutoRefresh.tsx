'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Composant invisible qui rafraîchit les données du Server Component parent
 * en appelant router.refresh() à intervalle régulier.
 */
export default function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
