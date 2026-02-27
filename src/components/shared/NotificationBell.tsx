'use client';

import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const locale = useLocale();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await fetch('/api/notifications/count');
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.count ?? 0);
        }
      } catch {
        // silently fail
      }
    };

    fetchCount();
    // Poll every 60 seconds
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Link
      href={`/${locale}/client/notifications`}
      className="relative flex items-center justify-center h-9 w-9 rounded-full hover:bg-gold-50 transition-colors"
    >
      <Bell className="h-5 w-5 text-charcoal/70" />
      {unreadCount > 0 && (
        <span className={cn(
          'absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full bg-gold-500 text-white font-bold',
          unreadCount > 9 ? 'h-5 w-5 text-[10px]' : 'h-4 w-4 text-[9px]'
        )}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
