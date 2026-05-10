// `useFeatureFlag(key)` — hook React.
// Fetch `/api/feature-flags/me` une seule fois par session navigateur, cache
// in-memory 60s + dédoublonnage de la promesse en vol.
// Toujours fail-safe : 401/erreur réseau → `{ enabled: false, loading: false }`.
'use client';

import { useEffect, useState } from 'react';

type FlagsMap = Record<string, boolean>;

interface CacheEntry {
  data: FlagsMap;
  expiresAt: number;
}

const TTL_MS = 60_000;
let cache: CacheEntry | null = null;
let inflight: Promise<FlagsMap> | null = null;

async function fetchFlags(): Promise<FlagsMap> {
  if (cache && cache.expiresAt > Date.now()) return cache.data;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch('/api/feature-flags/me', { credentials: 'same-origin' });
      if (!res.ok) return {};
      const data = (await res.json()) as FlagsMap;
      cache = { data, expiresAt: Date.now() + TTL_MS };
      return data;
    } catch {
      return {};
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Force-refresh le cache (ex: après login / changement de profil). */
export function invalidateFeatureFlagCache(): void {
  cache = null;
}

export function useFeatureFlag(key: string): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState<boolean>(() => cache?.data[key] ?? false);
  const [loading, setLoading] = useState<boolean>(() => !cache || cache.expiresAt <= Date.now());

  useEffect(() => {
    let cancelled = false;
    fetchFlags().then((flags) => {
      if (cancelled) return;
      setEnabled(Boolean(flags[key]));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [key]);

  return { enabled, loading };
}
