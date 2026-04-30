'use client';

import { useState } from 'react';
import {
  Bell, BellOff, CheckCheck, Loader2,
  CalendarClock, Star, ArrowRight, UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';
import Link from 'next/link';

export interface NotificationItem {
  id: string;
  titleFr: string;
  titleEn: string;
  messageFr: string;
  messageEn: string;
  type: string;
  metadata: string | null;
  read: boolean;
  createdAt: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  BOOKING_REQUEST:          { icon: CalendarClock, color: 'text-amber-600',  bg: 'bg-amber-50' },
  LOYALTY_CLAIM_PENDING:    { icon: Star,          color: 'text-gold-600',   bg: 'bg-gold-50' },
  NEW_CLIENT_REGISTRATION:  { icon: UserPlus,      color: 'text-blue-600',   bg: 'bg-blue-50' },
};

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch { return {}; }
}

interface Props {
  initialNotifications: NotificationItem[];
  locale: string;
}

export default function AdminNotificationsClient({ initialNotifications, locale }: Props) {
  const isFr = locale === 'fr';
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const [markingAll, setMarkingAll] = useState(false);

  const l = {
    title: 'Notifications',
    empty: isFr ? 'Aucune notification' : 'No notifications',
    markAllRead: isFr ? 'Tout marquer comme lu' : 'Mark all as read',
    viewBooking: isFr ? 'Voir la réservation' : 'View booking',
    viewClaim: isFr ? 'Voir les réclamations' : 'View claims',
    viewClient: isFr ? 'Voir la fiche client' : 'View client profile',
  };

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    await fetch('/api/notifications/read-all', { method: 'POST' });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setMarkingAll(false);
  };

  const getTitle = (n: NotificationItem) => isFr ? n.titleFr : n.titleEn;
  const getMessage = (n: NotificationItem) => isFr ? n.messageFr : n.messageEn;
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{unreadCount}</span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={markingAll}>
            {markingAll ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCheck className="h-4 w-4 mr-1" />}
            {l.markAllRead}
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[#F0D98A]/40">
          <BellOff className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">{l.empty}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const cfg = TYPE_CONFIG[n.type] ?? { icon: Bell, color: 'text-gray-500', bg: 'bg-gray-50' };
            const Icon = cfg.icon;
            const meta = parseMetadata(n.metadata);

            return (
              <div
                key={n.id}
                className={`bg-white rounded-xl border p-4 transition-all cursor-pointer ${n.read ? 'border-ivory-200' : 'border-amber-300 bg-amber-50/20'}`}
                onClick={() => { if (!n.read) markRead(n.id); }}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${cfg.bg}`}>
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm ${n.read ? 'font-medium text-charcoal' : 'font-semibold text-charcoal'}`}>
                        {getTitle(n)}
                      </p>
                      {!n.read && <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500 mt-1.5" />}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{getMessage(n)}</p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-gray-400">{formatRelativeTime(new Date(n.createdAt), locale)}</p>
                      {n.type === 'BOOKING_REQUEST' && typeof meta.bookingId === 'string' && meta.bookingId && (
                        <Link
                          href={`/${locale}/admin/reservations/${meta.bookingId}`}
                          onClick={e => e.stopPropagation()}
                          className={`flex items-center gap-1 text-xs font-medium ${cfg.color} hover:underline`}
                        >
                          {l.viewBooking} <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                      {n.type === 'LOYALTY_CLAIM_PENDING' && (
                        <Link
                          href={`/${locale}/admin/loyalty`}
                          onClick={e => e.stopPropagation()}
                          className={`flex items-center gap-1 text-xs font-medium ${cfg.color} hover:underline`}
                        >
                          {l.viewClaim} <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                      {n.type === 'NEW_CLIENT_REGISTRATION' && typeof meta.clientId === 'string' && meta.clientId && (
                        <Link
                          href={`/${locale}/admin/clients/${meta.clientId}`}
                          onClick={e => e.stopPropagation()}
                          className={`flex items-center gap-1 text-xs font-medium ${cfg.color} hover:underline`}
                        >
                          {l.viewClient} <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
