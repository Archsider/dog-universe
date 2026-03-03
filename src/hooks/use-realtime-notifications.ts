'use client';

import { useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

/**
 * useRealtimeNotifications
 *
 * Subscribes to new rows on the `Notification` table for the current user
 * via Supabase Realtime. Calls `onNew` whenever a new notification arrives.
 *
 * Requirements (Vercel env vars — set in project settings):
 *   NEXT_PUBLIC_SUPABASE_URL      — same as SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY — the anon/public key (NOT the service role key)
 *
 * Supabase setup required:
 *   1. Enable Realtime on the `Notification` table in Supabase Dashboard
 *      → Database → Replication → supabase_realtime publication → add "Notification"
 *   2. Add RLS policy so users can only see their own notifications:
 *      CREATE POLICY "Users see own notifications"
 *        ON "Notification" FOR SELECT
 *        USING (auth.uid()::text = "userId");
 *
 * Note: This hook uses the Supabase anon key with a filter, so it works
 * without full Supabase Auth — the filter is applied server-side via Realtime.
 */
export function useRealtimeNotifications(userId: string | undefined, onNew: () => void) {
  const stableOnNew = useCallback(onNew, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!userId) return;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      // Realtime not configured — silently skip
      return;
    }

    const client = createClient(supabaseUrl, supabaseAnonKey);

    const channel = client
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'Notification',
          filter: `userId=eq.${userId}`,
        },
        () => {
          stableOnNew();
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [userId, stableOnNew]);
}
